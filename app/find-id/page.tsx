"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { SystemUser } from "@/lib/mock";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition-colors";

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}

export default function FindIdPage() {
  const { users } = useStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SystemUser[] | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const normalizedPhone = normalizePhone(phone);

    if (!trimmedName || !normalizedPhone) {
      setError("이름과 연락처를 모두 입력해 주세요.");
      setResult(null);
      return;
    }

    const matched = users.filter(
      (u) => u.status === "ACTIVE" && u.name.trim() === trimmedName && u.phone && normalizePhone(u.phone) === normalizedPhone
    );

    if (matched.length === 0) {
      setError("입력하신 정보와 일치하는 계정을 찾을 수 없습니다.");
      setResult(null);
      return;
    }

    setError("");
    setResult(matched);
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
          <h2 className="text-base font-semibold text-slate-800 mb-1">아이디 찾기</h2>
          <p className="text-xs text-slate-500 mb-6">가입 시 등록한 이름과 연락처로 이메일(아이디)을 확인합니다.</p>

          {result ? (
            <div>
              <div className="space-y-2 mb-6">
                {result.map((u) => (
                  <div key={u.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <span className="text-sm font-medium text-emerald-700">{maskEmail(u.email)}</span>
                  </div>
                ))}
              </div>
              <Link href="/login" className="inline-block w-full text-center py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                로그인 페이지로
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">이름</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">연락처</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="070-0000-0000" className={inputCls} />
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
                아이디 찾기
              </button>
            </form>
          )}

          <div className="flex items-center justify-center gap-3 mt-5 text-xs text-slate-500">
            <Link href="/login" className="hover:text-blue-600 hover:underline transition-colors">로그인</Link>
            <span className="text-slate-300">|</span>
            <Link href="/find-password" className="hover:text-blue-600 hover:underline transition-colors">비밀번호 찾기</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
