"use client";

import { useState } from "react";
import Modal from "./Modal";
import { useAuth } from "@/lib/auth";
import { addNotice } from "@/lib/store";
import { nowKST } from "@/lib/utils";

export default function NoticeFormModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function submit() {
    if (!user || !title.trim() || !content.trim()) return;
    addNotice({
      title: title.trim(),
      content: content.trim(),
      authorName: user.name,
      authorRole: user.role,
      createdAt: nowKST(),
    });
    onClose();
  }

  return (
    <Modal title="공지 작성" onClose={onClose} size="md">
      <div className="p-6 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            autoFocus
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용"
            rows={8}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            취소
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || !content.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            등록
          </button>
        </div>
      </div>
    </Modal>
  );
}
