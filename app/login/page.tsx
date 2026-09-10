"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { login, useAuth, initAuth, getCurrentUser } from "@/lib/auth";
import { defaultLandingPath } from "@/lib/permissions";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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
      router.replace(defaultLandingPath(user.role as "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER"));
    }
  }, [user, isLoading, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    const turnstileToken = new FormData(e.currentTarget).get("cf-turnstile-response") as string | null;
    if (!turnstileToken) {
      setError("보안 확인 체크박스를 완료해 주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    // Turnstile 토큰 검증은 서버(/api/auth/login)에서 한다 — 토큰은 1회용이라 여기서
    // 먼저 검증해버리면 서버 쪽 검증이 항상 실패한다. 클라이언트에서만 검증하면
    // API를 직접 호출해 캡차를 우회할 수 있는 문제도 있었다.
    const result = await login(email, password, turnstileToken);
    setSubmitting(false);
    if (result.ok) {
      router.replace(defaultLandingPath(getCurrentUser()?.role as "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER" | undefined));
    } else {
      setError(result.error ?? "로그인에 실패했습니다.");
      window.turnstile?.reset();
    }
  }

  if (isLoading) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/simbol.png" alt="Samhwa Flow" width={55} height={40} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Samhwa Flow</h1>
          <p className="text-sm text-slate-500 mt-1">수수료 통합관리</p>
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

            <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} data-action="turnstile-spin-v1" />

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

          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer strategy="afterInteractive" />

          <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
            <Link href="/find-id" className="hover:text-blue-600 hover:underline transition-colors">아이디 찾기</Link>
            <span className="text-slate-300">|</span>
            <Link href="/find-password" className="hover:text-blue-600 hover:underline transition-colors">비밀번호 찾기</Link>
            <span className="text-slate-300">|</span>
            <Link href="/signup" className="hover:text-blue-600 hover:underline transition-colors">회원가입</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
