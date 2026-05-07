import prisma from "./prisma";

interface AlimtalkPayload {
  orderId: string;
  ordererPhone: string;
  ordererName: string;
  productName: string;
  quantity: number;
  totalAmount: number;
}

export async function sendAlimtalk(payload: AlimtalkPayload) {
  const userCode = process.env.SUREM_USER_CODE;
  const profileKey = process.env.SUREM_PROFILE_KEY;
  const templateCode = process.env.SUREM_TEMPLATE_CODE;
  const senderNum = process.env.SUREM_SENDER_NUM;
  // Default SureM API URL, adjust if needed
  const apiUrl = process.env.SUREM_API_URL || "https://api.surem.com/v1/kakao/alimtalk";

  if (!userCode || !profileKey || !templateCode) {
    console.error("SureM environment variables are missing.");
    return false;
  }

  // Formatting phone (remove hyphens)
  const phone = payload.ordererPhone.replace(/-/g, "");
  // Formatting amount
  const formattedAmount = payload.totalAmount.toLocaleString("ko-KR");

  // Build the message by replacing variables (must exactly match the template scpay_01)
  const message = `[분할 결제 완료 안내]
안녕하세요, ${payload.ordererName} 고객님.
주문하신 상품의 결제가 완료되어 안내드립니다.

- 상품명: ${payload.productName}
- 수량: ${payload.quantity}개
- 총 결제금액: ${formattedAmount}원

이용해 주셔서 대단히 감사합니다.`;

  const requestBody = {
    usercode: userCode,
    yellow_key: profileKey,
    template_code: templateCode,
    to: phone,
    reqphone: senderNum || "",
    msg: message,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 seconds timeout

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    
    const data = await response.json().catch(() => ({}));
    const isSuccess = response.ok && (
      data.code === "200" || 
      data.code === 200 || 
      data.code === "0000" || 
      data.result === "success" || 
      data.status === "success" ||
      data.status === 200
    );

    // Log to DB
    await prisma.notificationLog.create({
      data: {
        orderId: payload.orderId,
        type: "ALIMTALK",
        recipientNum: phone,
        templateCode: templateCode,
        payload: JSON.stringify(requestBody),
        isSuccess: isSuccess,
        errorCode: isSuccess ? null : (data.code || response.status.toString()),
        errorMessage: isSuccess ? null : (data.message || response.statusText),
      },
    });

    return isSuccess;
  } catch (error: any) {
    console.error("SureM Alimtalk API error:", error);
    // Log to DB on network failure / timeout
    try {
      await prisma.notificationLog.create({
        data: {
          orderId: payload.orderId,
          type: "ALIMTALK",
          recipientNum: phone,
          templateCode: templateCode,
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
