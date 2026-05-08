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

    // No server-side KCP register.do call needed.
    // KCP JS SDK (KCP_Pay_Execute_Web) handles payment directly from client for both PC and mobile.

    return NextResponse.json({
      success: true,
      transactionId: transaction.id,
    });
  } catch (error: any) {
    console.error("Split request error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
