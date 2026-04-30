"use client";

import Link from "next/link";
import { ShieldCheck, Headset, FileText, Wrench } from "lucide-react";

export default function Footer({ onOpenModal }: { onOpenModal?: (type: "terms" | "privacy" | "refund") => void }) {
  return (
    <footer className="w-full bg-white border-t border-gray-200 mt-20 text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-12 border-b border-gray-100">
          <div className="flex items-start gap-4">
            <ShieldCheck className="w-8 h-8 text-gray-700 shrink-0" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">안전한 결제</h4>
              <p className="text-sm text-gray-500">KCP 공식 PG로 안전하게<br/>결제 정보를 보호합니다.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Headset className="w-8 h-8 text-gray-700 shrink-0" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">전문 상담 지원</h4>
              <p className="text-sm text-gray-500">전문 상담원이<br/>맞춤형 상담을 제공합니다.</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Wrench className="w-8 h-8 text-gray-700 shrink-0" />
            <div>
              <h4 className="font-bold text-gray-900 mb-1">무상 보증 12개월</h4>
              <p className="text-sm text-gray-500">12개월 무상보증으로<br/>안심하고 사용하세요.</p>
            </div>
          </div>
        </div>

        {/* Company Info & Links */}
        <div className="py-8 flex flex-col md:flex-row justify-between gap-8">
          <div className="text-sm leading-relaxed space-y-1">
            <div className="mb-4">
              <img src="/logo.png" alt="vd robotics" className="h-6 w-auto object-contain brightness-0 opacity-70" />
            </div>
            <p><strong>주식회사 브이디로보틱스 (VD Robotics Inc.)</strong></p>
            <p>대표자: 함판식 | 사업자등록번호: 119-88-01280</p>
            <p>통신판매업 신고번호: 2021-서울금천-0230</p>
            <p>주소: 서울특별시 금천구 가산디지털1로 5 대륭테크노타운 20차 1414~1418호</p>
            <p>고객센터: 1833-3482 (평일 10:00~19:00) | 이메일: mkt@vdrobotics.co.kr</p>
            <p>개인정보보호책임자: 김덕진</p>
            <p className="text-gray-400 mt-4">&copy; 2026 VD Robotics. All rights reserved.</p>
          </div>
          
          <div className="flex flex-col items-start gap-4 text-sm font-medium">
            <Link href="/terms" onClick={(e) => { if (onOpenModal) { e.preventDefault(); onOpenModal("terms"); } }} className="hover:text-red-500 flex items-center justify-between w-full text-left">
              이용약관 <span className="text-gray-300">&gt;</span>
            </Link>
            <Link href="/privacy" onClick={(e) => { if (onOpenModal) { e.preventDefault(); onOpenModal("privacy"); } }} className="hover:text-red-500 flex items-center justify-between w-full text-left">
              개인정보처리방침 <span className="text-gray-300">&gt;</span>
            </Link>
            <Link href="/refund" onClick={(e) => { if (onOpenModal) { e.preventDefault(); onOpenModal("refund"); } }} className="hover:text-red-500 flex items-center justify-between w-full text-left">
              환불 및 취소 정책 <span className="text-gray-300">&gt;</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
