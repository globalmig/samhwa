"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

const YEARS = [2022, 2023, 2024, 2025];

const PAGE_TITLES: Record<string, string> = {
  "/": "통합 대시보드",
  "/projects": "과제/연차 관리",
  "/institutions": "수행기관 관리",
  "/companies": "기업 관리",
  "/company-class": "기업분류 관리",
  "/fee-policy": "수수료 정책 엔진",
  "/fees": "연차별 수수료 관리",
  "/unclaimed": "미청구액 관리",
  "/receivables": "미수금/채권 관리",
  "/settlements": "기관 정산 관리",
  "/tax-invoices": "세금계산서 관리",
  "/emails": "이메일 발송 관리",
  "/policy-history": "정책 변경 이력",
  "/admin/users": "권한 관리",
};

export default function Header() {
  const pathname = usePathname();
  const [selectedYear, setSelectedYear] = useState(2024);

  const title = PAGE_TITLES[pathname] ?? "페이지";

  return (
    <header className="flex items-center justify-between px-6 h-14 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* 연도 필터 */}
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-1 py-1">
          {YEARS.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                selectedYear === year
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {year}
            </button>
          ))}
        </div>

        {/* 구분선 */}
        <div className="w-px h-5 bg-slate-200" />

        {/* 알림 */}
        <button className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3z" />
          </svg>
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
        </button>

        {/* 사용자 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-xs text-white font-medium">
            관
          </div>
        </div>
      </div>
    </header>
  );
}
