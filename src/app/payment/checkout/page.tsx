import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: { orderId: string } }) {
  try {
    const { orderId } = await searchParams;

    if (!orderId) {
      return notFound();
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transactions: true,
      }
    });

    if (!order) {
      return notFound();
    }

    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-black mb-8">결제 진행</h1>
          <CheckoutClient initialOrder={order} />
        </div>
      </div>
    );
  } catch (error: any) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-xl max-w-2xl w-full text-center">
          <h2 className="text-red-600 text-2xl font-bold mb-4">페이지를 불러오는 중 오류가 발생했습니다</h2>
          <div className="bg-gray-100 p-4 rounded text-left text-sm text-red-800 break-all overflow-auto font-mono">
            {error?.message || String(error)}
          </div>
          <p className="mt-6 text-gray-500 text-sm">해당 화면을 캡쳐하여 알려주시면 즉시 해결해 드리겠습니다.</p>
        </div>
      </div>
    );
  }
}
