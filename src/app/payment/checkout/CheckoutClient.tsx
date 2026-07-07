"use client";

import React, { useState, useEffect, useRef } from "react";
import { CheckCircle, Plus, Trash2, Clock } from "lucide-react";

type Order = any;

// 허용 카드사 목록 (KCP 영문 코드 기준)
const ALLOWED_CARDS = [
  { code: "CCLO", kcpCode: "71", name: "롯데(36)", maxQuota: 36 },
  { code: "CCDI", kcpCode: "61", name: "현대(36)", maxQuota: 36 },
  { code: "CCHN", kcpCode: "21", name: "하나(36)", maxQuota: 36 },
  { code: "CCKM", kcpCode: "11", name: "국민(36)", maxQuota: 36 },
  { code: "CCLG", kcpCode: "41", name: "신한(36)", maxQuota: 36 },
  { code: "CCBC", kcpCode: "31", name: "BC(24)", maxQuota: 24 },
  { code: "CCNH", kcpCode: "91", name: "농협(24)", maxQuota: 24 },
  { code: "CCSS", kcpCode: "51", name: "삼성(24)", maxQuota: 24 },
  { code: "CCWR", kcpCode: "33", name: "우리(24)", maxQuota: 24 },
];

// 천단위 콤마 포맷
const formatNumber = (n: number) => n.toLocaleString("ko-KR");
const parseFormattedNumber = (s: string) => parseInt(s.replace(/,/g, ""), 10) || 0;

export default function CheckoutClient({ initialOrder }: { initialOrder: Order }) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [isMobile, setIsMobile] = useState(false);
  const [origin, setOrigin] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(30 * 60);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [extendCount, setExtendCount] = useState(0);
  const MAX_EXTENSIONS = 3;

  // ── Derived values ──
  const totalAmount = order.totalAmount;
  const successfulTransactions = order.transactions?.filter((t: any) => t.status === "SUCCESS" && t.cancelAmount === 0) || [];
  const paidAmount = successfulTransactions.reduce((acc: number, t: any) => acc + t.amount, 0);
  const remainingAmount = totalAmount - paidAmount;
  const progressPercent = (paidAmount / totalAmount) * 100;

  const [paymentRows, setPaymentRows] = useState<any[]>(() => {
    const dbSuccess = initialOrder.transactions?.filter((t: any) => t.status === "SUCCESS" && t.cancelAmount === 0) || [];
    const dbPaid = dbSuccess.reduce((acc: number, t: any) => acc + t.amount, 0);
    const dbRemaining = initialOrder.totalAmount - dbPaid;
    const successRows = dbSuccess.map((t: any) => ({ ...t, id: t.id }));

    // 복구 로직: 모바일 리다이렉트나 팝업 취소로 인한 새로고침 시 기존 분할 내역 유지
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem('checkout_rows_' + initialOrder.id);
        if (saved) {
          const parsed = JSON.parse(saved);
          // DB에서 성공 처리된 내역(dbId)은 localStorage 펜딩 목록에서 제외
          const successDbIds = dbSuccess.map((t: any) => t.id);
          const parsedPending = parsed.filter((r: any) => 
            (r.status === "PENDING" || r.status === "FAILED") && !successDbIds.includes(r.dbId)
          );
          const parsedPendingTotal = parsedPending.reduce((sum: number, r: any) => sum + r.amount, 0);
          
          if (parsedPendingTotal === dbRemaining) {
            // DB 잔액과 localStorage PENDING 잔액이 일치하면 복원
            return [...successRows, ...parsedPending.map((r: any) => ({...r, status: 'PENDING'}))];
          }
        }
      } catch(e) {}
    }

    if (dbRemaining > 0) {
      return [...successRows, { id: Date.now(), amount: dbRemaining, method: "CARD", cardCode: "CCLO", kcpCode: "71", cardName: "롯데(36)", quota: 36, status: "PENDING" }];
    }
    return successRows;
  });

  // 상태 변경될 때마다 localStorage에 저장
  useEffect(() => {
    localStorage.setItem('checkout_rows_' + order.id, JSON.stringify(paymentRows));
  }, [paymentRows, order.id]);

  const fetchUpdatedOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${order.id}`);
      const data = await res.json();
      if (data.success && data.order) {
        setOrder(data.order);
        
        const dbSuccess = data.order.transactions?.filter((t: any) => t.status === "SUCCESS" && t.cancelAmount === 0) || [];
        const successIds = dbSuccess.map((t: any) => t.id);
        
        setPaymentRows(prevRows => {
          const remainingPending = prevRows.filter(r => r.status === "PENDING" && !successIds.includes(r.dbId));
          return [...dbSuccess.map((t: any) => ({ ...t, id: t.id })), ...remainingPending];
        });
      }
    } catch (error) {
      console.error("Failed to fetch updated order", error);
    }
  };

  // ── Effects ──
  useEffect(() => {
    setOrigin(window.location.origin);
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    setIsMobile(/android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua.toLowerCase()));

    // KCP PC 스마트결제 SDK 로드
    const script = document.createElement("script");
    const siteCd = process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000";
    script.src = (siteCd === "T0000" || siteCd === "A52Q7")
      ? "https://testspay.kcp.co.kr/plugin/kcp_spay_hub.js"
      : "https://spay.kcp.co.kr/plugin/kcp_spay_hub.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (timeLeft === 0 && paidAmount > 0 && paidAmount < totalAmount) {
      fetch('/api/payment/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, reason: 'TIMEOUT' })
      }).then(() => {
        alert("결제 시간이 만료되어 이전 결제 내역이 자동 취소되었습니다.");
        window.location.href = "/";
      });
    }
  }, [timeLeft, paidAmount, totalAmount, order.id]);

  const isProcessingRef = useRef(isProcessing);
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // KCP SDK 결제 완료(submit) 감지 및 로딩 화면 표시
  useEffect(() => {
    const originalSubmit = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function (...args) {
      if (this.id === "order_info") {
        setIsVerifying(true);
      }
      return originalSubmit.apply(this, args);
    };
    return () => {
      HTMLFormElement.prototype.submit = originalSubmit;
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      // BROWSER_CLOSED 롤백은 KCP 결제 완료 후 페이지 이동(reload/replace) 중에도 
      // 트리거되어 정상 결제를 취소시키는 치명적 버그를 유발하므로 제거합니다.
      // 롤백은 30분 타이머(cron 및 client)에서만 안전하게 처리합니다.
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (paidAmount === totalAmount && totalAmount > 0) {
      setIsSuccess(true);
    }
  }, [paidAmount, totalAmount]);

  const handleExtendTimer = () => {
    if (extendCount >= MAX_EXTENSIONS) {
      alert("시간 연장은 최대 3회까지 가능합니다.");
      return;
    }
    setTimeLeft((prev) => prev + 10 * 60);
    setExtendCount((prev) => prev + 1);
  };

  // ── Row handlers ──
  const updateRow = (id: number, field: string, value: any) => {
    setPaymentRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleCardChange = (id: number, cardCode: string) => {
    const card = ALLOWED_CARDS.find(c => c.code === cardCode);
    setPaymentRows(rows => rows.map(r => r.id === id ? { ...r, cardCode, kcpCode: card?.kcpCode || "", cardName: card?.name || "" } : r));
  };

  const addRow = () => {
    const currentTotal = paymentRows.filter(r => r.status === "PENDING").reduce((acc: number, r: any) => acc + (r.amount || 0), 0) + paidAmount;
    if (currentTotal >= totalAmount) {
      alert("이미 결제 총액에 도달했습니다.");
      return;
    }
    const hasVA = paymentRows.some(r => r.method === "VIRTUAL_ACCOUNT" && r.status === "PENDING");
    if (hasVA) {
      alert("가상계좌는 마지막 결제 수단으로만 사용할 수 있습니다.");
      return;
    }
    const newAmount = totalAmount - currentTotal;
    setPaymentRows([...paymentRows, { id: Date.now(), amount: newAmount, method: "CARD", cardCode: "CCLO", kcpCode: "71", cardName: "롯데(36)", quota: 36, status: "PENDING" }]);
  };

  const removeRow = (id: number) => {
    setPaymentRows(rows => rows.filter(r => r.id !== id));
  };

  const pendingRows = paymentRows.filter(r => r.status === "PENDING");
  const currentTotalInput = pendingRows.reduce((acc: number, r: any) => acc + (r.amount || 0), 0) + paidAmount;
  const isTotalMatched = currentTotalInput === totalAmount;

  // ── Payment ──
  const handlePayment = async () => {
    if (!isTotalMatched) {
      alert("모든 결제 수단의 합계가 총 결제 금액과 일치해야 합니다.");
      return;
    }
    const pendingRow = paymentRows.find(r => r.status === "PENDING");
    if (!pendingRow) return;

    if (pendingRow.method === "CARD" && !pendingRow.cardCode) {
      alert("카드사를 선택해 주세요.");
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch("/api/payment/split-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          amount: pendingRow.amount,
          method: pendingRow.method,
          cardCompanyName: pendingRow.cardName,
        })
      });
      const data = await res.json();
      if (!data.success) {
        let errorMsg = "결제 요청 실패: " + data.error;
        if (data.debug) {
          errorMsg += "\n\n[디버그 정보]";
          errorMsg += "\nURL: " + data.debug.url;
          errorMsg += "\nRequest: " + JSON.stringify(data.debug.request);
          errorMsg += "\nResponse: " + JSON.stringify(data.debug.response);
        }
        alert(errorMsg);
        setIsProcessing(false);
        return;
      }
      
      // Update the row with the newly created DB transaction ID
      updateRow(pendingRow.id, "dbId", data.transactionId);

      const kcpForm = document.getElementById("order_info") as HTMLFormElement;
      if (kcpForm) {
        (document.getElementById("good_mny") as HTMLInputElement).value = pendingRow.amount.toString();
        
        // PC와 모바일의 결제수단 코드 규격 분기 처리
        const mobilePayMethod = pendingRow.method === "CARD" ? "CARD" : "VCNT";
        const pcPayMethod = pendingRow.method === "CARD" ? "100000000000" : "001000000000";
        (document.getElementById("pay_method") as HTMLInputElement).value = isMobile ? mobilePayMethod : pcPayMethod;

        (document.getElementById("ordr_idxx") as HTMLInputElement).value = data.kcpOrderNo;

        // PC 및 모바일 환경 모두 사용자가 선택한 단일 카드사 코드를 주입하여 팝업에서 해당 카드사만 노출되도록 설정
        if (pendingRow.method === "CARD" && pendingRow.cardCode) {
          (document.getElementById("used_card") as HTMLInputElement).value = pendingRow.cardCode;
        } else {
          (document.getElementById("used_card") as HTMLInputElement).value = "";
        }

        // KCP 정책 상 50,000원 미만은 할부 불가이므로 일시불(0)로 강제 설정
        // 50,000원 이상이면 카드사별 최대 할부 개월수로 설정 (롯데/현대/하나/국민/신한=36, BC/농협/삼성/우리=24)
        const isInstallmentAllowed = pendingRow.amount >= 50000;
        const selectedCard = ALLOWED_CARDS.find(c => c.code === pendingRow.cardCode);
        const maxQuota = selectedCard?.maxQuota || 36;
        (document.getElementById("quotaopt") as HTMLInputElement).value = isInstallmentAllowed ? String(maxQuota) : "0";

        if (data.approval_key) {
          (document.getElementById("approval_key") as HTMLInputElement).value = data.approval_key;
          (document.getElementById("PayUrl") as HTMLInputElement).value = data.PayUrl;
          
          if (isMobile) {
            // 모바일은 현재 창에서 PayUrl로 폼 제출
            kcpForm.action = data.PayUrl;
            kcpForm.target = "_self";
            setTimeout(() => setIsProcessing(false), 3000); 
            kcpForm.submit();
          } else {
            // PC: KCP PC 스마트결제 SDK 호출 (action, target 변경 불필요, SDK가 알아서 팝업 띄움)
            if (typeof window !== "undefined" && (window as any).KCP_Pay_Execute_Web) {
              setTimeout(() => setIsProcessing(false), 3000);
              (window as any).KCP_Pay_Execute_Web(kcpForm);
            } else {
              alert("KCP 결제 모듈이 완전히 로드되지 않았습니다. 잠시 후 다시 시도해주세요.");
              setIsProcessing(false);
            }
          }
        } else {
          alert("결제 등록에 실패했습니다. (approval_key 누락)");
          setIsProcessing(false);
        }
      }
    } catch (e) {
      console.error(e);
      alert("결제 진행 중 오류가 발생했습니다.");
      setIsProcessing(false);
    }
  };

  const handleCancelPayment = async (transactionId: string) => {
    if (!confirm("결제를 취소하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/payment/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId })
      });
      const data = await res.json();
      if (data.success) {
        alert("취소되었습니다.");
        fetchUpdatedOrder();
      } else {
        alert("취소 실패: " + data.error);
      }
    } catch (e) {
      alert("취소 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-8">
      {isVerifying && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-16 h-16 border-4 border-white/20 border-t-red-500 rounded-full animate-spin mb-6"></div>
          <p className="text-white text-xl font-bold">결제를 확인 중입니다...</p>
          <p className="text-white/80 mt-2">잠시만 기다려주세요.</p>
        </div>
      )}

      {/* 1. Order Summary */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <h2 className="text-xl font-bold mb-6">주문 정보 요약</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-sm">
          <div><span className="text-gray-500">주문자:</span> <span className="font-medium">{order.ordererName} ({order.ordererPhone})</span></div>
          <div><span className="text-gray-500">상품명:</span> <span className="font-medium">{order.productName} x {order.quantity}</span></div>
          <div className="sm:col-span-2"><span className="text-gray-500">배송지:</span> <span className="font-medium">{order.shippingAddress} {order.shippingDetail}</span></div>
          {order.requestNotes && <div className="sm:col-span-2"><span className="text-gray-500">요청사항:</span> <span className="font-medium">{order.requestNotes}</span></div>}
        </div>
      </section>

      {/* Timer Alert */}
      {paidAmount > 0 && paidAmount < totalAmount && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-orange-700">
            <Clock className="w-5 h-5 animate-pulse" />
            <span className="font-medium">⚠️ 남은 금액을 {Math.floor(timeLeft / 60)}분 {timeLeft % 60}초 내에 결제하지 않으시면 이전 결제 내역이 자동 취소됩니다.</span>
          </div>
          {timeLeft <= 600 && extendCount < MAX_EXTENSIONS && (
            <button onClick={handleExtendTimer} className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-bold rounded-lg transition-colors">
              10분 연장하기 ({MAX_EXTENSIONS - extendCount}회 남음)
            </button>
          )}
        </div>
      )}

      {/* 2. Progress Bar */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-xl font-bold">결제 진행 현황</h2>
            <p className="text-gray-500 mt-1">총 결제 금액 <span className="text-xl font-black text-gray-900 ml-1">{totalAmount.toLocaleString()}원</span></p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">남은 금액</p>
            <p className="text-2xl font-black text-red-500">{remainingAmount.toLocaleString()}원</p>
          </div>
        </div>
        <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 transition-all duration-1000 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </section>

      {/* 3. Split Payment UI */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Area: 결제 설정 및 버튼 */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold">결제 수단 및 금액 설정</h2>

            <div className="space-y-4">
              {paymentRows.map((row, index) => (
                <div key={row.id} className={`p-4 sm:p-6 rounded-xl border-2 transition-all ${row.status === 'SUCCESS' ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
                  <div className="flex flex-col gap-4">

                    {row.status === "SUCCESS" ? (
                      /* ── 결제 완료된 행 ── */
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle className="w-6 h-6 text-green-500" />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{row.cardCompanyName || row.method}</div>
                            <div className="text-sm text-gray-500">승인번호: {row.pgAppNo}</div>
                          </div>
                        </div>
                        <div className="text-xl font-black">{row.amount.toLocaleString()}원</div>
                        <button
                          onClick={() => handleCancelPayment(row.id)}
                          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm font-medium"
                        >
                          결제 취소
                        </button>
                      </div>
                    ) : (
                      /* ── 결제 대기 행 ── */
                      <div className="flex-1 w-full space-y-4">
                        {/* Row 1: 결제수단 + 카드사 */}
                        <div className="flex flex-wrap gap-3 items-center">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">결제수단</label>
                            <select
                              value={row.method}
                              onChange={(e) => updateRow(row.id, "method", e.target.value)}
                              className="px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-red-500 bg-white text-sm font-medium"
                            >
                              <option value="CARD">신용카드</option>
                              <option value="VIRTUAL_ACCOUNT">가상계좌</option>
                            </select>
                          </div>

                          {row.method === "CARD" && (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">카드사 선택</label>
                              <select
                                value={row.cardCode || ""}
                                onChange={(e) => handleCardChange(row.id, e.target.value)}
                                className="px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-red-500 bg-white text-sm font-medium"
                              >
                                {ALLOWED_CARDS.map(card => (
                                  <option key={card.code} value={card.code}>{card.name}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {index > 0 && paymentRows.filter(r => r.status === "PENDING").length > 1 && (
                            <button onClick={() => removeRow(row.id)} className="p-3 text-gray-400 hover:text-red-500 transition-colors mt-4">
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>

                        {/* Row 2: 금액 입력 */}
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">결제 금액</label>
                          <div className="relative">
                            <input
                              type="text"
                              value={row.amount ? formatNumber(row.amount) : ''}
                              onChange={(e) => {
                                const raw = parseFormattedNumber(e.target.value);
                                updateRow(row.id, "amount", raw);
                              }}
                              className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-red-500 pr-12 text-right font-bold text-lg"
                              placeholder="금액 입력"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">원</span>
                          </div>
                        </div>

                        {/* Row 3: Quick Buttons */}
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => updateRow(row.id, "amount", (row.amount || 0) + 1000000)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors">+100만</button>
                          <button type="button" onClick={() => updateRow(row.id, "amount", (row.amount || 0) + 100000)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors">+10만</button>
                          <button type="button" onClick={() => updateRow(row.id, "amount", Math.max(0, (row.amount || 0) - 1000000))} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">-100만</button>
                          <button type="button" onClick={() => updateRow(row.id, "amount", Math.max(0, (row.amount || 0) - 100000))} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors">-10만</button>
                          <button type="button" onClick={() => updateRow(row.id, "amount", remainingAmount)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-lg transition-colors">전액</button>
                          <button type="button" onClick={() => updateRow(row.id, "amount", 0)} className="px-3 py-1.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-sm font-medium rounded-lg transition-colors">초기화</button>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ))}
            </div>

            {paidAmount < totalAmount && (
              <button
                onClick={addRow}
                className="mt-4 w-full py-4 border-2 border-dashed border-gray-300 text-gray-500 font-bold rounded-xl hover:border-red-500 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" /> 분할결제 추가하기
              </button>
            )}

            <div className="mt-8 pt-8 border-t border-gray-100">
              <button
                onClick={handlePayment}
                disabled={!isTotalMatched || paidAmount === totalAmount || isProcessing}
                className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-black text-lg py-5 rounded-xl shadow-lg transition-all"
              >
                {paidAmount === totalAmount ? "결제가 완료되었습니다" : isProcessing ? "처리 중..." : "결제 진행"}
              </button>
              {!isTotalMatched && paidAmount < totalAmount && (
                <p className="text-red-500 text-sm text-center mt-3 font-medium">모든 결제 금액의 합계가 총 결제 금액과 일치해야 합니다.</p>
              )}
            </div>
          </div>

          {/* Right Area: 결제전 확인 사항 */}
          <div>
            <div className="bg-gray-50 border border-gray-200/60 rounded-2xl p-5 sm:p-6 lg:sticky lg:top-4">
              <h3 className="font-bold text-gray-950 text-base mb-4 flex items-center gap-2">
                <span className="w-1.5 h-4 bg-red-500 rounded-full"></span>
                결제전 확인 사항
              </h3>
              <div className="space-y-4 text-xs sm:text-sm text-gray-600 leading-relaxed">
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">(1) 할부기간 선택</h4>
                  <p className="text-gray-500 text-xs sm:text-[13px]">
                    무이자할부는 최대 36개월이며, 할부 기간 선택 시 &quot;(무이자)&quot; 표시를 꼭 확인 후 선택해 주시기 바랍니다. &quot;(무이자)&quot; 표기가 없는 할부 기간은 카드사에서 이자가 청구됩니다.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">(2) 무이자 할부 카드사</h4>
                  <div className="flex flex-col text-gray-500 text-xs sm:text-[13px] space-y-0.5">
                    <span>- 36, 24, 2~12개월 : 롯데 / 현대 / 하나 / 국민 / 신한</span>
                    <span>- 24, 2~12개월 : BC / 농협 / 삼성 / 우리</span>
                    <span className="mt-1">* BC카드 예외 : IBK/신한 최대12개월, KB국민 최대 18개월</span>
                    <span className="mt-1">* 법인카드 결제 불가</span>
                  </div>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">(3) 카드 한도 확인</h4>
                  <p className="text-gray-500 text-xs sm:text-[13px]">
                    결제 카드의 잔여 한도를 확인 후에 결제를 진행해 주세요.
                  </p>
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 mb-1">(4) 분할결제</h4>
                  <p className="text-gray-500 text-xs sm:text-[13px]">
                    카드 한도가 부족한 경우 &quot;분할결제 추가하기&quot;를 통해 나누어 결제해 주세요.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KCP Hidden Form */}
      <form
        name="order_info"
        id="order_info"
        method="post"
        acceptCharset="euc-kr"
        action={isMobile
          ? (process.env.NEXT_PUBLIC_KCP_MOBILE_URL || "https://testmweb.kcp.co.kr/v3/pay/hp_pay.jsp")
          : "/api/payment/split-callback"}
        className="hidden"
      >
        <input type="hidden" name="charset" value="utf-8" />
        <input type="hidden" name="pay_method" id="pay_method" value="" />
        <input type="hidden" name="ordr_idxx" id="ordr_idxx" value="" />
        <input type="hidden" name="good_name" value={order.productName} />
        <input type="hidden" name="good_mny" id="good_mny" value="" />
        <input type="hidden" name="quotaopt" id="quotaopt" value="36" />
        <input type="hidden" name="buyr_name" value={order.ordererName} />
        <input type="hidden" name="buyr_mail" value="" />
        <input type="hidden" name="buyr_tel1" value={order.ordererPhone} />
        <input type="hidden" name="site_cd" value={process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000"} />
        <input type="hidden" name="req_tx" value="pay" />
        <input type="hidden" name="currency" value="410" />
        <input type="hidden" name="shop_name" value="브이디로보틱스" />
        <input type="hidden" name="approval_key" id="approval_key" value="" />
        <input type="hidden" name="PayUrl" id="PayUrl" value="" />
        <input type="hidden" name="good_cd" value="00" />
        <input type="hidden" name="Ret_URL" value={`${process.env.NEXT_PUBLIC_BASE_URL || origin}/api/payment/split-callback?fallbackOrderId=${order.id}`} />

        {/* KCP PC SDK Auth Output Fields */}
        <input type="hidden" name="res_cd" value="" />
        <input type="hidden" name="res_msg" value="" />
        <input type="hidden" name="enc_info" value="" />
        <input type="hidden" name="enc_data" value="" />
        <input type="hidden" name="ret_pay_method" value="" />
        <input type="hidden" name="tran_cd" value="" />
        <input type="hidden" name="use_pay_method" value="" />
        <input type="hidden" name="ordr_chk" value="" />

        {/* Card restrictions & installment */}
        <input type="hidden" name="used_card" id="used_card" value="" />
        <input type="hidden" name="used_card_YN" value="Y" />
      </form>

      {/* 주문 완료 모달 */}
      {isSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-500 p-8 text-center text-white">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-2xl font-bold mb-1">결제 완료!</h2>
              <p className="text-white/80 text-sm">주문이 성공적으로 접수되었습니다.</p>
            </div>
            <div className="p-8">
              <div className="space-y-4 mb-8">
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">주문번호</span>
                  <span className="font-bold text-gray-900">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">신청 상품</span>
                  <span className="font-medium">{order.productName}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-50 text-sm">
                  <span className="text-gray-500">총 결제금액</span>
                  <span className="font-bold text-red-500 text-lg">{order.totalAmount.toLocaleString()}원</span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 mb-8">
                <p className="text-gray-600 text-sm leading-relaxed text-center font-medium">
                  영업일 기준 <span className="text-red-500">1~2일 이내</span> 엔지니어가<br />
                  설치 일정 확인을 위해 연락드립니다.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/'}
                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98]"
              >
                메인으로 이동
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
