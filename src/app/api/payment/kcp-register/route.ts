// Edge Runtime - uses different IP than Node.js serverless functions
export const runtime = 'edge';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { site_cd, ordr_idxx, good_mny, good_name, pay_method, Ret_URL } = body;

    const tradeRegParams = new URLSearchParams();
    tradeRegParams.append("site_cd", site_cd || "T0000");
    tradeRegParams.append("ordr_idxx", ordr_idxx);
    tradeRegParams.append("good_mny", good_mny);
    tradeRegParams.append("good_name", good_name);
    tradeRegParams.append("pay_method", pay_method);
    tradeRegParams.append("Ret_URL", Ret_URL);

    const targetUrl = (site_cd === "T0000" || site_cd?.startsWith("T"))
      ? "https://testsmpay.kcp.co.kr/trade/register.do"
      : "https://smpay.kcp.co.kr/trade/register.do";

    console.log("Edge KCP register.do request:", Object.fromEntries(tradeRegParams.entries()));

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
      return Response.json({ success: false, error: "KCP 응답 파싱 실패", raw: text });
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
        raw: parsed,
      });
    }
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
