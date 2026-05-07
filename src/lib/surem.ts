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
  const apiUrl = process.env.SUREM_API_URL || "https://api.surem.com/message/alimtalk";

  if (!userCode || !profileKey || !templateCode) {
    console.error("SureM environment variables are missing.");
    return false;
  }

  // Formatting phone (remove hyphens)
  const phone = payload.ordererPhone.replace(/-/g, "");
  // Formatting amount
  const formattedAmount = payload.totalAmount.toLocaleString("ko-KR");

  // Build the message by replacing variables
  const message = `결제가 완료되었습니다.
고객명: ${payload.ordererName}
상품명: ${payload.productName}
상품수량: ${payload.quantity}개
결제금액: ${formattedAmount}원`;

  const requestBody = {
    usercode: userCode,
    profile_key: profileKey,
    template_code: templateCode,
    req_phone: phone,
    call_phone: senderNum || "",
    message: message,
    // Provide variables if SureM API uses variables array, otherwise the rendered message is usually sent
    // variables: {
    //   "#{고객명}": payload.ordererName,
    //   "#{상품명}": payload.productName,
    //   "#{상품수량}": payload.quantity.toString(),
    //   "#{결제금액}": formattedAmount,
    // }
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
    const isSuccess = response.ok && data.code === "200"; // adjust success condition as per actual SureM API

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
