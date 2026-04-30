import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
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
      return NextResponse.json({ success: false, message: "Invalid token" }, { status: 401 });
    }

    const { id } = params;
    const { reason } = await request.json();

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    // TODO: 실제로 KCP 결제 취소 API를 호출하는 로직이 여기에 들어갑니다.
    // const kcpCancelResult = await callKcpCancelApi(order.pgTid, reason);
    // if (!kcpCancelResult.success) {
    //   throw new Error("PG 취소 실패");
    // }

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
