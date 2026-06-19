import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyAdminAuth } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdminAuth();
    if (!admin) {
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
      message: "주문 업데이트 중 오류가 발생했습니다." 
    }, { status: 500 });
  }
}
