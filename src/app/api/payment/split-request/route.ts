import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { orderId, amount, method, cardCompanyName } = await request.json();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" });
    }

    // Generate KCP-friendly order number (alphanumeric, short, unique)
    const kcpOrderNo = `${order.orderNumber.replace(/[^A-Z0-9]/gi, "")}_${Date.now().toString(36).toUpperCase()}`;

    // Create a pending transaction
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

    // Call KCP Trade Registration using exact JSON format that previously worked
    try {
      const protocol = request.headers.get("x-forwarded-proto") || "https";
      const host = request.headers.get("host");
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

      const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000";
      const isTest = site_cd === "T0000" || site_cd.startsWith("T");
      const defaultTradeRegUrl = isTest 
        ? "https://testsmpay.kcp.co.kr/trade/register.do" 
        : "https://smpay.kcp.co.kr/trade/register.do";

      const tradeRegData = {
        site_cd,
        ordr_idxx: kcpOrderNo,
        good_mny: amount.toString(),
        good_name: order.productName,
        pay_method: method === "CARD" ? "CARD" : "VCNT",
        Ret_URL: `${baseUrl}/api/payment/split-callback`,
      };

      console.log("KCP Trade Registration Request (JSON):", tradeRegData);

      const targetUrl = process.env.KCP_TRADE_REG_URL || defaultTradeRegUrl;
      const tradeRegRes = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" }, // EXACT MATCH to working old code
        body: JSON.stringify(tradeRegData), // EXACT MATCH to working old code
      });

      const rawResText = await tradeRegRes.text();
      console.log("KCP Trade Registration Raw Response:", rawResText);

      let tradeRegResult: any = {};
      try {
        tradeRegResult = JSON.parse(rawResText);
      } catch (e) {
        console.error("KCP Response is not JSON:", rawResText);
        return NextResponse.json({
          success: false,
          error: `KCP 서버 응답 형식이 올바르지 않습니다: ${rawResText.substring(0, 200)}`,
        });
      }

      if (tradeRegResult.Code === "0000") {
        approval_key = tradeRegResult.approvalKey;
        PayUrl = tradeRegResult.PayUrl;
      } else {
        return NextResponse.json({
          success: false,
          error: `KCP 거래 등록 실패: [${tradeRegResult.Code}] ${tradeRegResult.Message || "상세 사유 없음"}`,
          debug: {
            url: targetUrl,
            request: tradeRegData,
            response: tradeRegResult
          }
        });
      }
    } catch (e: any) {
      console.error("KCP connection exception:", e);
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
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
