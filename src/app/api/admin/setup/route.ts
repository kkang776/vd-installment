import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// ⚠️ 초기 관리자 계정 생성 전용. 운영 환경에서는 접근 차단.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "This endpoint is disabled in production" }, { status: 403 });
  }

  try {
    const adminExists = await prisma.admin.findUnique({
      where: { username: "admin" }
    });

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await prisma.admin.create({
        data: {
          username: "admin",
          password: hashedPassword,
        }
      });
      return NextResponse.json({ success: true, message: "Admin account created." });
    } else {
      return NextResponse.json({ success: true, message: "Admin account already exists." });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Setup failed" }, { status: 500 });
  }
}
