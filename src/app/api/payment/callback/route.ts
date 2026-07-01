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

    // ── 파라미터 파싱 ──
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

    // DB에서 원주문 정보 조회
    const order = await prisma.order.findUnique({
      where: { orderNumber: ordr_idxx },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "주문 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // KCP 응답 코드 확인
    const kcpResCd = res_cd || "0000";
    const kcpResMsg = res_msg || "정상처리";
    let kcpTno = params["tno"] || null;
    const enc_data = params["enc_data"];
    const enc_info = params["enc_info"];
    const tran_cd = params["tran_cd"];

    // KCP "인증결과 수신형" 상태인 경우: tno가 오지 않으므로 서버사이드 승인(REST API) 요청
    if (!kcpTno && enc_data) {
      if (process.env.KCP_CERT_PEM) {
        console.log(`KCP REST API 승인 요청 시도 — ordr_idxx: ${ordr_idxx}`);
        const { executeKcpApproval } = await import("@/lib/kcp-approval");
        const approvalResult = await executeKcpApproval({
          ordr_idxx,
          ordr_mony: order.totalAmount,
          enc_data,
          enc_info: enc_info || "",
          tran_cd: tran_cd || undefined
        });

        if (approvalResult.success && approvalResult.tno) {
          kcpTno = approvalResult.tno;
        } else {
          console.error(`KCP REST API 승인 실패 — ${approvalResult.message}`);
          return htmlResponse(`
            alert("거래번호 수신 및 결제 승인에 실패했습니다.\\n${approvalResult.message}");
            if (window.opener) window.close();
            else window.location.href = "/";
          `);
        }
      } else {
        console.warn(`KCP_CERT_PEM 환경변수가 없어 REST API 승인을 시도하지 못했습니다.`);
      }
    }

    if (!kcpTno) {
      console.error(`KCP tno(거래번호) 미수신 및 승인 불가 — ordr_idxx: ${ordr_idxx}, res_cd: ${kcpResCd}`);
      return htmlResponse(`
        alert("결제 승인 처리 중 오류가 발생했습니다. (거래번호 발급 실패)");
        if (window.opener) window.close();
        else window.location.href = "/";
      `);
    }

    if (kcpResCd === "0000") {
      // 결제 성공 — 주문 상태 업데이트
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          status: "결제 완료",
          adminNotes: kcpTno ? `[KCP TID: ${kcpTno}]` : "[KCP 인증완료 - tno 미수신]",
        },
      });

      const safeOrderId = encodeURIComponent(ordr_idxx);
      return htmlResponse(`
        alert("결제가 정상적으로 완료되었습니다.");
        if (window.opener) {
          window.opener.location.replace("/?payment=success&orderId=" + decodeURIComponent("${safeOrderId}"));
          window.close();
        } else {
          window.location.href = "/?payment=success&orderId=" + decodeURIComponent("${safeOrderId}");
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
        else window.location.href = "/";
      `);
    }

  } catch (error: any) {
    console.error("KCP callback error:", error);
    return htmlResponse(`
      alert("결제 처리 중 오류가 발생했습니다.");
      if (window.opener) window.close();
      else window.location.href = "/";
    `);
  }
}
