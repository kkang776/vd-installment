import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Diagnostic endpoint to test KCP trade registration with minimal parameters
// ⚠️ 운영 환경에서는 접근 차단
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "This endpoint is disabled in production" }, { status: 403 });
  }

  const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000";
  const isTest = site_cd === "T0000" || site_cd.startsWith("T");
  const targetUrl = isTest
    ? "https://testsmpay.kcp.co.kr/trade/register.do"
    : "https://smpay.kcp.co.kr/trade/register.do";

  const protocol = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  // Test 1: Minimal params with small amount
  const test1Params = new URLSearchParams();
  test1Params.append("site_cd", site_cd);
  test1Params.append("ordr_idxx", `TEST${Date.now()}`);
  test1Params.append("good_mny", "1000");
  test1Params.append("good_name", "TestProduct");
  test1Params.append("pay_method", "CARD");
  test1Params.append("Ret_URL", `${baseUrl}/api/payment/split-callback`);

  let test1Result: any = {};
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: test1Params.toString(),
    });
    const text = await res.text();
    test1Result = {
      httpStatus: res.status,
      body: text,
      parsed: (() => { try { return JSON.parse(text); } catch { return "PARSE_FAILED"; } })(),
    };
  } catch (e: any) {
    test1Result = { error: e.message };
  }

  // Test 2: Same but with large amount (matching real order)
  const test2Params = new URLSearchParams();
  test2Params.append("site_cd", site_cd);
  test2Params.append("ordr_idxx", `TEST${Date.now()}B`);
  test2Params.append("good_mny", "7880400");
  test2Params.append("good_name", "TestProduct");
  test2Params.append("pay_method", "CARD");
  test2Params.append("Ret_URL", `${baseUrl}/api/payment/split-callback`);

  let test2Result: any = {};
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: test2Params.toString(),
    });
    const text = await res.text();
    test2Result = {
      httpStatus: res.status,
      body: text,
      parsed: (() => { try { return JSON.parse(text); } catch { return "PARSE_FAILED"; } })(),
    };
  } catch (e: any) {
    test2Result = { error: e.message };
  }

  // Test 3: Small amount with Korean product name
  const test3Params = new URLSearchParams();
  test3Params.append("site_cd", site_cd);
  test3Params.append("ordr_idxx", `TEST${Date.now()}C`);
  test3Params.append("good_mny", "1000");
  test3Params.append("good_name", "클리버 A1 Pro");
  test3Params.append("pay_method", "CARD");
  test3Params.append("Ret_URL", `${baseUrl}/api/payment/split-callback`);

  let test3Result: any = {};
  try {
    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: test3Params.toString(),
    });
    const text = await res.text();
    test3Result = {
      httpStatus: res.status,
      body: text,
      parsed: (() => { try { return JSON.parse(text); } catch { return "PARSE_FAILED"; } })(),
    };
  } catch (e: any) {
    test3Result = { error: e.message };
  }

  return NextResponse.json({
    environment: {
      site_cd,
      targetUrl,
      baseUrl,
      retUrl: `${baseUrl}/api/payment/split-callback`,
      serverIP: request.headers.get("x-forwarded-for") || "unknown",
    },
    test1_small_amount_ascii: test1Result,
    test2_large_amount_ascii: test2Result,
    test3_small_amount_korean: test3Result,
  }, { status: 200 });
}
