import crypto from "crypto";

export interface KcpApprovalParams {
  ordr_idxx: string;
  enc_data: string;
  enc_info: string;
  ordr_mony: number;
  tran_cd?: string; // 일반 결제는 보통 00100000, 안 주면 기본값 사용
}

export interface KcpApprovalResult {
  success: boolean;
  tno?: string;
  amount?: number;
  app_no?: string;
  card_name?: string;
  quota?: number;
  message?: string;
  raw?: any;
}

/**
 * KCP REST API (v1/payment) 기반 승인(Approval) 처리 유틸리티
 */
export async function executeKcpApproval(params: KcpApprovalParams): Promise<KcpApprovalResult> {
  const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE;
  const kcpCertPem = process.env.KCP_CERT_PEM;

  if (!site_cd) {
    console.error("KCP 승인 실패: NEXT_PUBLIC_KCP_SITE_CODE 환경변수 누락");
    return { success: false, message: "KCP 사이트 코드 미설정" };
  }

  if (!kcpCertPem) {
    console.error("KCP 승인 실패: KCP_CERT_PEM 환경변수 누락");
    return { success: false, message: "KCP 인증서 미설정" };
  }

  const isTest = process.env.NODE_ENV !== "production" || site_cd === "T0000" || site_cd === "A52Q7";
  const approvalUrl = isTest 
    ? "https://stg-spl.kcp.co.kr/gw/enc/v1/payment" 
    : "https://spl.kcp.co.kr/gw/enc/v1/payment";

  // kcp_cert_info는 PEM 형식의 인증서 문자열을 그대로 사용 (줄바꿈 포함)
  // 환경변수에서 개행문자가 이스케이프(\n)되어 들어올 수 있으므로 실제 개행으로 변환
  const certData = kcpCertPem.replace(/\\n/g, '\n');

  const requestBody = {
    site_cd: site_cd,
    kcp_cert_info: certData,
    ordr_idxx: params.ordr_idxx,
    ordr_mony: params.ordr_mony.toString(),
    enc_data: params.enc_data,
    enc_info: params.enc_info,
    tran_cd: params.tran_cd || "00100000"
  };

  console.log(`KCP Approval Request to ${approvalUrl}:`, {
    site_cd,
    ordr_idxx: params.ordr_idxx,
    tran_cd: requestBody.tran_cd,
    cert_length: certData.length
  });

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15초 타임아웃

    const response = await fetch(approvalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    console.log("KCP Approval Raw Response:", responseText);

    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, message: "KCP 응답 파싱 실패 (JSON 아님)", raw: responseText };
    }

    // 성공 코드는 "0000" (일반적으로 res_cd 필드 사용)
    const isSuccess = data.res_cd === "0000";

    if (isSuccess) {
      return {
        success: true,
        tno: data.tno,
        amount: data.amount ? parseInt(data.amount, 10) : undefined,
        app_no: data.app_no,
        card_name: data.card_name,
        quota: data.quota ? parseInt(data.quota, 10) : 0,
        message: "승인 성공",
        raw: data
      };
    } else {
      return {
        success: false,
        message: `KCP 승인 실패: [${data.res_cd}] ${data.res_msg}`,
        raw: data
      };
    }

  } catch (error: any) {
    console.error("KCP API 승인 통신 에러:", error);
    return { success: false, message: `통신 오류: ${error.message}` };
  }
}

export interface KcpCancelParams {
  tno: string;
  cancelAmount: number;
  cancelReason: string;
  mod_type?: "STSC" | "STPC"; // STSC: 전체취소, STPC: 부분취소
}

/**
 * KCP REST API (v1/cancel) 기반 취소 처리 유틸리티
 */
export async function executeKcpRestCancel(params: KcpCancelParams): Promise<{ success: boolean; message: string; raw?: any }> {
  const site_cd = process.env.NEXT_PUBLIC_KCP_SITE_CODE;
  const kcpCertPem = process.env.KCP_CERT_PEM;
  const kcpPrikeyPem = process.env.KCP_PRIKEY_PEM;

  if (!site_cd || !kcpCertPem || !kcpPrikeyPem) {
    console.error("KCP 취소 실패: 필수 환경변수(SITE_CODE, CERT_PEM, PRIKEY_PEM) 누락");
    return { success: false, message: "KCP 인증서 또는 개인키 환경변수 누락" };
  }

  const isTest = process.env.NODE_ENV !== "production" || site_cd === "T0000" || site_cd === "A52Q7";
  const cancelUrl = isTest 
    ? "https://stg-spl.kcp.co.kr/gw/enc/v1/cancel" 
    : "https://spl.kcp.co.kr/gw/enc/v1/cancel";

  const certData = kcpCertPem.replace(/\\n/g, '\n');
  const prikeyData = kcpPrikeyPem.replace(/\\n/g, '\n');
  const mod_type = params.mod_type || "STSC";

  // kcp_sign_data 서명 생성 (조합: site_cd^tno^mod_type)
  const signString = `${site_cd}^${params.tno}^${mod_type}`;
  let kcp_sign_data = "";
  try {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signString);
    kcp_sign_data = sign.sign(prikeyData, 'base64');
  } catch (err: any) {
    console.error("KCP 서명 생성 실패:", err);
    return { success: false, message: "KCP 서명 생성 실패" };
  }

  const requestBody = {
    site_cd: site_cd,
    kcp_cert_info: certData,
    kcp_sign_data: kcp_sign_data,
    tno: params.tno,
    mod_type: mod_type,
    mod_mny: params.cancelAmount,
    mod_desc: params.cancelReason
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(cancelUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const responseText = await response.text();
    console.log("KCP Cancel Raw Response:", responseText);

    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      return { success: false, message: "KCP 응답 파싱 실패", raw: responseText };
    }

    const isSuccess = data.res_cd === "0000";
    return {
      success: isSuccess,
      message: isSuccess ? "취소 완료" : `취소 실패: [${data.res_cd}] ${data.res_msg}`,
      raw: data
    };
  } catch (error: any) {
    console.error("KCP API 취소 통신 에러:", error);
    return { success: false, message: `통신 오류: ${error.message}` };
  }
}
