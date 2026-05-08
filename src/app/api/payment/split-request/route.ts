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

    // Generate KCP-friendly order number (alphanumeric, short, unique)
    const kcpOrderNo = `${order.orderNumber.replace(/[^A-Z0-9]/gi, "")}_${Date.now().toString(36).toUpperCase()}`;

    // Create a pending transaction with pgAppNo storing the KCP order number
    const transaction = await prisma.paymentTransaction.create({
      data: {
        orderId,
        amount,
        method,
        status: "PENDING",
        cardCompanyName: cardCompanyName || null,
        pgAppNo: kcpOrderNo, // Store KCP order number for callback matching
      }
    });

    let approval_key = "";
    let PayUrl = "";

    // KCP Mobile Trade Registration
    if (isMobile) {
      try {
        const protocol = request.headers.get("x-forwarded-proto") || "https";
        const host = request.headers.get("host");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

        const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000";
        const isTest = site_cd === "T0000" || site_cd.startsWith("T");
        const defaultTradeRegUrl = isTest 
          ? "https://testsmpay.kcp.co.kr/trade/register.do" 
          : "https://smpay.kcp.co.kr/trade/register.do";

        // Use URLSearchParams with .append() - matching old working pattern
        const tradeRegParams = new URLSearchParams();
        tradeRegParams.append("site_cd", site_cd);
        tradeRegParams.append("ordr_idxx", kcpOrderNo);
        tradeRegParams.append("good_mny", amount.toString());
        tradeRegParams.append("good_name", order.productName);
        tradeRegParams.append("pay_method", method === "CARD" ? "CARD" : "VCNT");
        tradeRegParams.append("Ret_URL", `${baseUrl}/api/payment/split-callback`);

        const targetUrl = process.env.KCP_TRADE_REG_URL || defaultTradeRegUrl;
        console.log("KCP Trade Reg URL:", targetUrl);
        console.log("KCP Trade Reg Params:", Object.fromEntries(tradeRegParams.entries()));

        const tradeRegRes = await fetch(targetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: tradeRegParams.toString(),
        });

        const rawResText = await tradeRegRes.text();
        console.log("KCP Trade Reg Response:", rawResText);

        let tradeRegResult: any = {};
        try {
          tradeRegResult = JSON.parse(rawResText);
        } catch (parseError) {
          console.error("KCP Response JSON Parse Error:", parseError);
          return NextResponse.json({
            success: false,
            error: `KCP 응답 파싱 실패: ${rawResText.substring(0, 200)}`,
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
              request: Object.fromEntries(tradeRegParams.entries()),
              response: tradeRegResult
            }
          });
        }
      } catch (e: any) {
        console.error("KCP connection exception:", e);
        return NextResponse.json({ success: false, error: `KCP 서버 연결 실패: ${e.message}` });
      }
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
