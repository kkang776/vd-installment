import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendAlimtalk } from "@/lib/surem";

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

    let params: Record<string, string | null> = {};

    if (method === "POST") {
      try {
        const formData = await req.formData();
        for (const [key, value] of formData.entries()) {
          params[key] = value as string;
        }
      } catch {
        // formData parsing failed
      }
    }

    // Also check URL search params as fallback
    for (const [key, value] of url.searchParams.entries()) {
      if (!params[key]) params[key] = value;
    }

    const ordr_idxx = params["ordr_idxx"] || null;
    const res_cd = params["res_cd"] || null;
    const tno = params["tno"] || null;
    const app_no = params["app_no"] || null;
    const card_name = params["card_name"] || null;
    const quotaParam = params["quota"] || null;
    const good_mny = params["good_mny"] || null;

    // If no order ID, redirect back to home gracefully
    if (!ordr_idxx) {
      return htmlResponse(`
        if (window.opener) { window.opener.location.reload(); window.close(); }
        else { window.location.replace("/"); }
      `);
    }

    // Find transaction by KCP order number
    let transaction = await prisma.paymentTransaction.findFirst({
      where: { pgAppNo: ordr_idxx },
    });
    if (!transaction) {
      transaction = await prisma.paymentTransaction.findUnique({
        where: { id: ordr_idxx },
      });
    }

    if (!transaction) {
      return htmlResponse(`
        alert("결제 정보를 찾을 수 없습니다.");
        if (window.opener) { window.opener.location.reload(); window.close(); }
        else { window.location.replace("/"); }
      `);
    }

    // ── 이미 처리된 트랜잭션 중복 콜백 방어 ──
    if (transaction.status === "SUCCESS") {
      return htmlResponse(`
        if (window.opener) { window.opener.location.reload(); window.close(); }
        else { window.location.replace("/payment/checkout?orderId=${transaction.orderId}"); }
      `);
    }

    // ── KCP 에러 응답 처리 (사용자 취소 또는 결제 실패) ──
    if (res_cd && res_cd !== "0000") {
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED" },
      });

      return htmlResponse(`
        if (window.opener) { window.opener.location.reload(); window.close(); }
        else { window.location.replace("/payment/checkout?orderId=${transaction.orderId}"); }
      `);
    }

    // ── KCP 승인금액 검증 (위변조 방지) ──
    if (good_mny) {
      const kcpApprovedAmount = parseInt(good_mny, 10);
      if (kcpApprovedAmount !== transaction.amount) {
        console.error("금액 불일치 감지!", {
          kcpApprovedAmount,
          dbRequestedAmount: transaction.amount,
          transactionId: transaction.id,
          orderId: transaction.orderId,
        });
        await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" },
        });
        return htmlResponse(`
          alert("결제 금액 검증에 실패했습니다. 자동으로 취소 처리됩니다.");
          if (window.opener) { window.opener.location.reload(); window.close(); }
          else { window.location.replace("/"); }
        `);
      }
    }

    let resolvedTno = tno;
    let resolvedAppNo = app_no;
    let resolvedCardName = card_name || transaction.cardCompanyName || (transaction.method === "CARD" ? "신용카드" : "가상계좌");
    let resolvedQuota = quotaParam ? parseInt(quotaParam, 10) : null;

    // ── KCP 승인 요청 (enc_data가 있고 tno가 없는 경우) ──
    const enc_data = params["enc_data"];
    const enc_info = params["enc_info"];
    const tran_cd = params["tran_cd"];
    
    if (!resolvedTno && enc_data) {
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
          approveParams.append("req_tx", "pay"); // 승인 요청
          
          console.log("KCP Approval Request:", approveUrl, approveParams.toString());
          
          const approveRes = await fetch(approveUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: approveParams.toString()
          });
          
          const approveText = await approveRes.text();
          console.log("KCP Approval Response:", approveText);
          
          let approveData: any = {};
          try {
            approveData = JSON.parse(approveText);
          } catch {
            const urlParams = new URLSearchParams(approveText);
            approveData = Object.fromEntries(urlParams.entries());
          }
          
          if (approveData.res_cd === "0000" || approveData.Code === "0000") {
            resolvedTno = approveData.tno;
            if (approveData.app_no) resolvedAppNo = approveData.app_no;
            if (approveData.card_name) resolvedCardName = approveData.card_name;
            if (approveData.quota) resolvedQuota = parseInt(approveData.quota, 10);
          } else {
            console.error("KCP Approval Failed:", approveData);
          }
        } catch (e) {
          console.error("KCP Approval Network Error:", e);
        }
      }
    }

    // ── KCP 거래번호 최종 확인 ──
    if (!resolvedTno) {
      console.error("KCP tno(거래번호) 최종 수신 실패 — ordr_idxx:", ordr_idxx);
      if (process.env.NODE_ENV === "production") {
        await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" },
        });
        return htmlResponse(`
          alert("결제 승인 처리 중 오류가 발생했습니다. (거래번호 발급 실패)");
          if (window.opener) { window.opener.location.reload(); window.close(); }
          else { window.location.replace("/"); }
        `);
      }
      resolvedTno = "DEV_" + Date.now().toString();
      resolvedAppNo = "DEV_" + Math.floor(10000000 + Math.random() * 90000000).toString();
    }

    // ── Prisma 트랜잭션으로 원자적 업데이트 ──
    const { orderStatus, order } = await prisma.$transaction(async (tx) => {
      await tx.paymentTransaction.update({
        where: { id: transaction!.id },
        data: {
          status: "SUCCESS",
          pgTid: resolvedTno,
          pgAppNo: resolvedAppNo,
          cardCompanyName: resolvedCardName,
          quota: resolvedQuota,
          pgAppDate: new Date().toISOString(),
        },
      });

      // 전체 주문 결제 현황 확인
      const allTransactions = await tx.paymentTransaction.findMany({
        where: { orderId: transaction!.orderId, status: "SUCCESS" }
      });

      const paidAmount = allTransactions.reduce((acc, t) => acc + (t.amount - t.cancelAmount), 0);
      const currentOrder = await tx.order.findUnique({ where: { id: transaction!.orderId } });

      let newStatus = currentOrder?.status || "PENDING";
      if (currentOrder && paidAmount >= currentOrder.totalAmount) {
        newStatus = "PAID";
        await tx.order.update({
          where: { id: currentOrder.id },
          data: { status: "PAID" },
        });
      } else if (currentOrder && paidAmount > 0) {
        newStatus = "PARTIALLY_PAID";
        await tx.order.update({
          where: { id: currentOrder.id },
          data: { status: "PARTIALLY_PAID" },
        });
      }

      return { orderStatus: newStatus, order: currentOrder };
    });

    // ── 전액 결제 완료 시 알림톡 발송 ──
    if (orderStatus === "PAID" && order) {
      try {
        console.log("Triggering Alimtalk for order:", order.id, order.ordererPhone);
        const alimtalkResult = await sendAlimtalk({
          orderId: order.id,
          ordererPhone: order.ordererPhone,
          ordererName: order.ordererName,
          productName: order.productName,
          quantity: order.quantity,
          totalAmount: order.totalAmount,
        });
        console.log("Alimtalk result:", alimtalkResult);
      } catch (err) {
        console.error("Alimtalk send error:", err);
      }
    }

    return htmlResponse(`
      if (window.opener) { window.opener.location.reload(); window.close(); }
      else { window.location.replace("/payment/checkout?orderId=${transaction.orderId}"); }
    `);
  } catch (error: any) {
    console.error("Split KCP callback error:", error);
    return htmlResponse(`
      if (window.opener) { window.opener.location.reload(); window.close(); }
      else { window.history.back(); }
    `);
  }
}
