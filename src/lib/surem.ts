import prisma from "./prisma";

interface AlimtalkPayload {
  orderId: string;
  ordererPhone: string;
  ordererName: string;
  productName: string;
  quantity: number;
  totalAmount: number;
}

/**
 * SureM 카카오 알림톡 발송
 * API: POST https://rest.surem.com/api/v1/send/alimtalk
 * Auth: Bearer {SUREM_USER_CODE}
 */
export async function sendAlimtalk(payload: AlimtalkPayload) {
  const accessToken = process.env.SUREM_USER_CODE; // kdpotp
  const senderKey = process.env.SUREM_PROFILE_KEY; // 카카오 발신프로필 키
  const templateCode = process.env.SUREM_TEMPLATE_CODE; // scpay_01
  const reqPhone = (process.env.SUREM_SENDER_NUM || "").replace(/-/g, ""); // 18333482
  const apiUrl = process.env.SUREM_API_URL || "https://rest.surem.com/api/v1/send/alimtalk";

  if (!accessToken || !senderKey || !templateCode) {
    console.error("SureM 환경 변수 누락:", { accessToken: !!accessToken, senderKey: !!senderKey, templateCode: !!templateCode });
    return false;
  }

  // 수신번호: 국가코드 포함 형식 (82-1012345678)
  const rawPhone = payload.ordererPhone.replace(/-/g, "");
  const toPhone = rawPhone.startsWith("0")
    ? `82-${rawPhone.substring(1)}`
    : rawPhone.startsWith("82") ? rawPhone : `82-${rawPhone}`;

  // 결제금액 포맷
  const formattedAmount = payload.totalAmount.toLocaleString("ko-KR");

  // 템플릿 내용 — 등록된 템플릿(scpay_01)과 변수 치환 부분만 다르고 나머지는 100% 일치해야 함
  const text = `[브이디로보틱스] 결제 완료 안내
${payload.ordererName}님, 주문하신 상품의 결제가 정상적으로 완료되었습니다.
■ 결제 내역
 - 상품명 : ${payload.productName}
 - 수량 : ${payload.quantity}개
 - 총 결제금액 : ${formattedAmount}원
로봇 설치 일정을 잡기 위해 담당 부서에서 영업일 기준 1~2일 내로 해피콜을 드릴 예정입니다.
고맙습니다.`;

  const requestBody = {
    bizType: "at",
    senderKey,
    templateCode,
    to: toPhone,
    text,
    reqPhone,
    reSend: "N", // 문자 재전송 사용 안함
  };

  console.log("SureM Alimtalk Request:", {
    url: apiUrl,
    to: toPhone,
    templateCode,
    textLength: text.length,
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log("SureM Alimtalk Response:", response.status, responseText);

    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    const isSuccess = response.ok && (
      data.code === "200" ||
      data.code === 200 ||
      data.code === "0000" ||
      data.code === "success" ||
      data.result === "success" ||
      data.status === "success" ||
      response.status === 200
    );

    // DB 로그
    await prisma.notificationLog.create({
      data: {
        orderId: payload.orderId,
        type: "ALIMTALK",
        recipientNum: toPhone,
        templateCode,
        payload: JSON.stringify(requestBody),
        isSuccess,
        errorCode: isSuccess ? null : (data.code?.toString() || response.status.toString()),
        errorMessage: isSuccess ? null : (data.message || responseText.substring(0, 500)),
      },
    });

    return isSuccess;
  } catch (error: any) {
    console.error("SureM Alimtalk API error:", error);
    try {
      await prisma.notificationLog.create({
        data: {
          orderId: payload.orderId,
          type: "ALIMTALK",
          recipientNum: toPhone,
          templateCode,
          payload: JSON.stringify(requestBody),
          isSuccess: false,
          errorCode: "TIMEOUT_OR_NETWORK_ERROR",
          errorMessage: error.message,
        },
      });
    } catch (dbError) {
      console.error("Failed to log notification error:", dbError);
    }
    return false;
  }
}
