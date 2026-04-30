import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const ordererName = formData.get("ordererName") as string;
    const ordererPhone = formData.get("ordererPhone") as string;
    const businessName = formData.get("businessName") as string | null;
    const businessRegNumber = formData.get("businessRegNumber") as string | null;
    const shippingAddress = formData.get("shippingAddress") as string;
    const shippingDetail = formData.get("shippingDetail") as string | null;
    const requestNotes = formData.get("requestNotes") as string | null;
    
    const productName = formData.get("productName") as string;
    const quantity = parseInt(formData.get("quantity") as string, 10);
    const contractMonths = parseInt(formData.get("contractMonths") as string, 10);
    const monthlyFee = parseInt(formData.get("monthlyFee") as string, 10);
    const totalAmount = parseInt(formData.get("totalAmount") as string, 10);

    const file = formData.get("businessRegCertFile") as File | null;
    let businessRegCertUrl = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || "application/octet-stream";
      businessRegCertUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
    
    const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        ordererName,
        ordererPhone,
        businessName,
        businessRegNumber,
        businessRegCertUrl,
        shippingAddress,
        shippingDetail,
        requestNotes,
        productName,
        quantity,
        contractMonths,
        monthlyFee,
        totalAmount,
        status: "결제 대기", // Wait for PG payment
      },
    });

    // 2. KCP Mobile Trade Registration (거래등록)
    const isMobile = formData.get("isMobile") === "true";
    let approval_key = "";
    let PayUrl = "";

    if (isMobile) {
      try {
        const protocol = request.headers.get("x-forwarded-proto") || "http";
        const host = request.headers.get("host");
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

        const tradeRegData = {
          site_cd: process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000",
          ordr_idxx: orderNumber,
          good_mny: totalAmount.toString(),
          good_name: productName,
          pay_method: "CARD",
          Ret_URL: `${baseUrl}/api/payment/callback`,
        };

        const tradeRegRes = await fetch(
          process.env.KCP_TRADE_REG_URL || "https://testsmpay.kcp.co.kr/trade/register.do",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tradeRegData),
          }
        );

        const tradeRegResult = await tradeRegRes.json();
        if (tradeRegResult.res_cd === "0000") {
          approval_key = tradeRegResult.approval_key;
          PayUrl = tradeRegResult.PayUrl;
        } else {
          console.error("KCP Trade Registration Failed:", tradeRegResult);
        }
      } catch (e) {
        console.error("KCP Trade Registration Error:", e);
      }
    }

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber,
      approval_key,
      PayUrl,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ success: false, error: "Failed to create order" }, { status: 500 });
  }
}
