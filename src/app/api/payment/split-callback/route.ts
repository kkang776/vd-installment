import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { sendAlimtalk } from "@/lib/surem";

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

    let params: Record<string, string | null> = {};

    if (method === "POST") {
      try {
        const formData = await req.formData();
        for (const [key, value] of formData.entries()) {
          params[key] = value as string;
        }
      } catch {
        // formData parsing failed
      }
    }

    // Also check URL search params as fallback
    for (const [key, value] of url.searchParams.entries()) {
      if (!params[key]) params[key] = value;
    }

    const ordr_idxx = params["ordr_idxx"] || null;
    const res_cd = params["res_cd"] || null;
    const tno = params["tno"] || null;
    const app_no = params["app_no"] || null;
    const card_name = params["card_name"] || null;

    // If no transaction ID, redirect back to home gracefully
    if (!ordr_idxx) {
      return new NextResponse(`
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <script>
              if (window.opener) {
                window.opener.location.reload();
                window.close();
              } else {
                window.location.replace("/");
              }
            </script>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Find transaction by KCP order number (stored in pgAppNo) or by ID (fallback)
    let transaction = await prisma.paymentTransaction.findFirst({
      where: { pgAppNo: ordr_idxx },
    });
    if (!transaction) {
      // Fallback: try finding by ID (for backward compatibility)
      transaction = await prisma.paymentTransaction.findUnique({
        where: { id: ordr_idxx },
      });
    }

    if (!transaction) {
      return new NextResponse(`
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <script>
              alert("결제 정보를 찾을 수 없습니다.");
              if (window.opener) { window.opener.location.reload(); window.close(); }
              else { window.location.replace("/"); }
            </script>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Check if KCP returned an error (user cancelled or payment failed)
    if (res_cd && res_cd !== "0000") {
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

    // Use KCP-returned card name, or fallback
    const resolvedCardName = card_name || transaction.cardCompanyName || (transaction.method === "CARD" ? "신용카드" : "가상계좌");
    const resolvedTno = tno || ("T" + Date.now().toString());
    const resolvedAppNo = app_no || Math.floor(10000000 + Math.random() * 90000000).toString();

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

    // Check if entire order is fully paid
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
      
      // Async trigger for Alimtalk
      sendAlimtalk({
        orderId: order.id,
        ordererPhone: order.ordererPhone,
        ordererName: order.ordererName,
        productName: order.productName,
        quantity: order.quantity,
        totalAmount: order.totalAmount,
      }).catch(err => console.error("Alimtalk async error:", err));

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
            if (window.opener) { window.opener.location.reload(); window.close(); }
            else { window.history.back(); }
          </script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
