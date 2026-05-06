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

    // Read KCP result fields from form
    const result_cd = method === "POST" ? (formData as any).get("res_cd") as string : url.searchParams.get("res_cd");
    const result_msg = method === "POST" ? (formData as any).get("res_msg") as string : url.searchParams.get("res_msg");
    const tno = method === "POST" ? (formData as any).get("tno") as string : url.searchParams.get("tno");
    const app_no = method === "POST" ? (formData as any).get("app_no") as string : url.searchParams.get("app_no");
    const card_name = method === "POST" ? (formData as any).get("card_name") as string : url.searchParams.get("card_name");

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { id: ordr_idxx },
    });

    if (!transaction) {
      return NextResponse.json({ success: false, message: "Transaction not found." }, { status: 404 });
    }

    // Check if KCP returned an error (user cancelled or payment failed)
    if (result_cd && result_cd !== "0000") {
      // Payment was cancelled or failed - clean up the PENDING transaction
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED" },
      });

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
    }

    // Use KCP-returned card name, or fallback to the stored cardCompanyName on the transaction
    const resolvedCardName = card_name || transaction.cardCompanyName || (transaction.method === "CARD" ? "신용카드" : "가상계좌");
    const resolvedTno = tno || ("T" + Date.now().toString());
    const resolvedAppNo = app_no || Math.floor(10000000 + Math.random() * 90000000).toString();

    // Update transaction to SUCCESS
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: "SUCCESS",
        pgTid: resolvedTno,
        pgAppNo: resolvedAppNo,
        cardCompanyName: resolvedCardName,
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
