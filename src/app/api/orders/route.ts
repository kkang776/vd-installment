import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    
    const ordererName = formData.get("ordererName") as string;
    const ordererPhone = formData.get("ordererPhone") as string;
    const businessName = formData.get("businessName") as string | null;
    const businessRegNumber = formData.get("businessRegNumber") as string | null;
    const shippingAddress = formData.get("shippingAddress") as string;
    const shippingDetail = formData.get("shippingDetail") as string | null;
    const requestNotes = formData.get("requestNotes") as string | null;
    
    const productName = formData.get("productName") as string;
    const quantity = parseInt(formData.get("quantity") as string, 10);
    const contractMonths = parseInt(formData.get("contractMonths") as string, 10);
    const monthlyFee = parseInt(formData.get("monthlyFee") as string, 10);
    const totalAmount = parseInt(formData.get("totalAmount") as string, 10);

    const file = formData.get("businessRegCertFile") as File | null;
    let businessRegCertUrl = null;

    if (file && file.size > 0) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const mimeType = file.type || "application/octet-stream";
      businessRegCertUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    }
    
    const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${uuidv4().slice(0, 8).toUpperCase()}`;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        ordererName,
        ordererPhone,
        businessName,
        businessRegNumber,
        businessRegCertUrl,
        shippingAddress,
        shippingDetail,
        requestNotes,
        productName,
        quantity,
        contractMonths,
        monthlyFee,
        totalAmount,
        status: "결제 대기", // Wait for PG payment
      },
    });

    return NextResponse.json({ success: true, orderId: order.id, orderNumber });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json({ success: false, error: "Failed to create order" }, { status: 500 });
  }
}
