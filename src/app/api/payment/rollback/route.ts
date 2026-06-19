import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { executeKcpCancel } from "@/lib/kcp";

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

    // ── KCP 취소 API 호출 + DB 업데이트 ──
    for (const tx of successfulTransactions) {
      if (tx.pgTid) {
        const cancelResult = await executeKcpCancel({
          pgTid: tx.pgTid,
          cancelAmount: tx.amount,
          cancelReason: reason || "TIMEOUT_ROLLBACK",
        });

        if (!cancelResult.success) {
          console.error("KCP 롤백 취소 실패:", { txId: tx.id, result: cancelResult });
          // 롤백은 최선을 다하되 계속 진행
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
    return NextResponse.json({ success: false, error: "롤백 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
