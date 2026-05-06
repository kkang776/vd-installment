import { PrismaClient } from "@prisma/client";
import { notFound } from "next/navigation";
import CheckoutClient from "./CheckoutClient";

const prisma = new PrismaClient();

export default async function CheckoutPage({ searchParams }: { searchParams: { orderId: string } }) {
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
}
