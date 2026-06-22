/**
 * KCP 결제 취소 유틸리티
 * 
 * 실결제 전환 시 이 함수에 실제 KCP 취소 API 호출 로직을 구현합니다.
 * 현재는 운영 전환 준비 상태로, 호출 시 로그를 남기고 true를 반환합니다.
 * 
 * KCP 결제 취소 API 문서:
 * - URL: https://smpay.kcp.co.kr/trade/cancel.do (운영) / https://testsmpay.kcp.co.kr/trade/cancel.do (테스트)
 * - Method: POST
 * - Content-Type: application/x-www-form-urlencoded
 */

interface KcpCancelParams {
  pgTid: string;       // KCP 거래번호 (tno)
  cancelAmount: number; // 취소 금액
  cancelReason: string; // 취소 사유
}

interface KcpCancelResult {
  success: boolean;
  message: string;
  resCd?: string;
}

export async function executeKcpCancel(params: KcpCancelParams): Promise<KcpCancelResult> {
  const { pgTid, cancelAmount, cancelReason } = params;

  if (process.env.KCP_PRIKEY_PEM && process.env.KCP_CERT_PEM) {
    console.log("KCP_PRIKEY_PEM 감지됨 - KCP REST API (v1/cancel) 취소를 시도합니다.");
    const { executeKcpRestCancel } = await import("@/lib/kcp-approval");
    return executeKcpRestCancel({
      tno: pgTid,
      cancelAmount: cancelAmount,
      cancelReason: cancelReason,
      mod_type: "STSC"
    });
  }

  const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE;
  const site_key = process.env.KCP_SITE_KEY;

  if (!site_cd || !site_key) {
    console.error("KCP 취소 실패: 상점코드 또는 보안키 미설정");
    return { success: false, message: "KCP 설정 오류" };
  }

  // 환경변수에서 취소 API URL 결정
  const cancelUrl = process.env.KCP_TRADE_REG_URL
    ? process.env.KCP_TRADE_REG_URL.replace("/trade/register.do", "/trade/cancel.do")
    : "https://testsmpay.kcp.co.kr/trade/cancel.do";

  console.log("KCP 결제 취소 요청 (Legacy site_key):", { pgTid, cancelAmount, cancelReason, cancelUrl });

  try {
    const cancelParams = new URLSearchParams();
    cancelParams.append("site_cd", site_cd);
    cancelParams.append("site_key", site_key);
    cancelParams.append("tno", pgTid);
    cancelParams.append("mod_type", "STSC"); // 전체 취소
    cancelParams.append("mod_mny", cancelAmount.toString());
    cancelParams.append("rem_mny", "0");
    cancelParams.append("mod_desc", cancelReason);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10초 타임아웃

    const response = await fetch(cancelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: cancelParams.toString(),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log("KCP 취소 응답:", responseText);

    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      // URL-encoded 응답 파싱 시도
      const urlParams = new URLSearchParams(responseText);
      data = Object.fromEntries(urlParams.entries());
    }

    const isSuccess = data.res_cd === "0000" || data.Code === "0000";

    return {
      success: isSuccess,
      message: isSuccess ? "취소 완료" : `취소 실패: [${data.res_cd || data.Code}] ${data.res_msg || data.Message || responseText.substring(0, 200)}`,
      resCd: data.res_cd || data.Code,
    };
  } catch (error: any) {
    console.error("KCP 취소 API 통신 오류:", error);
    return {
      success: false,
      message: `KCP 취소 통신 오류: ${error.message}`,
    };
  }
}
