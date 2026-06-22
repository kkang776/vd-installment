"use client";

import React, { useState, useEffect, useRef } from "react";
import { CheckCircle, Plus, Trash2, Clock } from "lucide-react";

type Order = any;

// 허용 카드사 목록 (KCP 영문 코드 기준)
const ALLOWED_CARDS = [
  { code: "CCBC", kcpCode: "31", name: "BC카드" },
  { code: "CCLO", kcpCode: "71", name: "롯데카드" },
  { code: "CCWR", kcpCode: "33", name: "우리카드" },
  { code: "CCKB", kcpCode: "11", name: "KB국민카드" },
  { code: "CCHN", kcpCode: "21", name: "하나카드" },
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
    // Reconstruct rows from server data (critical for mobile redirect recovery)
    const dbSuccess = initialOrder.transactions?.filter((t: any) => t.status === "SUCCESS" && t.cancelAmount === 0) || [];
    const dbPaid = dbSuccess.reduce((acc: number, t: any) => acc + t.amount, 0);
    const dbRemaining = initialOrder.totalAmount - dbPaid;
    const successRows = dbSuccess.map((t: any) => ({ ...t, id: t.id }));
    if (dbRemaining > 0) {
      return [...successRows, { id: Date.now(), amount: dbRemaining, method: "CARD", cardCode: "CCBC", kcpCode: "31", cardName: "BC카드", quota: 36, status: "PENDING" }];
    }
    return successRows;
  });

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

  useEffect(() => {
    const handleBeforeUnload = () => {
      // 결제창 이동 중(isProcessing = true)일 때는 롤백하지 않음
      if (paidAmount > 0 && paidAmount < totalAmount && !isSuccess && !isProcessingRef.current) {
        navigator.sendBeacon('/api/payment/rollback', JSON.stringify({ orderId: order.id, reason: 'BROWSER_CLOSED' }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [paidAmount, totalAmount, order.id, isSuccess]);

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
    setPaymentRows([...paymentRows, { id: Date.now(), amount: newAmount, method: "CARD", cardCode: "CCBC", kcpCode: "31", cardName: "BC카드", quota: 36, status: "PENDING" }]);
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
        (document.getElementById("pay_method") as HTMLInputElement).value = pendingRow.method === "CARD" ? "CARD" : "VCNT";
        (document.getElementById("ordr_idxx") as HTMLInputElement).value = data.kcpOrderNo;
        (document.getElementById("quotaopt") as HTMLInputElement).value = "36";

        // Set card company restriction using KCP English code (CCXX)
        if (pendingRow.method === "CARD" && pendingRow.cardCode) {
          (document.getElementById("used_card") as HTMLInputElement).value = pendingRow.cardCode;
        }

        if (data.approval_key) {
          (document.getElementById("approval_key") as HTMLInputElement).value = data.approval_key;
          (document.getElementById("PayUrl") as HTMLInputElement).value = data.PayUrl;
          
          // KCP 결제창 액션 URL 설정
          const payUrl = data.PayUrl;
          if (isMobile) {
            kcpForm.action = payUrl;
          } else {
            kcpForm.action = payUrl.substring(0, payUrl.lastIndexOf("/")) + "/jsp/encodingFilter/encodingFilter.jsp";
          }
          
          if (!isMobile) {
            // PC는 팝업창으로 결제 진행
            const popup = window.open("", "kcp_popup", "width=820,height=600,resizable=yes,scrollbars=yes");
            if (popup) {
              kcpForm.target = "kcp_popup";
            } else {
              // 팝업 차단 시 현재 창에서 진행
              kcpForm.target = "_self";
            }
          } else {
            // 모바일은 현재 창에서 진행
            kcpForm.target = "_self";
          }
          
          // 진행 중 상태 유지 (팝업 또는 창 이동 대기)
          setTimeout(() => setIsProcessing(false), 3000); 
          kcpForm.submit();
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
                  <h4 className="font-bold text-gray-900 mb-1">(2) 할부 가능 카드</h4>
                  <p className="text-gray-500 text-xs sm:text-[13px]">
                    BC / 롯데 / 하나 / 국민 / 하나, 법인카드 불가
                  </p>
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
          : (process.env.NEXT_PUBLIC_KCP_PC_URL || "https://testpaygw.kcp.co.kr/scripts/pay_hub/rmApproval.jsp")}
        className="hidden"
      >
        <input type="hidden" name="pay_method" id="pay_method" value="" />
        <input type="hidden" name="ordr_idxx" id="ordr_idxx" value="" />
        <input type="hidden" name="good_name" value={order.productName} />
        <input type="hidden" name="good_mny" id="good_mny" value="" />
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
        <input type="hidden" name="Ret_URL" value={`${process.env.NEXT_PUBLIC_BASE_URL || origin}/api/payment/split-callback`} />

        {/* Card restrictions & installment */}
        <input type="hidden" name="quotaopt" id="quotaopt" value="36" />
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
