import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { orderId, amount, method, cardCompanyName } = await request.json();

    // ── 주문 조회 ──
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" });
    }

    // ── KCP 상점코드 확인 (운영 시 필수, 개발 시 T0000 fallback) ──
    const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || (process.env.NODE_ENV === "production" ? "" : "T0000");
    if (!site_cd) {
      console.error("NEXT_PUBLIC_KCP_SITE_CODE 환경변수 미설정 (운영 환경)");
      return NextResponse.json({ success: false, error: "결제 시스템 설정 오류" }, { status: 500 });
    }

    // ── 금액 검증 ──
    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: "유효하지 않은 결제 금액입니다." }, { status: 400 });
    }

    // ── 이미 결제된/진행 중인 금액 계산 ──
    const existingTransactions = await prisma.paymentTransaction.findMany({
      where: { orderId, status: { in: ["PENDING", "SUCCESS"] } }
    });
    const alreadyPaidOrPending = existingTransactions.reduce((acc, t) => acc + t.amount, 0);

    if (alreadyPaidOrPending + amount > order.totalAmount) {
      return NextResponse.json({
        success: false,
        error: `결제 금액 초과: 남은 금액 ${order.totalAmount - alreadyPaidOrPending}원`
      }, { status: 400 });
    }

    // ── 동일 주문에 대해 PENDING 트랜잭션이 이미 있으면 삭제 후 새로 생성 (취소 시 재시도 가능하게) ──
    const existingPending = await prisma.paymentTransaction.findFirst({
      where: { orderId, status: "PENDING" },
    });
    if (existingPending) {
      await prisma.paymentTransaction.delete({ where: { id: existingPending.id } });
    }

    // ── KCP 주문번호 생성 ──
    const kcpOrderNo = `${order.orderNumber.replace(/[^A-Z0-9]/gi, "")}_${Date.now().toString(36).toUpperCase()}`;

    // ── PENDING 트랜잭션 생성 ──
    const transaction = await prisma.paymentTransaction.create({
      data: {
        orderId,
        amount,
        method,
        status: "PENDING",
        cardCompanyName: cardCompanyName || null,
        pgAppNo: kcpOrderNo,
      }
    });

    let approval_key = "";
    let PayUrl = "";

    // ── KCP 거래 등록 ──
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
      if (!baseUrl) {
        const protocol = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("host");
        console.warn("NEXT_PUBLIC_BASE_URL 미설정, 헤더 기반 추론:", `${protocol}://${host}`);
      }
      const resolvedBaseUrl = baseUrl || `${request.headers.get("x-forwarded-proto") || "https"}://${request.headers.get("host")}`;

      // 환경변수에서 거래등록 URL 가져오기 (테스트/운영 분기)
      const targetUrl = process.env.KCP_TRADE_REG_URL || "https://testsmpay.kcp.co.kr/trade/register.do";

      const tradeRegData = {
        site_cd,
        ordr_idxx: kcpOrderNo,
        good_mny: amount.toString(),
        good_name: order.productName,
        pay_method: method === "CARD" ? "CARD" : "VCNT",
        charset: "utf-8",
        Ret_URL: `${resolvedBaseUrl}/api/payment/split-callback`,
      };

      console.log("KCP Trade Registration Request:", { url: targetUrl, data: tradeRegData });

      const tradeRegRes = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(tradeRegData),
      });

      const rawResText = await tradeRegRes.text();
      console.log("KCP Trade Registration Response:", rawResText);

      let tradeRegResult: any = {};
      try {
        tradeRegResult = JSON.parse(rawResText);
      } catch (e) {
        console.error("KCP Response is not JSON:", rawResText);
        // 실패 시 PENDING 트랜잭션 정리
        await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({
          success: false,
          error: `KCP 서버 응답 형식이 올바르지 않습니다.`,
        });
      }

      if (tradeRegResult.Code === "0000") {
        approval_key = tradeRegResult.approvalKey;
        PayUrl = tradeRegResult.PayUrl;
      } else {
        // 실패 시 PENDING 트랜잭션 정리
        await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({
          success: false,
          error: `KCP 거래 등록 실패: [${tradeRegResult.Code}] ${tradeRegResult.Message || "상세 사유 없음"}`,
        });
      }
    } catch (e: any) {
      console.error("KCP connection exception:", e);
      // 실패 시 PENDING 트랜잭션 정리
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED" },
      });
      return NextResponse.json({ success: false, error: `KCP 서버 연결 실패: ${e.message}` });
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
      kcpOrderNo,
      approval_key,
      PayUrl,
    });
  } catch (error: any) {
    console.error("Split request error:", error);
    return NextResponse.json({ success: false, error: "결제 요청 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
