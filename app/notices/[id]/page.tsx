"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useStore, deleteNotice, updateNotice } from "@/lib/store";
import { fmtDatetime } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전담기관 담당자",
  VIEWER: "조회 전용",
};

export default function NoticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const { notices } = useStore();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const notice = notices.find((n) => n.id === id);
  // 서버(app/api/notices/[id]/route.ts)와 동일한 규칙 — 시스템 관리자이거나 본인이 작성한
  // 글만 수정·삭제할 수 있다. authorId로 판단해야 동명이인이 있어도 오작동하지 않는다.
  const canManage = !!user && !!notice && (user.role === "ADMIN" || user.id === notice.authorId);

  function startEdit() {
    if (!notice) return;
    setDraftTitle(notice.title);
    setDraftContent(notice.content);
    setEditing(true);
  }

  function saveEdit() {
    if (!notice || !draftTitle.trim() || !draftContent.trim()) return;
    updateNotice(notice.id, { title: draftTitle.trim(), content: draftContent.trim() });
    setEditing(false);
  }

  function handleDelete() {
    if (!notice) return;
    deleteNotice(notice.id);
    router.push("/notices");
  }

  if (!notice) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/notices" className="text-sm text-blue-600 hover:underline">← 공지사항 목록</Link>
        <div className="mt-6 py-16 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
          공지를 찾을 수 없습니다
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link href="/notices" className="text-sm text-blue-600 hover:underline">← 공지사항 목록</Link>

      <div className="mt-4 p-6 bg-white border border-slate-200 rounded-xl">
        <div className="flex items-start justify-between gap-3">
          {editing ? (
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="flex-1 text-lg font-semibold text-slate-800 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            />
          ) : (
            <h1 className="text-lg font-semibold text-slate-800">{notice.title}</h1>
          )}
          {canManage && !editing && (
            confirmingDelete ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-slate-500">삭제할까요?</span>
                <button onClick={handleDelete} className="text-xs font-medium text-red-600 hover:text-red-700">삭제</button>
                <button onClick={() => setConfirmingDelete(false)} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
              </div>
            ) : (
              <div className="flex items-center gap-3 shrink-0">
                <button onClick={startEdit} className="text-xs text-slate-400 hover:text-blue-600">수정</button>
                <button onClick={() => setConfirmingDelete(true)} className="text-xs text-slate-400 hover:text-red-500">삭제</button>
              </div>
            )
          )}
          {editing && (
            <div className="flex items-center gap-3 shrink-0">
              <button onClick={() => setEditing(false)} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
              <button onClick={saveEdit} className="text-xs font-medium text-blue-600 hover:text-blue-700">저장</button>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {notice.authorName} · {ROLE_LABELS[notice.authorRole] ?? notice.authorRole} · {fmtDatetime(notice.createdAt)}
        </p>
        {editing ? (
          <textarea
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            rows={10}
            className="w-full text-sm text-slate-700 mt-4 leading-relaxed border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        ) : (
          <p className="text-sm text-slate-700 mt-4 whitespace-pre-wrap leading-relaxed">{notice.content}</p>
        )}
      </div>
    </div>
  );
}
