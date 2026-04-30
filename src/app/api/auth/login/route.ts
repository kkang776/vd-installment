import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_development";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    // Emergency Fallback Login (admin / admin1234)
    if (username === "admin" && password === "admin1234") {
      const token = jwt.sign({ adminId: "emergency-id", username: "admin" }, JWT_SECRET, { expiresIn: "1d" });
      const response = NextResponse.json({ success: true });
      response.cookies.set("admin_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
      return response;
    }

    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 401 });
    }

    const token = jwt.sign({ adminId: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: "1d" });

    const response = NextResponse.json({ success: true });
    response.cookies.set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
