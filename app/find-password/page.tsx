"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore, updateUser } from "@/lib/store";
import type { SystemUser } from "@/lib/mock";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";

type Step = "verify" | "reset" | "done";

export default function FindPasswordPage() {
  const { users } = useStore();
  const [step, setStep] = useState<Step>("verify");
  const [matched, setMatched] = useState<SystemUser | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedName = name.trim();
    if (!normalizedEmail || !trimmedName) {
      setError("이메일과 이름을 모두 입력해 주세요.");
      return;
    }

    const user = users.find((u) => u.email.toLowerCase() === normalizedEmail && u.name.trim() === trimmedName);
    if (!user) {
      setError("입력하신 정보와 일치하는 계정을 찾을 수 없습니다.");
      return;
    }
    if (user.status === "PENDING") {
      setError("가입 승인 대기 중인 계정입니다. 시스템 관리자 승인 후 이용해 주세요.");
      return;
    }
    if (user.status === "INACTIVE") {
      setError("비활성화된 계정입니다. 관리자에게 문의하세요.");
      return;
    }

    setError("");
    setMatched(user);
    setStep("reset");
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!matched) return;
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    updateUser(matched.id, { password });
    setError("");
    setStep("done");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-800">Samhwa ERP</h1>
          <p className="text-sm text-slate-500 mt-1">국가지원사업 수수료 통합 관리 시스템</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          {step === "done" ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-50 mb-4">
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-emerald-500">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                </svg>
              </div>
              <h2 className="text-base font-semibold text-slate-800 mb-2">비밀번호가 변경되었습니다</h2>
              <p className="text-sm text-slate-500 leading-relaxed mb-6">새 비밀번호로 로그인해 주세요.</p>
              <Link href="/login" className="inline-block w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                로그인 페이지로
              </Link>
            </div>
          ) : step === "reset" ? (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">새 비밀번호 설정</h2>
              <p className="text-xs text-slate-500 mb-6">{matched?.name}님({matched?.email})의 새 비밀번호를 입력해 주세요.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">새 비밀번호</label>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상 입력하세요" autoComplete="new-password" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">새 비밀번호 확인</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="비밀번호를 다시 입력하세요" autoComplete="new-password" className={inputCls} />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                )}

                <button type="submit" className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors mt-2">
                  비밀번호 변경
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-slate-800 mb-1">비밀번호 찾기</h2>
              <p className="text-xs text-slate-500 mb-6">가입 시 등록한 이메일과 이름으로 본인 확인 후 비밀번호를 재설정합니다.</p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">이메일</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@samhwa.co.kr" autoComplete="email" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">이름</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                    <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {error}
                  </div>
                )}

                <button type="submit" className="w-full py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors mt-2">
                  본인 확인
                </button>
              </form>
            </>
          )}

          {step !== "done" && (
            <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
              <Link href="/login" className="hover:text-blue-600 hover:underline transition-colors">로그인</Link>
              <span className="text-slate-300">|</span>
              <Link href="/find-id" className="hover:text-blue-600 hover:underline transition-colors">아이디 찾기</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
