"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/admin");
      } else {
        setError(data.message || "로그인에 실패했습니다.");
      }
    } catch (err) {
      setError("서버 오류가 발생했습니다.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-md p-8 border border-gray-100">
        <div className="text-center mb-8">
          <div className="text-2xl font-bold text-[var(--color-brand-red)] tracking-tighter mb-2">
            vd robotics
          </div>
          <h1 className="text-xl font-bold text-gray-900">관리자 로그인</h1>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">아이디</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-[var(--color-brand-red)] hover:bg-[var(--color-brand-red-hover)] text-white font-bold py-3 rounded-lg transition-colors mt-4"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
}
