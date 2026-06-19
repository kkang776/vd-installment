import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleCallback(req);
}

export async function POST(req: Request) {
  return handleCallback(req);
}

// ── HTML 응답 유틸 (XSS 방지) ──
function htmlResponse(script: string) {
  return new NextResponse(`
    <html>
      <head><meta charset="utf-8"></head>
      <body><script>${script}</script></body>
    </html>
  `, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleCallback(req: Request) {
  try {
    const url = new URL(req.url);
    const method = req.method;

    // ── 파라미터 파싱 (formData를 한 번만 읽기) ──
    let params: Record<string, string | null> = {};

    if (method === "POST") {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        params[key] = value as string;
      }
      console.log("KCP Payment Callback Full Data (POST):", params);
    } else {
      for (const [key, value] of url.searchParams.entries()) {
        params[key] = value;
      }
      console.log("KCP Payment Callback Full Data (GET):", params);
    }

    const ordr_idxx = params["ordr_idxx"] || null;
    const res_cd = params["res_cd"] || null;
    const res_msg = params["res_msg"] || null;

    if (!ordr_idxx) {
      return NextResponse.json({ success: false, message: "주문번호가 누락되었습니다." }, { status: 400 });
    }

    // 2. DB에서 원주문 정보 조회
    const order = await prisma.order.findUnique({
      where: { orderNumber: ordr_idxx },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "주문 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // 3. KCP 응답 코드 확인
    const kcpResCd = res_cd || "0000";
    const kcpResMsg = res_msg || "정상처리";
    let kcpTno = params["tno"] || null;
    
    // ── KCP 승인 요청 (enc_data가 있고 tno가 없는 경우) ──
    const enc_data = params["enc_data"];
    const enc_info = params["enc_info"];
    const tran_cd = params["tran_cd"];
    
    if (!kcpTno && enc_data) {
      const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE;
      const site_key = process.env.KCP_SITE_KEY;
      if (site_cd && site_key) {
        try {
          const targetUrl = process.env.KCP_TRADE_REG_URL || "https://testsmpay.kcp.co.kr/trade/register.do";
          const approveUrl = targetUrl.replace("/trade/register.do", "/trade/approve.do");
          
          const approveParams = new URLSearchParams();
          approveParams.append("site_cd", site_cd);
          approveParams.append("site_key", site_key);
          approveParams.append("ordr_idxx", ordr_idxx);
          approveParams.append("enc_data", enc_data);
          approveParams.append("enc_info", enc_info || "");
          if (tran_cd) approveParams.append("tran_cd", tran_cd);
          approveParams.append("req_tx", "pay");
          
          const approveRes = await fetch(approveUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: approveParams.toString()
          });
          
          const approveText = await approveRes.text();
          let approveData: any = {};
          try { approveData = JSON.parse(approveText); } 
          catch { approveData = Object.fromEntries(new URLSearchParams(approveText).entries()); }
          
          if (approveData.res_cd === "0000" || approveData.Code === "0000") {
            kcpTno = approveData.tno;
          }
        } catch (e) {
          console.error("KCP Approval Error:", e);
        }
      }
    }

    if (kcpResCd === "0000") {
      // 결제 성공 — 주문 상태 업데이트
      // Note: pgTid는 PaymentTransaction 모델에 있으므로, Order의 adminNotes에 참조 기록
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          status: "결제 완료",
          adminNotes: kcpTno ? `[KCP TID: ${kcpTno}]` : null,
        },
      });

      // XSS 방지: 변수를 JS 문자열에 직접 삽입하지 않음
      const safeOrderId = encodeURIComponent(ordr_idxx);
      return htmlResponse(`
        alert("결제가 정상적으로 완료되었습니다.");
        if (window.opener) {
          window.opener.location.replace("/?payment=success&orderId=" + decodeURIComponent("${safeOrderId}"));
          window.close();
        } else {
          window.location.replace("/?payment=success&orderId=" + decodeURIComponent("${safeOrderId}"));
        }
      `);
    } else {
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          adminNotes: `[결제 실패] 코드: ${kcpResCd}, 사유: ${kcpResMsg}`
        },
      });

      return htmlResponse(`
        alert("결제 처리 중 오류가 발생했습니다. 다시 시도해주세요.");
        if (window.opener) window.close();
        else window.location.replace("/");
      `);
    }

  } catch (error: any) {
    console.error("KCP callback error:", error);
    return htmlResponse(`
      alert("결제 처리 중 오류가 발생했습니다.");
      if (window.opener) window.close();
      else window.location.replace("/");
    `);
  }
}
