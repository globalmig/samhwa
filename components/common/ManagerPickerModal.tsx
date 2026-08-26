"use client";

import { useState } from "react";
import Modal from "./Modal";
import type { SystemUser } from "@/lib/mock";

export const MANAGER_ROLE_LABELS: Record<SystemUser["role"], string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전담기관 담당자",
  VIEWER: "조회 전용",
};

// 과제담당자(정)/(부) 지정 모달 — [권한관리]에 등록된 사용자만 검색·선택할 수 있게 해서
// 공문 발송 시 연락처·이메일 자동 연동(lib/notice-contacts.ts)이 항상 실제 존재하는
// 계정과 일치하도록 강제한다(자유 텍스트 입력 시 오탈자로 매칭이 깨지는 것을 방지).
// 과제상세 화면의 담당자 지정과 엑셀 업로드 시 동명이인 해소 모두 이 컴포넌트를 공유한다.
// [권한관리] 사용자 수가 늘어날수록 리스트가 길어지므로, 한 페이지에 너무 많은 행이 한꺼번에
// 렌더링되지 않도록 8명 단위로 나눠 보여준다.
const PAGE_SIZE = 8;

export default function ManagerPickerModal({ title, users, onSelect, onClose }: {
  title: string;
  users: SystemUser[];
  onSelect: (user: SystemUser) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const q = query.trim().toLowerCase();
  const filtered = users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Modal title={title} onClose={onClose} size="sm">
      <div className="p-5">
        <input
          autoFocus
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="이름 또는 이메일 검색"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
        />
        <div className="border border-slate-100 rounded-lg divide-y divide-slate-100">
          {pageRows.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-slate-400">일치하는 사용자가 없습니다.</div>
          )}
          {pageRows.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => { onSelect(u); onClose(); }}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-blue-50 transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 truncate">{u.name}</div>
                <div className="text-xs text-slate-500 truncate">{u.email}</div>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 shrink-0">
                {MANAGER_ROLE_LABELS[u.role]}
              </span>
            </button>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              이전
            </button>
            <span className="text-xs text-slate-400">{safePage} / {totalPages} 페이지 · {filtered.length}명</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
