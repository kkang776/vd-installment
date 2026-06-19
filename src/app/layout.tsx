import type { Metadata } from "next";
import Script from "next/script";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "VD Robotics 할부 상품 신청",
  description: "VD Robotics 할부 상품 신청 페이지",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${notoSansKr.variable} font-sans`}>
      <body className="min-h-screen bg-gray-50 text-gray-900 flex flex-col antialiased">
        {children}
        <Script src={process.env.NEXT_PUBLIC_KCP_JS_URL || "https://spay.kcp.co.kr/plugin/kcp_spay_hub.js"} strategy="lazyOnload" />
      </body>
    </html>
  );
}
