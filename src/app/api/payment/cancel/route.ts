import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { executeKcpCancel } from "@/lib/kcp";

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
      return NextResponse.json({ success: false, error: "성공한 결제만 취소할 수 있습니다." });
    }

    // ── KCP 결제 취소 API 호출 ──
    if (transaction.pgTid) {
      const cancelResult = await executeKcpCancel({
        pgTid: transaction.pgTid,
        cancelAmount: transaction.amount,
        cancelReason: "사용자 결제 취소",
      });

      if (!cancelResult.success) {
        console.error("KCP 취소 실패:", cancelResult);
        return NextResponse.json({
          success: false,
          error: `PG 취소 처리 실패: ${cancelResult.message}`
        }, { status: 500 });
      }
    }

    // ── DB 업데이트 ──
    await prisma.paymentTransaction.update({
      where: { id: transactionId },
      data: {
        status: "CANCELLED",
        cancelAmount: transaction.amount,
      }
    });

    // 주문 상태 재계산
    const allTransactions = await prisma.paymentTransaction.findMany({
      where: { orderId: transaction.orderId, status: "SUCCESS" }
    });
    const paidAmount = allTransactions.reduce((acc, t) => acc + (t.amount - t.cancelAmount), 0);

    if (paidAmount === 0) {
      await prisma.order.update({
        where: { id: transaction.orderId },
        data: { status: "PENDING" },
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
    return NextResponse.json({ success: false, error: "취소 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
