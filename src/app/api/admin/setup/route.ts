import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";

// 관리자 계정 생성 및 패스워드 재설정 전용 엔드포인트
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  // 로컬 개발 환경이거나, 운영 환경인 경우 CRON_SECRET과 매칭되는 secret 파라미터가 있을 때만 허용
  const isAuthorized = 
    process.env.NODE_ENV !== "production" || 
    (cronSecret && secretParam === cronSecret);

  if (!isAuthorized) {
    return NextResponse.json(
      { error: "This endpoint is disabled in production unless authorized with a secret." }, 
      { status: 403 }
    );
  }

  try {
    const hashedPassword = await bcrypt.hash("admin1234", 10);

    // username: "admin" 계정을 생성하거나 기존 계정이 존재하면 비밀번호를 "admin1234"로 재설정합니다.
    await prisma.admin.upsert({
      where: { username: "admin" },
      update: { password: hashedPassword },
      create: {
        username: "admin",
        password: hashedPassword,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "Admin account ('admin' / 'admin1234') has been set up/reset successfully." 
    });
  } catch (error: any) {
    console.error("Admin setup/reset failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Setup failed" }, { status: 500 });
  }
}
