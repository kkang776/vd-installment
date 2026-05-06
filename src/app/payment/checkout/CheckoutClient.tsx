"use client";

import { useState, useEffect, useMemo } from "react";
import { CheckCircle, AlertCircle, Plus, X, CreditCard, Landmark, Trash2, Clock } from "lucide-react";

type Order = any; // Will type properly later
type PaymentTransaction = any;

export default function CheckoutClient({ initialOrder }: { initialOrder: Order }) {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [isMobile, setIsMobile] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(30 * 60); // 30 minutes in seconds

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    };
    setIsMobile(checkMobile());
  }, []);

  // Timer logic
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

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (paidAmount > 0 && paidAmount < totalAmount && !isSuccess) {
        navigator.sendBeacon('/api/payment/rollback', JSON.stringify({ orderId: order.id, reason: 'BROWSER_CLOSED' }));
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [paidAmount, totalAmount, order.id, isSuccess]);

  const handleExtendTimer = () => {
    setTimeLeft((prev) => prev + 10 * 60);
  };

  const totalAmount = order.totalAmount;
  const successfulTransactions = order.transactions?.filter((t: any) => t.status === "SUCCESS" && t.cancelAmount === 0) || [];
  const paidAmount = successfulTransactions.reduce((acc: number, t: any) => acc + t.amount, 0);
  const remainingAmount = totalAmount - paidAmount;
  const progressPercent = (paidAmount / totalAmount) * 100;

  const [paymentRows, setPaymentRows] = useState<any[]>([
    { id: 1, amount: remainingAmount, method: "CARD", status: "PENDING" }
  ]);

  useEffect(() => {
    // If order transactions updated, we should reconstruct the rows, 
    // but for simplicity, let's assume rows that are SUCCESS are fixed, and we just need one PENDING row.
    if (paidAmount > 0 && paidAmount < totalAmount) {
      setPaymentRows([
        ...successfulTransactions.map((t: any) => ({ ...t, id: t.id })),
        { id: Date.now(), amount: remainingAmount, method: "CARD", status: "PENDING" }
      ]);
    } else if (paidAmount === totalAmount && totalAmount > 0) {
      setPaymentRows(successfulTransactions.map((t: any) => ({ ...t, id: t.id })));
    }
  }, [paidAmount, totalAmount]);

  const [isSuccess, setIsSuccess] = useState(false);
  useEffect(() => {
    if (paidAmount === totalAmount && totalAmount > 0) {
      setIsSuccess(true);
    }
  }, [paidAmount, totalAmount]);

  const updateRow = (id: number, field: string, value: any) => {
    setPaymentRows(rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    const currentTotal = paymentRows.reduce((acc, r) => acc + r.amount, 0);
    if (currentTotal >= totalAmount) {
      alert("이미 결제 총액에 도달했습니다.");
      return;
    }
    const hasVirtualAccount = paymentRows.some(r => r.method === "VIRTUAL_ACCOUNT");
    if (hasVirtualAccount) {
      alert("가상계좌는 마지막 결제 수단으로만 사용할 수 있습니다.");
      return;
    }
    const newAmount = totalAmount - currentTotal;
    setPaymentRows([...paymentRows, { id: Date.now(), amount: newAmount, method: "CARD", status: "PENDING" }]);
  };

  const removeRow = (id: number) => {
    setPaymentRows(rows => rows.filter(r => r.id !== id));
  };

  const currentTotalInput = paymentRows.reduce((acc, r) => acc + r.amount, 0);
  const isTotalMatched = currentTotalInput === totalAmount;

  const handlePayment = async () => {
    if (!isTotalMatched) {
      alert("모든 결제 수단의 합계가 총 결제 금액과 일치해야 합니다.");
      return;
    }

    const pendingRow = paymentRows.find(r => r.status === "PENDING");
    if (!pendingRow) return;

    // Call our backend API to generate KCP approval_key for this specific row
    try {
      const res = await fetch("/api/payment/split-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          amount: pendingRow.amount,
          method: pendingRow.method,
          isMobile,
        })
      });
      const data = await res.json();
      if (!data.success) {
        alert("결제 요청 실패: " + data.error);
        return;
      }

      // Execute KCP Form submission
      const kcpForm = document.getElementById("order_info") as HTMLFormElement;
      if (kcpForm) {
        (document.getElementById("good_mny") as HTMLInputElement).value = pendingRow.amount.toString();
        (document.getElementById("pay_method") as HTMLInputElement).value = pendingRow.method === "CARD" ? "100000000000" : "001000000000"; // Assuming 001000000000 for VA
        (document.getElementById("ordr_idxx") as HTMLInputElement).value = data.transactionId; // Use transaction ID instead of order ID for split payments
        (document.getElementById("quotaopt") as HTMLInputElement).value = "36"; // Force 36 months default

        if (isMobile) {
          (document.getElementById("approval_key") as HTMLInputElement).value = data.approval_key;
          const payUrl = data.PayUrl;
          kcpForm.action = payUrl.substring(0, payUrl.lastIndexOf("/")) + "/jsp/encodingFilter/encodingFilter.jsp";
          kcpForm.submit();
        } else {
          (window as any).m_Completepayment = function (form: any, closeEvent: any) {
            form.action = "/api/payment/split-callback";
            form.submit();
          };
          (window as any).KCP_Pay_Execute_Web(kcpForm);
        }
      }
    } catch (e) {
      console.error(e);
      alert("결제 진행 중 오류가 발생했습니다.");
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
        window.location.reload();
      } else {
        alert("취소 실패: " + data.error);
      }
    } catch (e) {
      alert("취소 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Order Summary (Read Only) */}
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
          {timeLeft <= 600 && (
            <button onClick={handleExtendTimer} className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 text-sm font-bold rounded-lg transition-colors">
              10분 연장하기
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
        <h2 className="text-xl font-bold mb-6">결제 수단 및 금액 설정</h2>
        
        <div className="space-y-4">
          {paymentRows.map((row, index) => (
            <div key={row.id} className={`p-4 sm:p-6 rounded-xl border-2 transition-all ${row.status === 'SUCCESS' ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-white'}`}>
              <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                
                {row.status === "SUCCESS" ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="flex-1 w-full space-y-4">
                      <div className="flex gap-4 w-full">
                        <select 
                          value={row.method} 
                          onChange={(e) => updateRow(row.id, "method", e.target.value)}
                          className="px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-red-500 bg-white"
                        >
                          <option value="CARD">신용카드</option>
                          <option value="VIRTUAL_ACCOUNT">가상계좌</option>
                        </select>
                        
                        <div className="relative flex-1">
                          <input 
                            type="number" 
                            value={row.amount || ''}
                            onChange={(e) => updateRow(row.id, "amount", parseInt(e.target.value) || 0)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl outline-none focus:border-red-500 pr-12 text-right font-bold"
                            placeholder="금액 입력"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">원</span>
                        </div>
                        
                        {index > 0 && paymentRows.length - 1 === index && paidAmount === 0 && (
                          <button onClick={() => removeRow(row.id)} className="p-3 text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button type="button" onClick={() => updateRow(row.id, "amount", row.amount + 1000000)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg">+100만 원</button>
                        <button type="button" onClick={() => updateRow(row.id, "amount", row.amount + 100000)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg">+10만 원</button>
                        <button type="button" onClick={() => updateRow(row.id, "amount", remainingAmount)} className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold rounded-lg">전액</button>
                      </div>
                    </div>
                  </>
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
            disabled={!isTotalMatched || paidAmount === totalAmount}
            className="w-full bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-black text-lg py-5 rounded-xl shadow-lg transition-all"
          >
            {paidAmount === totalAmount ? "결제가 완료되었습니다" : "결제 진행"}
          </button>
          {!isTotalMatched && paidAmount < totalAmount && (
            <p className="text-red-500 text-sm text-center mt-3 font-medium">모든 결제 금액의 합계가 총 결제 금액과 일치해야 합니다.</p>
          )}
        </div>
      </section>

      {/* KCP Hidden Form */}
      <form
        name="order_info"
        id="order_info"
        method="post"
        action={isMobile ? (process.env.NEXT_PUBLIC_KCP_MOBILE_URL || "https://testmweb.kcp.co.kr/v3/pay/hp_pay.jsp") : "https://testpaygw.kcp.co.kr/scripts/pay_hub/rmApproval.jsp"}
        className="hidden"
      >
        <input type="hidden" name="pay_method" id="pay_method" value="" />
        <input type="hidden" name="ordr_idxx" id="ordr_idxx" value="" />
        <input type="hidden" name="good_name" value={order.productName} />
        <input type="hidden" name="good_mny" id="good_mny" value="" />
        <input type="hidden" name="buyr_name" value={order.ordererName} />
        <input type="hidden" name="buyr_mail" value="customer@vdrobotics.co.kr" />
        <input type="hidden" name="buyr_tel1" value={order.ordererPhone} />
        <input type="hidden" name="site_cd" value={process.env.NEXT_PUBLIC_KCP_SITE_CODE || "T0000"} />
        <input type="hidden" name="req_tx" value="pay" />
        <input type="hidden" name="currency" value="410" />
        <input type="hidden" name="shop_name" value="브이디로보틱스" />
        <input type="hidden" name="approval_key" id="approval_key" value="" />
        <input type="hidden" name="PayUrl" id="PayUrl" value="" />
        <input type="hidden" name="good_cd" value="00" />
        <input type="hidden" name="Ret_URL" value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/payment/split-callback`} />
        
        {/* Force 36 months and card restrictions */}
        <input type="hidden" name="quotaopt" id="quotaopt" value="36" />
        {/* 롯데(71), 현대(61), 하나(21), 신한(41) - KCP 코드 기준 예시 */}
        <input type="hidden" name="used_card" value="71:61:21:41" />
      </form>

      {/* 주문 완료 모달 */}
      {isSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
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
