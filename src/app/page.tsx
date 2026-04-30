"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PaymentForm from "@/components/PaymentForm";
import Modal from "@/components/Modal";
import { POLICY_CONTENT } from "@/constants/policyContent";

export default function Home() {
  const [modalType, setModalType] = useState<"terms" | "privacy" | "refund" | "productDetail" | null>(null);
  const [detailImage, setDetailImage] = useState<string | null>(null);

  const openModal = (type: "terms" | "privacy" | "refund") => setModalType(type);
  const openProductDetail = (image: string) => {
    setDetailImage(image);
    setModalType("productDetail");
  };
  const closeModal = () => {
    setModalType(null);
    setDetailImage(null);
  };

  const getModalTitle = () => {
    switch (modalType) {
      case "terms": return "이용약관";
      case "privacy": return "개인정보처리방침";
      case "refund": return "환불 및 취소 정책";
      case "productDetail": return "제품 상세 정보";
      default: return "";
    }
  };

  return (
    <>
      <Header />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 sm:py-12">
        <div className="mb-6 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">할부 상품 신청</h1>
          <p className="text-sm sm:text-base text-gray-500">아래 정보를 입력하고 결제를 완료하시면 영업일 기준 1~2일 이내 엔지니어가 연락드리고 설치 일정을 확정합니다.</p>
        </div>
        
        <PaymentForm onOpenModal={openModal} onOpenProductDetail={openProductDetail} />
      </main>
      <Footer onOpenModal={openModal} />

      <Modal 
        isOpen={!!modalType} 
        onClose={closeModal} 
        title={getModalTitle()}
        maxWidth={modalType === "productDetail" ? "max-w-4xl" : "max-w-2xl"}
      >
        {modalType === "productDetail" ? (
          <div className="flex justify-center">
            <img src={detailImage || ""} alt="product detail" className="w-full h-auto" />
          </div>
        ) : (
          modalType && POLICY_CONTENT[modalType as keyof typeof POLICY_CONTENT]
        )}
      </Modal>
    </>
  );
}
