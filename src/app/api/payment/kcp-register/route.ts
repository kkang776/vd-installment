// Edge Runtime - uses different IP than Node.js serverless functions
export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { site_cd, ordr_idxx, good_mny, good_name, pay_method, Ret_URL } = body;

    if (!site_cd) {
      return Response.json({ success: false, error: "KCP 상점코드(site_cd) 누락" }, { status: 400 });
    }

    const tradeRegParams = new URLSearchParams();
    tradeRegParams.append("site_cd", site_cd);
    tradeRegParams.append("ordr_idxx", ordr_idxx);
    tradeRegParams.append("good_mny", good_mny);
    tradeRegParams.append("good_name", good_name);
    tradeRegParams.append("pay_method", pay_method);
    tradeRegParams.append("Ret_URL", Ret_URL);

    // 환경변수에서 거래등록 URL 가져오기 (테스트/운영 자동 분기)
    const targetUrl = process.env.KCP_TRADE_REG_URL || "https://testsmpay.kcp.co.kr/trade/register.do";

    console.log("Edge KCP register.do request:", { url: targetUrl, params: Object.fromEntries(tradeRegParams.entries()) });

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tradeRegParams.toString(),
    });

    const text = await res.text();
    console.log("Edge KCP register.do response:", text);

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ success: false, error: "KCP 응답 파싱 실패" });
    }

    if (parsed.Code === "0000") {
      return Response.json({
        success: true,
        approvalKey: parsed.approvalKey,
        PayUrl: parsed.PayUrl,
        traceNo: parsed.traceNo,
      });
    } else {
      return Response.json({
        success: false,
        error: `[${parsed.Code}] ${parsed.Message}`,
      });
    }
  } catch (error: any) {
    return Response.json({ success: false, error: "KCP 거래등록 처리 중 오류" }, { status: 500 });
  }
}
