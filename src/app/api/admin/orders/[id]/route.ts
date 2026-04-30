import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    try {
      jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const paramsResolved = await params;
    const id = paramsResolved.id;
    
    if (!id) {
      return NextResponse.json({ success: false, message: "Missing ID" }, { status: 400 });
    }

    const body = await request.json();
    const { installationDate, adminManager, adminNotes, status } = body;

    console.log(`Updating order ${id} with:`, { installationDate, adminManager, adminNotes, status });

    const updatedOrder = await prisma.order.update({
      where: { id: String(id) },
      data: {
        installationDate,
        adminManager,
        adminNotes,
        status,
      },
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  } catch (error: any) {
    console.error("Update order error detailed:", error);
    return NextResponse.json({ 
      success: false, 
      message: error.message || "Internal server error" 
    }, { status: 500 });
  }
}
