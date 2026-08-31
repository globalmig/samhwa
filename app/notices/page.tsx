"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useCanWrite } from "@/lib/permissions";
import { fmtDatetime } from "@/lib/utils";
import NoticeFormModal from "@/components/common/NoticeFormModal";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전담기관 담당자",
  VIEWER: "조회 전용",
};

export default function NoticesPage() {
  const { notices } = useStore();
  const canPost = useCanWrite("notices");
  const [showForm, setShowForm] = useState(false);

  const sorted = [...notices].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-800">공지사항</h1>
        {canPost && (
          <button
            onClick={() => setShowForm(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 공지 작성
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
          등록된 공지가 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => (
            <Link
              key={n.id}
              href={`/notices/${n.id}`}
              className="block p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <p className="text-sm font-semibold text-slate-800">{n.title}</p>
              <p className="text-xs text-slate-400 mt-2">
                {n.authorName} · {ROLE_LABELS[n.authorRole] ?? n.authorRole} · {fmtDatetime(n.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}

      {showForm && canPost && <NoticeFormModal onClose={() => setShowForm(false)} />}
    </div>
  );
}
