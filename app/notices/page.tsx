"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useStore, addNotice, deleteNotice } from "@/lib/store";
import { useCanWrite } from "@/lib/permissions";
import { fmtDatetime } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전담기관 담당자",
  VIEWER: "조회 전용",
};

const inp = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

export default function NoticesPage() {
  const { user } = useAuth();
  const { notices } = useStore();
  const canPost = useCanWrite("notices");

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sorted = [...notices].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  function canDelete(authorName: string): boolean {
    if (!user) return false;
    return user.role === "ADMIN" || user.name === authorName;
  }

  function submit() {
    if (!user || !title.trim() || !content.trim()) return;
    addNotice({
      title: title.trim(),
      content: content.trim(),
      authorName: user.name,
      authorRole: user.role,
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    });
    setTitle("");
    setContent("");
    setShowForm(false);
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-slate-800">공지사항</h1>
        {canPost && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            + 공지 작성
          </button>
        )}
      </div>

      {showForm && canPost && (
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className={`${inp} w-full`}
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용"
            rows={4}
            className={`${inp} w-full resize-none`}
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowForm(false); setTitle(""); setContent(""); }}
              className="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
            >
              취소
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || !content.trim()}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              등록
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl">
          등록된 공지가 없습니다
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((n) => (
            <div key={n.id} className="p-4 bg-white border border-slate-200 rounded-xl">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-800">{n.title}</p>
                {canDelete(n.authorName) && (
                  deletingId === n.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-slate-500">삭제할까요?</span>
                      <button
                        onClick={() => { deleteNotice(n.id); setDeletingId(null); }}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        삭제
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="text-xs text-slate-400 hover:text-slate-600"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(n.id)}
                      className="text-xs text-slate-400 hover:text-red-500 shrink-0"
                    >
                      삭제
                    </button>
                  )
                )}
              </div>
              <p className="text-sm text-slate-600 mt-1.5 whitespace-pre-wrap">{n.content}</p>
              <p className="text-xs text-slate-400 mt-2">
                {n.authorName} · {ROLE_LABELS[n.authorRole] ?? n.authorRole} · {fmtDatetime(n.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
