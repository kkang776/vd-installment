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

        const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000";
        const isTest = site_cd === "T0000" || site_cd.startsWith("T");
        const defaultTradeRegUrl = isTest 
          ? "https://testsmpay.kcp.co.kr/trade/register.do" 
          : "https://smpay.kcp.co.kr/trade/register.do";

        const kcpOrderNo = transaction.id.toUpperCase();
        const tradeRegData = {
          site_cd,
          req_tx: "pay",
          ordr_idxx: kcpOrderNo,
          good_mny: amount.toString(),
          good_name: order.productName,
          pay_method: method === "CARD" ? "CARD" : "VCNT",
          currency: "410",
          shop_name: "브이디로보틱스",
          buyr_name: order.ordererName,
          buyr_tel1: order.ordererPhone,
          buyr_mail: "customer@vdrobotics.co.kr",
          Ret_URL: `${baseUrl}/api/payment/split-callback`,
          encoding_trans: "UTF-8",
        };

        console.log("KCP Trade Reg Target URL:", process.env.KCP_TRADE_REG_URL || defaultTradeRegUrl);
        console.log("KCP Trade Reg Request Body:", tradeRegData);

        const tradeRegRes = await fetch(
          process.env.KCP_TRADE_REG_URL || defaultTradeRegUrl,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams(tradeRegData as any).toString(),
          }
        );

        const rawResText = await tradeRegRes.text();
        console.log("KCP Trade Reg Raw Response:", rawResText);

        let tradeRegResult: any = {};
        try {
          tradeRegResult = JSON.parse(rawResText);
        } catch (parseError) {
          console.error("KCP Response JSON Parse Error:", parseError);
          return NextResponse.json({
            success: false,
            error: `KCP 응답 해석 실패 (JSON 파싱 오류): ${rawResText}`,
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
              url: process.env.KCP_TRADE_REG_URL || defaultTradeRegUrl,
              request: tradeRegData,
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
      approval_key,
      PayUrl,
    });
  } catch (error: any) {
    console.error("Split request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
