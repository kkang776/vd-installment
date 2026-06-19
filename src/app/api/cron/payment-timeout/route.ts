import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { executeKcpCancel } from "@/lib/kcp";

export async function GET(request: Request) {
  try {
    // ── Cron 시크릿 인증 ──
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      const authHeader = request.headers.get("authorization");
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

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

    let processedCount = 0;
    let cancelErrors: string[] = [];

    for (const order of expiredOrders) {
      const successfulTransactions = order.transactions.filter(
        (t) => t.status === "SUCCESS" && t.cancelAmount === 0
      );

      // ── KCP 취소 API 호출 ──
      for (const tx of successfulTransactions) {
        if (tx.pgTid) {
          const cancelResult = await executeKcpCancel({
            pgTid: tx.pgTid,
            cancelAmount: tx.amount,
            cancelReason: "TIMEOUT_CRON",
          });

          if (!cancelResult.success) {
            cancelErrors.push(`Order ${order.id}, TX ${tx.id}: ${cancelResult.message}`);
            console.error("Cron KCP 취소 실패:", cancelResult);
          }
        }

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

      processedCount++;
    }

    return NextResponse.json({
      success: true,
      processedCount,
      cancelErrors: cancelErrors.length > 0 ? cancelErrors : undefined,
    });
  } catch (error: any) {
    console.error("Cron timeout error:", error);
    return NextResponse.json({ success: false, error: "Cron 처리 오류" }, { status: 500 });
  }
}
