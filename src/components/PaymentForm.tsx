"use client";

import { useState } from "react";
import { User, Building2, MapPin, MessageSquare, CheckCircle, Minus, Plus, Lock, Upload, Search } from "lucide-react";
import { useDaumPostcodePopup } from "react-daum-postcode";

const PRODUCTS = [
  {
    id: "cleaver-a1-pro",
    name: "클리버 A1 Pro",
    monthlyPrice: 218900,
    contractMonths: 36,
    imageUrl: "/A1_image.jpg",
    detailImageUrl: "/a1.jpg",
  },
  {
    id: "cleaver-sh1",
    name: "클리버 SH1",
    monthlyPrice: 273900,
    contractMonths: 36,
    imageUrl: "/sh1_image.jpg",
    detailImageUrl: "/sh1.jpg",
  },
];

export default function PaymentForm({ onOpenModal, onOpenProductDetail }: {
  onOpenModal: (type: "terms" | "privacy" | "refund") => void,
  onOpenProductDetail: (image: string) => void
}) {
  const [formData, setFormData] = useState({
    ordererName: "",
    ordererPhone: "",
    businessName: "",
    businessRegNumber: "",
    shippingAddress: "",
    shippingDetail: "",
    requestNotes: "",
    termsAgreed: false,
  });

  const [businessRegCertFile, setBusinessRegCertFile] = useState<File | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(PRODUCTS[0].id);
  const [quantity, setQuantity] = useState(1);
  const [contractMonths, setContractMonths] = useState(36);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    productName: string;
    totalAmount: number;
  } | null>(null);

  const resetForm = () => {
    setFormData({
      ordererName: "",
      ordererPhone: "",
      businessName: "",
      businessRegNumber: "",
      shippingAddress: "",
      shippingDetail: "",
      requestNotes: "",
      termsAgreed: false,
    });
    setBusinessRegCertFile(null);
    setQuantity(1);
    setSelectedProductId(PRODUCTS[0].id);
  };

  const selectedProduct = PRODUCTS.find((p) => p.id === selectedProductId)!;
  const totalMonthlyPrice = selectedProduct.monthlyPrice * quantity;
  const totalPaymentPrice = totalMonthlyPrice * contractMonths;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setBusinessRegCertFile(e.target.files[0]);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const open = useDaumPostcodePopup();

  const handleComplete = (data: any) => {
    let fullAddress = data.address;
    let extraAddress = "";

    if (data.addressType === "R") {
      if (data.bname !== "") {
        extraAddress += data.bname;
      }
      if (data.buildingName !== "") {
        extraAddress += extraAddress !== "" ? `, ${data.buildingName}` : data.buildingName;
      }
      fullAddress += extraAddress !== "" ? ` (${extraAddress})` : "";
    }

    setFormData((prev) => ({
      ...prev,
      shippingAddress: fullAddress,
    }));
  };

  const handleSearchAddress = () => {
    open({ onComplete: handleComplete });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.termsAgreed) {
      alert("개인정보 수집 및 이용에 동의해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        data.append(key, value.toString());
      });
      data.append("productName", selectedProduct.name);
      data.append("quantity", quantity.toString());
      data.append("contractMonths", contractMonths.toString());
      data.append("monthlyFee", selectedProduct.monthlyPrice.toString());
      data.append("totalAmount", totalPaymentPrice.toString());

      if (businessRegCertFile) {
        data.append("businessRegCertFile", businessRegCertFile);
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        body: data,
      });

      const result = await res.json();
      if (result.success) {
        const kcpForm = document.getElementById("order_info") as HTMLFormElement;
        if (kcpForm) {
          const setFieldValue = (id: string, value: string) => {
            const el = document.getElementById(id) as HTMLInputElement;
            if (el) el.value = value;
          };

          setFieldValue("good_name", selectedProduct.name);
          setFieldValue("good_mny", totalPaymentPrice.toString());
          setFieldValue("buyr_name", formData.ordererName);
          setFieldValue("buyr_tel1", formData.ordererPhone);
          setFieldValue("ordr_idxx", result.orderNumber);

          setOrderSuccess({
            orderNumber: result.orderNumber,
            productName: selectedProduct.name,
            totalAmount: totalPaymentPrice,
          });

          resetForm();

          try {
            if (typeof (window as any).KCP_Pay_Execute_Web !== "undefined") {
              (window as any).m_Completepayment = function (form: any, closeEvent: any) {
                form.action = "/api/payment/callback";
                form.submit();
              };
              (window as any).KCP_Pay_Execute_Web(kcpForm);
            } else {
              kcpForm.submit();
            }
          } catch (e) {
            console.error("KCP payment window error:", e);
            kcpForm.submit();
          }
        }
      } else {
        alert("주문 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } catch (error) {
      console.error(error);
      alert("주문 처리 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-8 relative">
        {/* Left Column - Forms */}
        <div className="flex-1 space-y-6">

          {/* 01. 주문자 정보 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <User className="text-red-500 w-5 h-5" /> 01. 주문자 정보
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">성명 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="ordererName"
                  value={formData.ordererName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors"
                  placeholder="성명을 입력해 주세요."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">연락처 <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  name="ordererPhone"
                  value={formData.ordererPhone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors"
                  placeholder="'-' 없이 숫자만 입력해 주세요."
                  required
                />
              </div>
            </div>
          </section>

          {/* 02. 사업자 정보 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Building2 className="text-red-500 w-5 h-5" /> 02. 사업자 정보 <span className="text-sm font-normal text-gray-400 ml-1">(선택)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">사업자명</label>
                <input
                  type="text"
                  name="businessName"
                  value={formData.businessName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors"
                  placeholder="사업자명을 입력해 주세요."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">사업자등록번호</label>
                <input
                  type="text"
                  name="businessRegNumber"
                  value={formData.businessRegNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors"
                  placeholder="'-' 없이 숫자만 입력해 주세요."
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">사업자등록증 첨부</label>
              <div className="flex items-center gap-4">
                <label className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors w-full bg-white">
                  <Upload className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    {businessRegCertFile ? businessRegCertFile.name : "파일 선택"}
                  </span>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            </div>
          </section>

          {/* 03. 배송지 정보 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <MapPin className="text-red-500 w-5 h-5" /> 03. 배송지 정보
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">배송지주소 <span className="text-red-500">*</span></label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    name="shippingAddress"
                    value={formData.shippingAddress}
                    onChange={handleInputChange}
                    className="flex-1 px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors bg-gray-50 cursor-pointer text-sm sm:text-base"
                    placeholder="주소 검색 버튼을 눌러 주세요."
                    readOnly
                    required
                    onClick={handleSearchAddress}
                  />
                  <button type="button" onClick={handleSearchAddress} className="px-6 py-3 bg-[var(--color-brand-red)] hover:bg-[var(--color-brand-red-hover)] text-white font-medium rounded-lg transition-colors whitespace-nowrap flex items-center justify-center gap-2 text-sm sm:text-base">
                    <Search className="w-4 h-4" /> 주소 검색
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">상세주소 <span className="text-sm font-normal text-gray-400 ml-1">(선택)</span></label>
                <input
                  type="text"
                  name="shippingDetail"
                  value={formData.shippingDetail}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors"
                  placeholder="상세주소를 입력해 주세요."
                />
              </div>
            </div>
          </section>

          {/* 04. 요청사항 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <MessageSquare className="text-red-500 w-5 h-5" /> 04. 요청사항 <span className="text-sm font-normal text-gray-400 ml-1">(선택)</span>
            </h3>
            <textarea
              name="requestNotes"
              value={formData.requestNotes}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none transition-colors resize-none h-32"
              placeholder="요청사항이 있으시면 입력해 주세요."
              maxLength={500}
            />
            <div className="text-right text-xs text-gray-400 mt-2">
              {formData.requestNotes.length} / 500
            </div>
          </section>

          {/* 05. 약관 동의 */}
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
              <CheckCircle className="text-red-500 w-5 h-5" /> 05. 약관 동의
            </h3>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  name="termsAgreed"
                  checked={formData.termsAgreed}
                  onChange={handleInputChange}
                  className="w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-500"
                  required
                />
                <span className="text-gray-700 font-medium">(필수) 개인정보 수집 및 이용에 동의합니다.</span>
              </label>
              <button
                type="button"
                onClick={() => onOpenModal("privacy")}
                className="text-sm text-red-500 hover:underline"
              >
                전문 보기 &gt;
              </button>
            </div>
          </section>

        </div>

        {/* Right Column - Summary */}
        <aside className="lg:w-[400px] space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm sticky top-24 overflow-hidden">
            <div className="p-4 sm:p-6 bg-gray-50/50 border-b border-gray-100">
              <h3 className="text-lg font-bold">주문 신청 내역</h3>
            </div>

            <div className="p-4 sm:p-6 space-y-6">
              {/* 01. 상품 선택 */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span> 01. 상품 선택
                </h4>
                <div className="space-y-3">
                  {PRODUCTS.map((product) => (
                    <label
                      key={product.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedProductId === product.id
                          ? "border-red-500 bg-red-50/30"
                          : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="productId"
                        value={product.id}
                        checked={selectedProductId === product.id}
                        onChange={() => setSelectedProductId(product.id)}
                        className="w-4 h-4 text-red-600 focus:ring-red-500"
                      />
                      <img src={product.imageUrl} alt={product.name} className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg bg-gray-100" />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm sm:text-base truncate">{product.name}</div>
                        <div className="text-red-500 font-bold text-xs sm:text-sm">월 {product.monthlyPrice.toLocaleString()}원</div>
                        <div className="text-[10px] text-gray-400">36개월 무이자</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onOpenProductDetail(product.detailImageUrl);
                        }}
                        className="p-1 sm:p-2 text-gray-400 hover:text-gray-600"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </label>
                  ))}
                </div>
              </div>

              {/* 02. 수량 및 계약 */}
              <div>
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span> 02. 수량 및 계약
                </h4>
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden h-12">
                      <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} className="px-4 text-gray-500 hover:bg-gray-50 h-full flex items-center justify-center">
                        <Minus className="w-4 h-4" />
                      </button>
                      <div className="flex-1 text-center font-medium border-x border-gray-300 h-full flex items-center justify-center">
                        {quantity}
                      </div>
                      <button type="button" onClick={() => setQuantity(quantity + 1)} className="px-4 text-gray-500 hover:bg-gray-50 h-full flex items-center justify-center">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex-[2]">
                    <select
                      value={contractMonths}
                      onChange={(e) => setContractMonths(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg px-4 h-12 outline-none focus:border-red-500"
                    >
                      <option value={36}>36개월 (기본)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 03. 결제 금액 요약 */}
              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="w-1 h-4 bg-red-500 rounded-full"></span> 03. 결제 금액 요약
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-500">
                    <span>상품 단가 (월)</span>
                    <span>{selectedProduct.monthlyPrice.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>수량</span>
                    <span>{quantity}개</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>할부 기간</span>
                    <span>{contractMonths}개월</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-dashed border-gray-200">
                    <span>월 할부 납입금</span>
                    <span className="text-red-500">{totalMonthlyPrice.toLocaleString()}원</span>
                  </div>
                  <div className="mt-6 bg-red-50 p-4 rounded-xl text-center">
                    <div className="text-xs text-gray-500 mb-1">총 할부 납입 총액 (36개월)</div>
                    <div className="text-xl sm:text-2xl font-black text-red-500">
                      {totalPaymentPrice.toLocaleString()}<span className="text-base font-bold ml-1">원</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">* VAT 포함가</div>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="space-y-2 text-[11px] sm:text-xs text-red-500 font-bold">
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">(1) 결제가능 카드사 :</span>
                      <span className="text-gray-600 font-medium">롯데 / 현대 / 하나 / 신한</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0">(2) 법인카드 결제 불가</span>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 text-base sm:text-lg mt-6"
                >
                  {isSubmitting ? "처리 중..." : "36개월 무이자 할부 신청하기"}
                </button>
              </div>
            </div>
          </div>
        </aside>
      </form>

      {/* KCP PG Hidden Form Structure */}
      <form name="order_info" id="order_info" method="post" action="https://testpaygw.kcp.co.kr/scripts/pay_hub/rmApproval.jsp" className="hidden">
        <input type="hidden" name="pay_method" value="100000000000" />
        <input type="hidden" name="ordr_idxx" id="ordr_idxx" value="" />
        <input type="hidden" name="good_name" id="good_name" value="" />
        <input type="hidden" name="good_mny" id="good_mny" value="" />
        <input type="hidden" name="buyr_name" id="buyr_name" value="" />
        <input type="hidden" name="buyr_mail" value={process.env.NEXT_PUBLIC_KCP_BUYER_EMAIL || "customer@vdrobotics.co.kr"} />
        <input type="hidden" name="buyr_tel1" id="buyr_tel1" value="" />
        <input type="hidden" name="site_cd" value={process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000"} />
        <input type="hidden" name="site_name" value="브이디로보틱스" />
        <input type="hidden" name="req_tx" value="pay" />
        <input type="hidden" name="currency" value="WON" />
        <input type="hidden" name="Ret_URL" value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/payment/callback`} />
      </form>

      {/* 주문 완료 모달 */}
      {orderSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-red-500 p-8 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-1">할부 신청 완료!</h2>
              <p className="text-white/80 text-sm">주문이 성공적으로 접수되었습니다.</p>
            </div>

            <div className="p-8">
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">주문번호</span>
                  <span className="font-bold text-gray-900">{orderSuccess.orderNumber}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">신청 상품</span>
                  <span className="font-medium">{orderSuccess.productName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">총 결제금액</span>
                  <span className="font-bold text-red-500 text-lg">{orderSuccess.totalAmount.toLocaleString()}원</span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-8">
                <p className="text-gray-600 text-sm leading-relaxed text-center font-medium">
                  영업일 기준 <span className="text-red-500">1~2일 이내</span> 엔지니어가<br />
                  설치 일정 확인을 위해 연락드립니다.
                </p>
              </div>

              <button
                onClick={() => setOrderSuccess(null)}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
