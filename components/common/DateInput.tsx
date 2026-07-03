"use client";

import { useEffect, useRef, useState } from "react";

// yyyymmdd 숫자를 yyyy-mm-dd로 변환. 8자리가 아니면 빈 문자열.
function digitsToISO(digits: string): string {
  if (digits.length !== 8) return "";
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  const date = new Date(`${y}-${m}-${d}T00:00:00`);
  if (isNaN(date.getTime()) || date.getFullYear() !== Number(y)) return "";
  return `${y}-${m}-${d}`;
}

function formatDigits(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

interface Props {
  value: string; // yyyy-mm-dd 또는 ""
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

// 브라우저 기본 <input type="date">는 구분자 없이 8자리 숫자를 연속 입력하면
// 연도 구간이 4자리를 넘게 받아들여 "202602-02-일"처럼 깨지는 경우가 있어
// 직접 자리수를 잘라 포맷하는 텍스트 입력 + 숨겨진 date input(달력 버튼용)으로 대체.
export default function DateInput({ value, onChange, className, placeholder = "년-월-일" }: Props) {
  const [digits, setDigits] = useState(() => value.replace(/-/g, ""));
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDigits(value.replace(/-/g, ""));
  }, [value]);

  function handleChange(raw: string) {
    const nextDigits = raw.replace(/\D/g, "").slice(0, 8);
    setDigits(nextDigits);
    if (nextDigits === "") {
      onChange("");
      return;
    }
    const iso = digitsToISO(nextDigits);
    if (iso) onChange(iso);
  }

  return (
    <div className={`relative flex items-center ${className ?? ""}`}>
      <input
        type="text"
        inputMode="numeric"
        value={formatDigits(digits)}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        maxLength={10}
        className="w-full text-xs border border-slate-200 rounded-lg pl-2.5 pr-7 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => hiddenRef.current?.showPicker?.()}
        className="absolute right-1.5 text-slate-400 hover:text-slate-600"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M5.75 2a.75.75 0 0 1 .75.75V4h7V2.75a.75.75 0 0 1 1.5 0V4h.25A2.75 2.75 0 0 1 18 6.75v8.5A2.75 2.75 0 0 1 15.25 18H4.75A2.75 2.75 0 0 1 2 15.25v-8.5A2.75 2.75 0 0 1 4.75 4H5V2.75A.75.75 0 0 1 5.75 2Zm-1 3.5a1.25 1.25 0 0 0-1.25 1.25V8h13V6.75a1.25 1.25 0 0 0-1.25-1.25H4.75ZM3.5 9.5v5.75A1.25 1.25 0 0 0 4.75 16.5h10.5a1.25 1.25 0 0 0 1.25-1.25V9.5h-13Z" clipRule="evenodd" />
        </svg>
      </button>
      <input
        ref={hiddenRef}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
        tabIndex={-1}
      />
    </div>
  );
}
