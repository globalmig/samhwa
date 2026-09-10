"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useStore, addUser } from "@/lib/store";
import { todayKST } from "@/lib/utils";
import { verifyTurnstileToken } from "@/lib/turnstile";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignupPage() {
  const { users } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName || !normalizedEmail || !password || !confirmPassword) {
      setError("이름, 이메일, 비밀번호를 모두 입력해 주세요.");
      return;
    }
    if (!EMAIL_RE.test(normalizedEmail)) {
      setError("올바른 이메일 형식을 입력해 주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      setError("이미 등록된 이메일입니다.");
      return;
    }
    const turnstileToken = new FormData(e.currentTarget).get("cf-turnstile-response") as string | null;
    if (!turnstileToken) {
      setError("보안 확인 체크박스를 완료해 주세요.");
      return;
    }

    setSubmitting(true);
    setError("");
    const verified = await verifyTurnstileToken(turnstileToken);
    if (!verified) {
      setSubmitting(false);
      setError("보안 확인에 실패했습니다. 다시 시도해 주세요.");
      window.turnstile?.reset();
      return;
    }
    addUser({
      name: trimmedName,
      email: normalizedEmail,
      phone: phone.trim() || undefined,
      password,
      role: "VIEWER",
      status: "PENDING",
      lastLoginAt: null,
      registeredAt: todayKST(),
    });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <Image src="/simbol.png" alt="Samhwa Flow" width={55} height={40} />
          </div>
          <h1 className="text-xl font-bold text-slate-800">Samhwa Flow</h1>
          <p className="text-sm text-slate-500 mt-1">수수료 통합관리</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {done ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-4">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-500">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-800 mb-2">가입 신청이 완료되었습니다</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">
                시스템 관리자 승인 후 로그인하실 수 있습니다.<br />승인 전까지는 로그인이 제한됩니다.
              </p>
              <Link href="/login" className="inline-block w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                로그인 페이지로
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">회원가입</h2>
              <p className="text-xs text-slate-500 mb-6">가입 신청 후 시스템 관리자 승인이 필요합니다.</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">이름</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">이메일</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@samhwa.co.kr" autoComplete="email" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">연락처 <span className="text-slate-400 font-normal">(선택)</span></label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="070-0000-0000" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">비밀번호</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상 입력하세요" autoComplete="new-password" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">비밀번호 확인</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password" className={inputCls} />
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

                <button type="submit" disabled={submitting} className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-2">
                  {submitting ? "처리 중..." : "가입 신청"}
                </button>
              </form>

              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer strategy="afterInteractive" />

              <p className="text-center text-xs text-slate-500 mt-5">
                이미 계정이 있으신가요?{" "}
                <Link href="/login" className="text-blue-600 hover:underline">로그인</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
