import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: Request) {
  try {
    // 1. KCP 결제창에서 리턴된 폼 데이터 추출
    const formData = await req.formData();
    const site_cd = formData.get("site_cd") as string;
    const ordr_idxx = formData.get("ordr_idxx") as string;
    const enc_data = formData.get("enc_data") as string;
    const enc_info = formData.get("enc_info") as string;
    const tran_cd = formData.get("tran_cd") as string;

    console.log("KCP Payment Callback Received:", { site_cd, ordr_idxx, tran_cd });

    // 2. DB에서 원주문 정보 조회 (결제금액 및 수단 검증용)
    const order = await prisma.order.findUnique({
      where: { orderNumber: ordr_idxx },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "주문 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // 3. KCP 승인 API 요청 데이터 구성 (결제정보 검증 파라미터 필수 포함)
    // 참고: developer.kcp.co.kr/guide/release
    const kcpApproveReq = {
      tran_cd: tran_cd || "00100000",
      site_cd: site_cd,
      kcp_cert_info: process.env.KCP_CERT_INFO || "TEST_CERT_INFO", // 상점 관리자에서 다운로드한 인증서 내용
      enc_data: enc_data,
      enc_info: enc_info,
      // 아래 3가지 파라미터가 위변조 방지를 위한 필수 검증 파라미터입니다.
      ordr_mony: order.totalAmount.toString(), // DB에 저장된 실제 결제 요청 금액
      pay_type: "PACA", // 신용카드 결제로 고정인 경우 PACA (결제수단에 따라 동적할당 필요)
      ordr_no: order.orderNumber, // DB에 저장된 실제 주문번호
    };

    // 4. KCP 승인 API 서버 통신 (테스트 환경)
    // 실제 운영 시에는 https://smpay.kcp.co.kr 등 KCP가 안내한 REST API URL을 사용해야 합니다.
    /*
    const kcpResponse = await fetch("https://testpaygw.kcp.co.kr/api/pay-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kcpApproveReq),
    });
    const result = await kcpResponse.json();
    */
   
    // 테스트 목적: KCP 통신 결과 (실제로는 fetch 결과에서 res_cd, res_msg를 가져옴)
    const mockKcpResult = {
      res_cd: formData.get("res_cd") as string || "0000", // 인증 결과 코드
      res_msg: formData.get("res_msg") as string || "정상처리", // 인증 결과 메시지
      tno: "T" + Date.now().toString(),
    };

    if (mockKcpResult.res_cd === "0000") {
      // 5. 승인 성공 시 DB 주문 상태를 "결제 완료"로 업데이트
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          status: "결제 완료",
          pgTid: mockKcpResult.tno,
        },
      });

      return new NextResponse(`
        <html>
          <body>
            <script>
              alert("결제가 정상적으로 완료되었습니다.");
              if (window.opener) {
                window.opener.location.href = "/?payment=success&orderId=${ordr_idxx}";
                window.close();
              } else {
                window.location.href = "/?payment=success&orderId=${ordr_idxx}";
              }
            </script>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } else {
      // 결제 실패 시 DB에 사유 기록
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          adminNotes: `[결제 실패] 코드: ${mockKcpResult.res_cd}, 사유: ${mockKcpResult.res_msg}`
        },
      });
      throw new Error(`[${mockKcpResult.res_cd}] ${mockKcpResult.res_msg}`);
    }

  } catch (error: any) {
    console.error("KCP callback error:", error);
    const errorMessage = error.message || "결제 처리 중 오류가 발생했습니다.";
    return new NextResponse(`
      <html>
        <body>
          <script>
            alert("결제 실패: ${errorMessage.replace(/"/g, '\\"')}");
            if (window.opener) window.close();
            else window.history.back();
          </script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
