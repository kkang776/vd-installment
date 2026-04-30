import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold mb-8">이용약관</h1>
        <div className="bg-white p-8 rounded-xl border border-gray-200 min-h-[500px] whitespace-pre-wrap">
          {/* 여기에 이용약관 내용을 붙여넣으세요 */}
          {`여기에 준비된 이용약관 전문을 붙여넣어 주세요.`}
        </div>
      </main>
      <Footer />
    </>
  );
}
