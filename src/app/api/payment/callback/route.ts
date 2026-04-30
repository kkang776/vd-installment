import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleCallback(req);
}

export async function POST(req: Request) {
  return handleCallback(req);
}

async function handleCallback(req: Request) {
  try {
    const url = new URL(req.url);
    const method = req.method;
    let site_cd, ordr_idxx, enc_data, enc_info, tran_cd;

    if (method === "POST") {
      const formData = await req.formData();
      site_cd = formData.get("site_cd") as string;
      ordr_idxx = formData.get("ordr_idxx") as string;
      enc_data = formData.get("enc_data") as string;
      enc_info = formData.get("enc_info") as string;
      tran_cd = formData.get("tran_cd") as string;
      
      const allData = Object.fromEntries(formData.entries());
      console.log("KCP Payment Callback Full Data (POST):", allData);
    } else {
      site_cd = url.searchParams.get("site_cd");
      ordr_idxx = url.searchParams.get("ordr_idxx");
      enc_data = url.searchParams.get("enc_data");
      enc_info = url.searchParams.get("enc_info");
      tran_cd = url.searchParams.get("tran_cd");
      
      console.log("KCP Payment Callback Full Data (GET):", Object.fromEntries(url.searchParams.entries()));
    }

    if (!ordr_idxx) {
      return NextResponse.json({ success: false, message: "주문번호가 누락되었습니다." }, { status: 400 });
    }

    // 2. DB에서 원주문 정보 조회
    const order = await prisma.order.findUnique({
      where: { orderNumber: ordr_idxx },
    });

    if (!order) {
      return NextResponse.json({ success: false, message: "주문 정보를 찾을 수 없습니다." }, { status: 404 });
    }

    // 3. KCP 승인 처리 (테스트용 mock 결과)
    const res_cd = method === "POST" 
      ? (await req.formData()).get("res_cd") 
      : url.searchParams.get("res_cd");
    const res_msg = method === "POST"
      ? (await req.formData()).get("res_msg")
      : url.searchParams.get("res_msg");

    const mockKcpResult = {
      res_cd: res_cd || "0000",
      res_msg: res_msg || "정상처리",
      tno: "T" + Date.now().toString(),
    };

    if (mockKcpResult.res_cd === "0000") {
      await prisma.order.update({
        where: { orderNumber: ordr_idxx },
        data: {
          status: "결제 완료",
          pgTid: mockKcpResult.tno,
        },
      });

      return new NextResponse(`
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <script>
              alert("결제가 정상적으로 완료되었습니다.");
              if (window.opener) {
                window.opener.location.replace("/?payment=success&orderId=${ordr_idxx}");
                window.close();
              } else {
                window.location.replace("/?payment=success&orderId=${ordr_idxx}");
              }
            </script>
          </body>
        </html>
      `, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } else {
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
        <head><meta charset="utf-8"></head>
        <body>
          <script>
            alert("결제 실패: ${errorMessage.replace(/"/g, '\\"')}");
            if (window.opener) window.close();
            else window.location.replace("/");
          </script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
