import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { orderId, amount, method, isMobile, cardCompanyName } = await request.json();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" });
    }

    // Create a pending transaction
    const transaction = await prisma.paymentTransaction.create({
      data: {
        orderId,
        amount,
        method,
        status: "PENDING",
        cardCompanyName: cardCompanyName || null,
      }
    });

    let approval_key = "";
    let PayUrl = "";

    // KCP Mobile Trade Registration
    if (isMobile) {
      try {
        const protocol = request.headers.get("x-forwarded-proto") || "http";
        const host = request.headers.get("host");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

        const tradeRegData = {
          site_cd: process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000",
          ordr_idxx: transaction.id, // Using transaction ID for KCP to track split payments
          good_mny: amount.toString(),
          good_name: order.productName,
          pay_method: method === "CARD" ? "CARD" : "VCNT",
          Ret_URL: `${baseUrl}/api/payment/split-callback`,
        };

        const tradeRegRes = await fetch(
          process.env.KCP_TRADE_REG_URL || "https://testsmpay.kcp.co.kr/trade/register.do",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(tradeRegData as any).toString(),
          }
        );

        const rawResText = await tradeRegRes.text();
        const tradeRegResult = JSON.parse(rawResText);

        if (tradeRegResult.Code === "0000") {
          approval_key = tradeRegResult.approvalKey;
          PayUrl = tradeRegResult.PayUrl;
        } else {
          return NextResponse.json({
            success: false,
            error: `KCP 거래 등록 실패: [${tradeRegResult.Code}] ${tradeRegResult.Message}`,
          });
        }
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `KCP 서버 통신 오류: ${e.message}` });
      }
    }

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
      approval_key,
      PayUrl,
    });
  } catch (error: any) {
    console.error("Split request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
