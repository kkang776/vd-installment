import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Diagnostic endpoint to test SureM Alimtalk configuration
export async function GET() {
  const config = {
    SUREM_USER_CODE: process.env.SUREM_USER_CODE ? "✅ SET" : "❌ MISSING",
    SUREM_PROFILE_KEY: process.env.SUREM_PROFILE_KEY ? `✅ SET (${process.env.SUREM_PROFILE_KEY?.substring(0, 8)}...)` : "❌ MISSING",
    SUREM_TEMPLATE_CODE: process.env.SUREM_TEMPLATE_CODE ? `✅ ${process.env.SUREM_TEMPLATE_CODE}` : "❌ MISSING",
    SUREM_SENDER_NUM: process.env.SUREM_SENDER_NUM ? `✅ ${process.env.SUREM_SENDER_NUM}` : "❌ MISSING",
    SUREM_API_URL: process.env.SUREM_API_URL || "❌ MISSING (will use default)",
  };

  // Try a test API call (without actually sending a message) to check connectivity
  const apiUrl = process.env.SUREM_API_URL || "https://api.surem.com/alimtalk/v1/json/send";
  let connectivity = "NOT_TESTED";
  
  try {
    // Send a minimal test request to check if the endpoint responds
    const testBody = {
      userid: process.env.SUREM_USER_CODE || "test",
      profile_key: process.env.SUREM_PROFILE_KEY || "test",
      messages: [
        {
          templatecode: process.env.SUREM_TEMPLATE_CODE || "test",
          phone: "00000000000", // Invalid phone - won't actually send
          callback: process.env.SUREM_SENDER_NUM || "",
          msg_body: "테스트",
        }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify(testBody),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const responseText = await res.text();
    connectivity = `Status: ${res.status} | Response: ${responseText.substring(0, 500)}`;
  } catch (e: any) {
    connectivity = `ERROR: ${e.message}`;
  }

  return NextResponse.json({
    title: "SureM Alimtalk Configuration Check",
    envVars: config,
    apiConnectivity: {
      url: apiUrl,
      result: connectivity,
    }
  }, { status: 200 });
}
