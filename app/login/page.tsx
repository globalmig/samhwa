"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { login, useAuth, initAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    initAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      router.replace("/");
    }
  }, [user, isLoading, router]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    const result = login(email, password);
    setSubmitting(false);
    if (result.ok) {
      router.replace("/");
    } else {
      setError(result.error ?? "로그인에 실패했습니다.");
    }
  }

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Samhwa ERP</h1>
          <p className="text-sm text-slate-500 mt-1">국가지원사업 수수료 통합 관리 시스템</p>
        </div>

        {/* 로그인 카드 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h2 className="text-base font-semibold text-slate-800 mb-6">로그인</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">이메일</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@samhwa.co.kr"
                autoComplete="email"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">비밀번호</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호를 입력하세요"
                autoComplete="current-password"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2"
            >
              {submitting ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>

        {/* 데모 계정 안내 */}
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-600 mb-3">데모 계정</p>
          <div className="space-y-2">
            {[
              { label: "시스템 관리자", email: "admin@samhwa.co.kr", pw: "admin1234" },
              { label: "회계 담당자", email: "lee.acc@samhwa.co.kr", pw: "samhwa1234" },
              { label: "정산 담당자", email: "park.set@samhwa.co.kr", pw: "samhwa1234" },
              { label: "조회 전용", email: "choi.view@samhwa.co.kr", pw: "samhwa1234" },
            ].map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => { setEmail(acc.email); setPassword(acc.pw); setError(""); }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors border border-slate-100 group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">{acc.label}</span>
                  <span className="text-xs text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity">선택</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{acc.email}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
