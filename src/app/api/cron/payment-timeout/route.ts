import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET(request: Request) {
  try {
    // 30 minutes ago
    const timeoutThreshold = new Date(Date.now() - 30 * 60 * 1000);

    const expiredOrders = await prisma.order.findMany({
      where: {
        status: "PARTIALLY_PAID",
        updatedAt: {
          lt: timeoutThreshold,
        },
        isAbnormalCancel: false,
      },
      include: { transactions: true }
    });

    for (const order of expiredOrders) {
      const successfulTransactions = order.transactions.filter(
        (t) => t.status === "SUCCESS" && t.cancelAmount === 0
      );

      for (const tx of successfulTransactions) {
        // Mock KCP Cancel
        await prisma.paymentTransaction.update({
          where: { id: tx.id },
          data: {
            status: "CANCELLED",
            cancelAmount: tx.amount,
          }
        });
      }

      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "ABNORMAL_CANCELLED",
          isAbnormalCancel: true,
          cancelReason: "TIMEOUT_CRON",
        }
      });
    }

    return NextResponse.json({ success: true, processedCount: expiredOrders.length });
  } catch (error: any) {
    console.error("Cron timeout error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
