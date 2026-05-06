import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleCallback(req);
}

export async function POST(req: Request) {
  return handleCallback(req);
}

async function handleCallback(req: Request) {
  try {
    const url = new URL(req.url);
    const method = req.method;
    let ordr_idxx;

    if (method === "POST") {
      const formData = await req.formData();
      ordr_idxx = formData.get("ordr_idxx") as string;
    } else {
      ordr_idxx = url.searchParams.get("ordr_idxx");
    }

    if (!ordr_idxx) {
      return NextResponse.json({ success: false, message: "Transaction ID is missing." }, { status: 400 });
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: ordr_idxx },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, message: "Transaction not found." }, { status: 404 });
    }

    // Mock KCP result (In real implementation, you'd verify with KCP API here)
    const mockTno = "T" + Date.now().toString();
    const mockAppNo = Math.floor(10000000 + Math.random() * 90000000).toString(); // 8 digits

    // Update transaction to SUCCESS
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "SUCCESS",
        pgTid: mockTno,
        pgAppNo: mockAppNo,
        cardCompanyName: transaction.method === "CARD" ? "현대카드" : "가상계좌",
        pgAppDate: new Date().toISOString(),
      },
    });

    // Check if entire order is fully paid now
    const allTransactions = await prisma.paymentTransaction.findMany({
      where: { orderId: transaction.orderId, status: "SUCCESS" }
    });
    
    const paidAmount = allTransactions.reduce((acc, t) => acc + (t.amount - t.cancelAmount), 0);
    const order = await prisma.order.findUnique({ where: { id: transaction.orderId } });

    if (order && paidAmount >= order.totalAmount) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PAID" },
      });
    } else if (order && paidAmount > 0) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: "PARTIALLY_PAID" },
      });
    }

    return new NextResponse(`
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          <script>
            if (window.opener) {
              window.opener.location.reload();
              window.close();
            } else {
              window.location.replace("/payment/checkout?orderId=${transaction.orderId}");
            }
          </script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Split KCP callback error:", error);
    return new NextResponse(`
      <html>
        <head><meta charset="utf-8"></head>
        <body>
          <script>
            alert("결제 실패: ${error.message}");
            if (window.opener) window.close();
            else window.history.back();
          </script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
