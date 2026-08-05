"use client";

import { useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  size?: "sm" | "md" | "lg" | "xl";
  // true면 내용 길이와 무관하게 높이를 고정한다(85vh) — 여러 단계/탭을 오가며 내용 길이가
  // 들쭉날쭉한 마법사형 모달에서, 단계를 넘길 때마다 모달 크기가 늘었다 줄었다 하지 않게 한다.
  fixedHeight?: boolean;
  children: React.ReactNode;
}

const sizeClass = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl", xl: "max-w-4xl" };

export default function Modal({ title, onClose, size = "md", fixedHeight = false, children }: Props) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${sizeClass[size]} flex flex-col overflow-hidden ${fixedHeight ? "h-[85vh]" : "max-h-[90vh]"}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        {/* fixedHeight일 때는 본문 자체를 스크롤시키지 않는다 — 안에서 헤더(진행 표시 등)는 고정,
            콘텐츠 영역만 자체적으로 스크롤되게 위임해야, 내용이 길어져도 하단 버튼이 밀려서
            스크롤해야 보이는 일이 없다(퍼센트 높이 계산에 진행 표시 높이가 안 끼어들도록). */}
        <div className={fixedHeight ? "flex-1 min-h-0 flex flex-col overflow-hidden" : "overflow-y-auto flex-1"}>{children}</div>
      </div>
    </div>
  );
}
