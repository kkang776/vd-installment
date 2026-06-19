import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdminAuth } from "@/lib/auth";
import { executeKcpCancel } from "@/lib/kcp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdminAuth();
    if (!admin) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { reason } = await request.json();

    const order = await prisma.order.findUnique({
      where: { id },
      include: { transactions: true },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // 성공한 트랜잭션에 대해 KCP 취소 API 호출
    const successfulTransactions = order.transactions.filter(
      (t) => t.status === "SUCCESS" && t.cancelAmount === 0
    );

    const cancelResults: string[] = [];
    for (const tx of successfulTransactions) {
      if (tx.pgTid) {
        const cancelResult = await executeKcpCancel({
          pgTid: tx.pgTid,
          cancelAmount: tx.amount,
          cancelReason: reason || "관리자 결제 취소",
        });

        if (!cancelResult.success) {
          cancelResults.push(`TX ${tx.id}: ${cancelResult.message}`);
          console.error("KCP 취소 실패:", cancelResult);
          // 하나라도 실패하면 중단하고 에러 반환
          return NextResponse.json({
            success: false,
            message: `PG 취소 처리 실패: ${cancelResult.message}`,
          }, { status: 500 });
        }
      }

      // KCP 취소 성공 후 DB 업데이트
      await prisma.paymentTransaction.update({
        where: { id: tx.id },
        data: {
          status: "CANCELLED",
          cancelAmount: tx.amount,
        },
      });
    }

    // DB 상태 업데이트
    await prisma.order.update({
      where: { id },
      data: {
        status: "결제 취소",
        adminNotes: order.adminNotes 
          ? `${order.adminNotes}\n[관리자 결제 취소] 사유: ${reason}` 
          : `[관리자 결제 취소] 사유: ${reason}`
      },
    });

    return NextResponse.json({ success: true, message: "결제가 성공적으로 취소되었습니다." });
  } catch (error) {
    console.error("Cancel API Error:", error);
    return NextResponse.json({ success: false, message: "결제 취소 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
}
