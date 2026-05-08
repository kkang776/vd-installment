import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Test endpoint to verify SureM Alimtalk API connectivity
export async function GET(request: Request) {
  const accessToken = process.env.SUREM_USER_CODE;
  const senderKey = process.env.SUREM_PROFILE_KEY;
  const templateCode = process.env.SUREM_TEMPLATE_CODE;
  const reqPhone = (process.env.SUREM_SENDER_NUM || "").replace(/-/g, "");
  const apiUrl = process.env.SUREM_API_URL || "https://rest.surem.com/api/v1/send/alimtalk";

  // Check env vars
  const envCheck = {
    SUREM_USER_CODE: accessToken ? `SET (${accessToken.substring(0, 3)}...)` : "MISSING",
    SUREM_PROFILE_KEY: senderKey ? `SET (${senderKey.substring(0, 8)}...)` : "MISSING",
    SUREM_TEMPLATE_CODE: templateCode || "MISSING",
    SUREM_SENDER_NUM: reqPhone || "MISSING",
    SUREM_API_URL: apiUrl,
  };

  // Test with a dummy phone number (won't actually send to a real user)
  const testPhone = "82-1012345678";
  
  const text = `[브이디로보틱스] 결제 완료 안내
테스트님, 주문하신 상품의 결제가 정상적으로 완료되었습니다.
■ 결제 내역
 - 상품명 : 테스트상품
 - 수량 : 1개
 - 총 결제금액 : 100원
로봇 설치 일정을 잡기 위해 담당 부서에서 영업일 기준 1~2일 내로 해피콜을 드릴 예정입니다.
고맙습니다.`;

  const requestBody = {
    bizType: "at",
    senderKey,
    templateCode,
    to: testPhone,
    text,
    reqPhone,
    reSend: "N",
  };

  let apiResult: any = {};
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    apiResult = {
      httpStatus: response.status,
      httpStatusText: response.statusText,
      responseBody: responseText,
      parsed: (() => { try { return JSON.parse(responseText); } catch { return "NOT_JSON"; } })(),
    };
  } catch (error: any) {
    apiResult = {
      error: error.message,
      type: error.name,
    };
  }

  return NextResponse.json({
    envCheck,
    requestSent: {
      url: apiUrl,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: requestBody,
    },
    apiResult,
  });
}
