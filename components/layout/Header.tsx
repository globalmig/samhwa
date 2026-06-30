"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, logout } from "@/lib/auth";

const PAGE_TITLES: Record<string, string> = {
  "/": "통합 대시보드",
  "/fees": "수수료 관리",
  "/fee-calculation": "수수료 산출내역",
  "/company-class": "유형별 수수료 기준",
  "/emails": "이메일 발송 관리",
  "/policy-history": "정책 변경 이력",
  "/admin/users": "권한 관리",
  "/projects": "과제/연차 관리",
  "/institutions": "기관 관리",
  "/unclaimed": "미청구액 관리",
  "/receivables": "미수금/채권 관리",
  "/settlements": "기관 정산 관리",
  "/tax-invoices": "세금계산서 관리",
  "/audit-log": "전체 변경이력",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "정산 담당자",
  VIEWER: "조회 전용",
};

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  function resolveTitle(path: string): string {
    if (PAGE_TITLES[path]) return PAGE_TITLES[path];
    if (/^\/projects\/.+/.test(path)) return "과제 상세";
    if (/^\/institutions\/.+/.test(path)) return "수행기관 상세";
    if (/^\/companies\/.+/.test(path)) return "기업 상세";
    return "페이지";
  }
  const title = resolveTitle(pathname);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const initials = user?.name ? user.name[0] : "?";

  return (
    <header className="flex items-center justify-between px-6 h-14 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* 알림 */}
        <button className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3z" />
          </svg>
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* 사용자 메뉴 */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-xs text-white font-medium">
              {initials}
            </div>
            {user && (
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-slate-700 leading-tight">{user.name}</p>
                <p className="text-xs text-slate-400 leading-tight">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
            )}
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-slate-400">
              <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                {user && (
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="text-sm font-medium text-slate-800">{user.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{user.email}</p>
                    <p className="text-xs text-blue-600 mt-0.5">{ROLE_LABELS[user.role]}</p>
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M6 10a.75.75 0 0 1 .75-.75h9.546l-1.048-.943a.75.75 0 1 1 1.004-1.114l2.5 2.25a.75.75 0 0 1 0 1.114l-2.5 2.25a.75.75 0 1 1-1.004-1.114l1.048-.943H6.75A.75.75 0 0 1 6 10z" clipRule="evenodd" />
                  </svg>
                  로그아웃
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
