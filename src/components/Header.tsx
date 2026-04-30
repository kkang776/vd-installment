import { Phone } from "lucide-react";
import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 sm:h-20 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="vd robotics" className="h-6 sm:h-8 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-2 text-gray-700">
          <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-red-500" />
          <div className="text-right">
            <div className="text-[10px] sm:text-xs text-gray-500 hidden xs:block">고객센터</div>
            <div className="font-bold text-base sm:text-lg leading-tight">1833-3482</div>
          </div>
          <div className="text-[10px] sm:text-xs text-gray-400 ml-2 hidden md:block">
            평일 10:00 ~ 19:00
          </div>
        </div>
      </div>
    </header>
  );
}
