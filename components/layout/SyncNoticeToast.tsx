"use client";

import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { subscribeSyncNotice } from "@/lib/store";

interface Notice {
  id: number;
  message: string;
}

const NOTICE_VISIBLE_MS = 10_000;
const MAX_VISIBLE_NOTICES = 3;

// lib/store.ts가 화면 조작과 별개로 뒤늦게 알려야 하는 결과(수수료 저장 실패 등)를 emitSyncNotice로
// 내보내면 화면 오른쪽 아래에 잠깐 띄운다 — 예전엔 콘솔에만 남아 사용자는 저장된 줄 알고 있다가
// 새로고침 뒤에야 수정 전 값이 돌아온 걸 알았다. 모달(z-50)이 열려 있어도 보이도록 그보다 위에 둔다.
export default function SyncNoticeToast() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let seq = 0;
    const activeTimers = timers.current;
    const unsubscribe = subscribeSyncNotice((message) => {
      const id = ++seq;
      setNotices((prev) => [...prev, { id, message }].slice(-MAX_VISIBLE_NOTICES));
      const timer = setTimeout(() => {
        activeTimers.delete(timer);
        setNotices((prev) => prev.filter((n) => n.id !== id));
      }, NOTICE_VISIBLE_MS);
      activeTimers.add(timer);
    });
    return () => {
      unsubscribe();
      activeTimers.forEach(clearTimeout);
      activeTimers.clear();
    };
  }, []);

  if (notices.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" role="alert" aria-live="assertive">
      {notices.map((n) => (
        <div key={n.id} className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-white px-4 py-3 shadow-lg">
          <FiAlertTriangle size={16} className="mt-0.5 shrink-0 text-red-500" />
          <p className="flex-1 break-keep text-sm leading-relaxed text-slate-700">{n.message}</p>
          <button
            type="button"
            onClick={() => setNotices((prev) => prev.filter((x) => x.id !== n.id))}
            className="shrink-0 text-slate-400 hover:text-slate-600"
            title="닫기"
          >
            <FiX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
