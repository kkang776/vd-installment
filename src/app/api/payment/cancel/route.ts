import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const { transactionId } = await request.json();

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, error: "Transaction not found" });
    }

    if (transaction.status !== "SUCCESS") {
      return NextResponse.json({ success: false, error: "Can only cancel successful transactions" });
    }

    // Call KCP Cancel API (Mocked here)
    // let kcpCancelSuccess = await executeKCPCancel(transaction.pgTid);

    // Update database
    await prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: "CANCELLED",
        cancelAmount: transaction.amount,
      }
    });

    // Update order status if needed
    const allTransactions = await prisma.paymentTransaction.findMany({
      where: { orderId: transaction.orderId, status: "SUCCESS" }
    });
    const paidAmount = allTransactions.reduce((acc, t) => acc + (t.amount - t.cancelAmount), 0);

    if (paidAmount === 0) {
      await prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: "PENDING" }, // Back to pending if all cancelled
      });
    } else {
      await prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: "PARTIALLY_PAID" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Cancel error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
