"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, FileText, Download } from "lucide-react";

type Order = {
  id: string;
  orderNumber: string;
  ordererName: string;
  ordererPhone: string;
  businessName: string | null;
  businessRegNumber: string | null;
  businessRegCertUrl: string | null;
  shippingAddress: string;
  shippingDetail: string | null;
  requestNotes: string | null;

  productName: string;
  quantity: number;
  contractMonths: number;
  monthlyFee: number;
  totalAmount: number;
  status: string;
  
  // PG 결제 정보 (now moved to transactions)
  transactions: {
    id: string;
    amount: number;
    method: string;
    status: string;
    pgTid: string | null;
    pgAppNo: string | null;
    cardCompanyName: string | null;
    pgAppDate: string | null;
    cancelAmount: number;
  }[];
  
  isAbnormalCancel: boolean;
  cancelReason: string | null;

  // 관리자 입력 필드
  installationDate: string | null;
  adminManager: string | null;
  adminNotes: string | null;
  
  createdAt: string;
};

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("전체");
  const [editForm, setEditForm] = useState({
    installationDate: "",
    adminManager: "",
    adminNotes: "",
    status: ""
  });
  const router = useRouter();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/admin/orders");
      const data = await res.json();
      if (data.success) {
        setOrders(data.orders);
      } else if (res.status === 401) {
        router.push("/admin/login");
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (order: Order) => {
    if (expandedOrderId === order.id) {
      setExpandedOrderId(null);
    } else {
      setExpandedOrderId(order.id);
      setEditForm({
        installationDate: order.installationDate || "",
        adminManager: order.adminManager || "",
        adminNotes: order.adminNotes || "",
        status: order.status
      });
    }
  };

  const handleUpdate = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) {
        alert("성공적으로 업데이트되었습니다.");
        fetchOrders();
        setExpandedOrderId(null);
      } else {
        alert("업데이트에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("오류가 발생했습니다.");
    }
  };

  const handleCancelPayment = async (id: string, currentStatus: string) => {
    if (currentStatus === "결제 취소") {
      alert("이미 취소된 결제입니다.");
      return;
    }
    
    const reason = prompt("결제 취소 사유를 입력해 주세요 (고객 변심, 재고 부족 등):");
    if (!reason) return; // 취소 버튼 클릭 후 프롬프트에서 취소 누름
    
    if (!confirm("정말 결제를 취소하시겠습니까? 이 작업은 되돌릴 수 없으며 고객에게 환불 처리됩니다.")) return;
    
    try {
      const res = await fetch(`/api/admin/orders/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      
      if (data.success) {
        alert("결제가 취소되었습니다.");
        fetchOrders();
        if (expandedOrderId === id) {
          setExpandedOrderId(null);
        }
      } else {
        alert(`취소 실패: ${data.message}`);
      }
    } catch (error) {
      console.error(error);
      alert("취소 처리 중 오류가 발생했습니다.");
    }
  };

  const handleBulkUpdate = async (newStatus: string) => {
    if (selectedOrderIds.length === 0) {
      alert("상태를 변경할 주문을 선택해 주세요.");
      return;
    }
    
    if (!confirm(`선택한 ${selectedOrderIds.length}개 주문의 상태를 '${newStatus}'(으)로 변경하시겠습니까?`)) return;
    
    try {
      // In a real app, you would want a dedicated bulk-update API route.
      // For this implementation, we will update them sequentially.
      const promises = selectedOrderIds.map(id => 
        fetch(`/api/admin/orders/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        })
      );
      
      await Promise.all(promises);
      alert("일괄 상태 변경이 완료되었습니다.");
      setSelectedOrderIds([]); // 초기화
      fetchOrders();
    } catch (error) {
      console.error(error);
      alert("일괄 업데이트 중 오류가 발생했습니다.");
    }
  };

  const toggleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    } else {
      setSelectedOrderIds([]);
    }
  };

  const toggleSelectOrder = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedOrderIds(prev => [...prev, id]);
    } else {
      setSelectedOrderIds(prev => prev.filter(orderId => orderId !== id));
    }
  };

  const handleLogout = async () => {
    document.cookie = "admin_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push("/admin/login");
  };

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchLower) ||
      order.ordererName.toLowerCase().includes(searchLower) ||
      order.ordererPhone.includes(searchTerm);
    
    let matchesStatus = false;
    if (filterStatus === "전체") {
      matchesStatus = true;
    } else if (filterStatus === "비정상 취소") {
      matchesStatus = order.isAbnormalCancel === true;
    } else {
      matchesStatus = order.status === filterStatus;
    }
    
    return matchesSearch && matchesStatus;
  });

  const handleDownloadCSV = () => {
    const headers = [
      "주문일시", "주문번호", "주문자명", "연락처", "사업자명", "사업자등록번호", 
      "배송지주소", "배송상세주소", "상품명", "수량", "할부기간", "월할부금", "총결제금액", 
      "요청사항", "상태", "비정상취소여부", "취소사유", "결제내역", "설치일정", "담당자명", "관리자메모"
    ];
    
    const csvContent = [
      headers.join(","),
      ...filteredOrders.map(order => [
        `"${new Date(order.createdAt).toLocaleString()}"`,
        `"${order.orderNumber}"`,
        `"${order.ordererName}"`,
        `"${order.ordererPhone}"`,
        `"${order.businessName || ''}"`,
        `"${order.businessRegNumber || ''}"`,
        `"${order.shippingAddress}"`,
        `"${order.shippingDetail || ''}"`,
        `"${order.productName}"`,
        order.quantity,
        `"${order.contractMonths}개월"`,
        order.monthlyFee,
        order.totalAmount,
        `"${(order.requestNotes || '').replace(/"/g, '""')}"`,
        `"${order.status}"`,
        `"${order.isAbnormalCancel ? 'Y' : 'N'}"`,
        `"${(order.cancelReason || '').replace(/"/g, '""')}"`,
        `"${(order.transactions || []).map(t => `${t.method}(${t.amount}):${t.status}`).join(" / ")}"`,
        `"${order.installationDate || ''}"`,
        `"${order.adminManager || ''}"`,
        `"${(order.adminNotes || '').replace(/"/g, '""')}"`
      ].join(","))
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `orders_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="vd robotics" className="h-6 w-auto object-contain" />
          <span className="text-sm font-normal ml-2 text-gray-500">Admin</span>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-gray-600 hover:text-red-500 transition-colors">
          <LogOut className="w-4 h-4" /> 로그아웃
        </button>
      </header>

      <main className="flex-1 p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold">주문 관리</h2>
              <div className="text-sm text-gray-500">총 {filteredOrders.length}건</div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Bulk Update Controls */}
              {selectedOrderIds.length > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-md border border-blue-100 mr-2">
                  <span className="text-xs font-bold text-blue-700">{selectedOrderIds.length}개 선택됨</span>
                  <select 
                    onChange={(e) => {
                      if(e.target.value) {
                        handleBulkUpdate(e.target.value);
                        e.target.value = ""; // reset after action
                      }
                    }}
                    className="border border-blue-200 text-blue-800 bg-white rounded-md px-2 py-1 text-xs focus:outline-none"
                    defaultValue=""
                  >
                    <option value="" disabled>일괄 상태 변경</option>
                    <option value="결제 대기">결제 대기</option>
                    <option value="결제 완료">결제 완료</option>
                    <option value="일정 확정">일정 확정</option>
                    <option value="설치 완료">설치 완료</option>
                  </select>
                </div>
              )}
              
              <select 
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
              >
                <option value="전체">전체 상태</option>
                <option value="결제 대기">결제 대기</option>
                <option value="PARTIALLY_PAID">부분 결제</option>
                <option value="PAID">결제 완료</option>
                <option value="결제 취소">결제 취소</option>
                <option value="비정상 취소">비정상 취소(이탈/타임아웃)</option>
                <option value="일정 확정">일정 확정</option>
                <option value="설치 완료">설치 완료</option>
              </select>
              <input 
                type="text"
                placeholder="주문번호, 이름, 연락처 검색"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none w-64"
              />
              <button 
                onClick={handleDownloadCSV}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" /> 엑셀 다운로드
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">주문일시</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">주문번호</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">주문자명(연락처)</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">상품명 / 수량</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">결제금액</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">상태</th>
                  <th className="px-6 py-3 font-medium whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                      주문 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((order) => (
                    <React.Fragment key={order.id}>
                      <tr 
                        className={`hover:bg-gray-50 transition-colors cursor-pointer ${expandedOrderId === order.id ? "bg-blue-50/30" : ""} ${selectedOrderIds.includes(order.id) ? "bg-blue-50/10" : ""}`}
                        onClick={() => toggleExpand(order)}
                      >
                        <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={selectedOrderIds.includes(order.id)}
                            onChange={(e) => toggleSelectOrder(e, order.id)}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{new Date(order.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-4 font-medium whitespace-nowrap">{order.orderNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{order.ordererName}<br/><span className="text-gray-500 text-xs">{order.ordererPhone}</span></td>
                        <td className="px-6 py-4 whitespace-nowrap">{order.productName} <span className="text-gray-500">x {order.quantity}</span></td>
                        <td className="px-6 py-4 font-bold text-red-500 whitespace-nowrap">{order.totalAmount.toLocaleString()}원</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                            order.status === "결제 대기" ? "bg-yellow-100 text-yellow-700" :
                            order.status === "결제 완료" ? "bg-green-100 text-green-700" :
                            order.status === "결제 취소" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
                          }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button className="text-blue-500 hover:underline">상세보기</button>
                        </td>
                      </tr>
                      {expandedOrderId === order.id && (
                        <tr>
                          <td colSpan={8} className="bg-gray-50 p-6">
                            <div className="bg-white rounded-lg border border-gray-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                              {/* Left: Customer Info */}
                              <div>
                                <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                  <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                                  주문 상세 정보
                                </h4>
                                <div className="space-y-3 text-sm">
                                  <div className="flex border-b border-gray-50 pb-2">
                                    <span className="w-32 text-gray-500">주문자 정보</span>
                                    <span className="flex-1 font-medium">{order.ordererName} <span className="text-gray-500 font-normal">({order.ordererPhone})</span></span>
                                  </div>
                                  <div className="flex border-b border-gray-50 pb-2">
                                    <span className="w-32 text-gray-500">상품 정보</span>
                                    <span className="flex-1">
                                      {order.productName} (수량: {order.quantity}개)<br/>
                                      <span className="text-gray-500 text-xs">{order.contractMonths}개월 할부 / 월 {order.monthlyFee.toLocaleString()}원</span><br/>
                                      <span className="font-bold text-red-500 mt-1 inline-block">총 결제금액: {order.totalAmount.toLocaleString()}원</span>
                                    </span>
                                  </div>
                                  <div className="flex border-b border-gray-50 pb-2">
                                    <span className="w-32 text-gray-500">배송 주소</span>
                                    <span className="flex-1">{order.shippingAddress} {order.shippingDetail}</span>
                                  </div>
                                  <div className="flex border-b border-gray-50 pb-2">
                                    <span className="w-32 text-gray-500">사업자 정보</span>
                                    <span className="flex-1">
                                      {order.businessName || "-"} ({order.businessRegNumber || "-"})
                                      {order.businessRegCertUrl && (
                                        <a href={order.businessRegCertUrl} download={`사업자등록증_${order.businessName}.pdf`} className="ml-2 text-blue-500 hover:underline inline-flex items-center gap-1">
                                          [사업자등록증 다운로드]
                                        </a>
                                      )}
                                    </span>
                                  </div>
                                  <div className="flex border-b border-gray-50 pb-2">
                                    <span className="w-32 text-gray-500">고객 요청사항</span>
                                    <span className="flex-1">{order.requestNotes || "없음"}</span>
                                  </div>
                                  <div className="mt-6">
                                    <div className="flex justify-between items-center mb-2">
                                      <h5 className="font-bold text-sm text-gray-700">PG 결제 정보</h5>
                                    </div>
                                    
                                    {order.isAbnormalCancel && (
                                      <div className="mb-4 bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm font-bold flex items-center gap-2">
                                        비정상 취소 (사유: {order.cancelReason})
                                      </div>
                                    )}

                                    <div className="space-y-3">
                                      {order.transactions && order.transactions.length > 0 ? (
                                        order.transactions.map((tx: any, index: number) => (
                                          <div key={tx.id} className="bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs relative">
                                            <div className="font-bold mb-2 pb-2 border-b border-gray-200 flex justify-between">
                                              <span>결제 #{index + 1} ({tx.method === 'CARD' ? '신용카드' : '가상계좌'})</span>
                                              <span className={`px-2 py-0.5 rounded text-[10px] ${
                                                tx.status === 'SUCCESS' ? 'bg-green-100 text-green-700' :
                                                tx.status === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                              }`}>
                                                {tx.status}
                                              </span>
                                            </div>
                                            <div className="space-y-1">
                                              <div className="flex justify-between"><span className="text-gray-500">결제금액</span><span className="font-bold">{tx.amount.toLocaleString()}원</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">승인일시</span><span>{tx.pgAppDate ? new Date(tx.pgAppDate).toLocaleString() : '-'}</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">승인번호</span><span>{tx.pgAppNo || '-'}</span></div>
                                              <div className="flex justify-between"><span className="text-gray-500">TID</span><span>{tx.pgTid || '-'}</span></div>
                                              {tx.cancelAmount > 0 && (
                                                <div className="flex justify-between text-red-500"><span className="text-gray-500">취소금액</span><span>{tx.cancelAmount.toLocaleString()}원</span></div>
                                              )}
                                            </div>
                                          </div>
                                        ))
                                      ) : (
                                        <div className="text-center p-4 bg-gray-50 text-gray-400 text-xs rounded-lg">결제 내역이 없습니다.</div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Admin Update */}
                              <div className="bg-gray-50/50 p-6 rounded-xl border border-gray-100 flex flex-col justify-between">
                                <div>
                                  <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    <span className="w-1 h-4 bg-blue-500 rounded-full"></span>
                                    관리자 입력
                                  </h4>
                                <div className="space-y-4">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">상태 변경</label>
                                    <select 
                                      value={editForm.status}
                                      onChange={(e) => setEditForm({...editForm, status: e.target.value})}
                                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                    >
                                      <option value="결제 대기">결제 대기</option>
                                      <option value="결제 완료">결제 완료</option>
                                      <option value="일정 확정">일정 확정</option>
                                      <option value="설치 완료">설치 완료</option>
                                      <option value="결제 취소">결제 취소</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">설치 일정</label>
                                    <input 
                                      type="text"
                                      value={editForm.installationDate}
                                      onChange={(e) => setEditForm({...editForm, installationDate: e.target.value})}
                                      placeholder="예: 2026-05-15 오전"
                                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">담당자명</label>
                                    <input 
                                      type="text"
                                      value={editForm.adminManager}
                                      onChange={(e) => setEditForm({...editForm, adminManager: e.target.value})}
                                      placeholder="담당 엔지니어 이름"
                                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">기타사항 (관리자 메모)</label>
                                    <textarea 
                                      value={editForm.adminNotes}
                                      onChange={(e) => setEditForm({...editForm, adminNotes: e.target.value})}
                                      placeholder="설치 특이사항 등 메모"
                                      rows={3}
                                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleUpdate(order.id); }}
                                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-md transition-colors text-sm"
                                    >
                                      변경 내용 저장
                                    </button>
                                    
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleCancelPayment(order.id, order.status); }}
                                      disabled={order.status === "결제 취소"}
                                      className="flex-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold py-2 rounded-md transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {order.status === "결제 취소" ? "결제 취소됨" : "결제 취소"}
                                    </button>
                                  </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
