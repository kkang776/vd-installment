import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

export async function GET() {
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
      return NextResponse.json({ success: true, message: "Admin account created: admin / admin123" });
    } else {
      return NextResponse.json({ success: true, message: "Admin account already exists." });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Setup failed" }, { status: 500 });
  }
}
