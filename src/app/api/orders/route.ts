import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/prisma";

// ── 서버사이드 상품 정보 (위변조 방지용) ──
const PRODUCTS: Record<string, { monthlyPrice: number; contractMonths: number }> = {
  "클리버 A1 Pro": { monthlyPrice: 218900, contractMonths: 36 },
  "클리버 A1 Lite": { monthlyPrice: 185900, contractMonths: 36 },
};

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

    // ── 필수 필드 검증 ──
    if (!ordererName || !ordererPhone || !shippingAddress || !productName) {
      return NextResponse.json({ success: false, error: "필수 입력 항목이 누락되었습니다." }, { status: 400 });
    }

    // ── 서버사이드 금액 위변조 검증 ──
    const product = PRODUCTS[productName];
    if (!product) {
      return NextResponse.json({ success: false, error: "유효하지 않은 상품입니다." }, { status: 400 });
    }

    if (quantity <= 0 || quantity > 100) {
      return NextResponse.json({ success: false, error: "유효하지 않은 수량입니다." }, { status: 400 });
    }

    if (contractMonths !== product.contractMonths) {
      return NextResponse.json({ success: false, error: "유효하지 않은 계약 기간입니다." }, { status: 400 });
    }

    const expectedMonthly = product.monthlyPrice;
    const expectedTotal = expectedMonthly * quantity * product.contractMonths;

    if (monthlyFee !== expectedMonthly) {
      console.error("월 할부금 위변조 감지:", { submitted: monthlyFee, expected: expectedMonthly, productName });
      return NextResponse.json({ success: false, error: "결제 금액이 올바르지 않습니다." }, { status: 400 });
    }

    if (totalAmount !== expectedTotal) {
      console.error("총액 위변조 감지:", { submitted: totalAmount, expected: expectedTotal, productName, quantity });
      return NextResponse.json({ success: false, error: "결제 금액이 올바르지 않습니다." }, { status: 400 });
    }

    // ── 사업자등록증 파일 처리 ──
    const file = formData.get("businessRegCertFile") as File | null;
    let businessRegCertUrl = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || "application/octet-stream";
      businessRegCertUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
    
    // ── 주문번호 생성 ──
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
        monthlyFee: expectedMonthly, // 서버 계산값 사용
        totalAmount: expectedTotal,  // 서버 계산값 사용
        status: "결제 대기",
      },
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      orderNumber,
    });
  } catch (error: any) {
    console.error("Order creation error:", error);
    return NextResponse.json({ success: false, error: "주문 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
