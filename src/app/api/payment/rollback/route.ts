import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    let body;
    const contentType = request.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      body = await request.json();
    } else {
      // Handle navigator.sendBeacon which sends text/plain
      const text = await request.text();
      body = JSON.parse(text);
    }

    const { orderId, reason } = body;

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { transactions: true }
    });

    if (!order) {
      return NextResponse.json({ success: false, error: "Order not found" });
    }

    // Find successful transactions that haven't been cancelled yet
    const successfulTransactions = order.transactions.filter(
      (t) => t.status === "SUCCESS" && t.cancelAmount === 0
    );

    // Call KCP Cancel API for each successful transaction (Mocked here)
    for (const tx of successfulTransactions) {
      // let kcpCancelSuccess = await executeKCPCancel(tx.pgTid);
      
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: "CANCELLED",
          cancelAmount: tx.amount,
        }
      });
    }

    // Mark order as ABNORMAL_CANCELLED
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "ABNORMAL_CANCELLED",
        isAbnormalCancel: true,
        cancelReason: reason || "UNKNOWN",
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Rollback error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
