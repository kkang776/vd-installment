import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

/**
 * JWT_SECRET을 안전하게 가져옵니다.
 * 환경변수가 미설정이면 에러를 throw합니다.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return secret;
}

/**
 * 관리자 인증을 검증합니다.
 * @returns 인증 성공 시 디코딩된 페이로드, 실패 시 null
 */
export async function verifyAdminAuth(): Promise<{ adminId: string; username: string } | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("admin_token")?.value;
    if (!token) return null;

    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret) as { adminId: string; username: string };
    return decoded;
  } catch {
    return null;
  }
}
