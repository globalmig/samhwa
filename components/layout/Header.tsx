"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, logout } from "@/lib/auth";
import { useStore, addNotice, deleteNotice, markNotificationRead, markAllNotificationsRead, dismissNotification } from "@/lib/store";
import { computeOverdueAlerts, computeIssueAlerts, isAlertVisibleToUser, isIssueVisibleToUser } from "@/lib/notifications";
import { useCanWrite } from "@/lib/permissions";
import { fmtDatetime } from "@/lib/utils";

const PAGE_TITLES: Record<string, string> = {
  "/": "통합 대시보드",
  "/fees": "수수료 관리",
  "/fee-calculation": "수수료 산출내역",
  "/company-class": "유형별 수수료 기준",
  "/emails": "공문 발송이력",
  "/policy-history": "정책 변경 이력",
  "/admin/users": "권한 관리",
  "/projects": "과제/연차 관리",
  "/institutions": "수행기관 관리",
  "/unclaimed": "세금계산서 미발행 관리",
  "/receivables": "미수금/채권 관리",
  "/settlements": "기관 정산 관리",
  "/tax-invoices": "세금계산서 관리",
  "/audit-log": "전체 변경이력",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전문기관담당자",
  VIEWER: "조회 전용",
};

// 알림 항목 공통 액션(읽음 처리 / 삭제) 버튼
function NotifActions({ read, onRead, onDismiss }: { read: boolean; onRead: () => void; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
      {!read && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(); }}
          title="읽음 처리"
          className="p-1 text-slate-300 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143z" clipRule="evenodd" />
          </svg>
        </button>
      )}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
        title="삭제"
        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { receivables, projects, notices, projectIssues, notificationState } = useStore();
  const canPostNotice = useCanWrite("notices");
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");

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

  // VIEWER는 알림을 전혀 받지 않음
  const myNotifState = user ? (notificationState[user.id] ?? { readIds: [], dismissedIds: [] }) : { readIds: [], dismissedIds: [] };
  const isRead = (id: string) => myNotifState.readIds.includes(id);
  const isDismissed = (id: string) => myNotifState.dismissedIds.includes(id);

  const overdueAlerts = user
    ? computeOverdueAlerts(receivables, projects).filter((a) => isAlertVisibleToUser(a.assignedManager, user) && !isDismissed(a.id))
    : [];
  const issueAlerts = user
    ? computeIssueAlerts(projectIssues, projects).filter((i) => isIssueVisibleToUser(i, i.assignedManager, user) && !isDismissed(i.id))
    : [];
  const visibleNotices = notices.filter((n) => !isDismissed(n.id));
  const notifCount = [...overdueAlerts.map((a) => a.id), ...issueAlerts.map((i) => i.id), ...visibleNotices.map((n) => n.id)]
    .filter((id) => !isRead(id)).length;

  function markAllRead() {
    if (!user) return;
    const ids = [...overdueAlerts.map((a) => a.id), ...issueAlerts.map((i) => i.id), ...visibleNotices.map((n) => n.id)];
    markAllNotificationsRead(user.id, ids);
  }

  function handleDeleteNotice(noticeId: string, authorName: string) {
    if (!user) return;
    if (user.role === "ADMIN" || user.name === authorName) deleteNotice(noticeId);
    else dismissNotification(user.id, noticeId);
  }

  function submitNotice() {
    if (!user || !noticeTitle.trim() || !noticeContent.trim()) return;
    addNotice({
      title: noticeTitle.trim(),
      content: noticeContent.trim(),
      authorName: user.name,
      authorRole: user.role,
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    });
    setNoticeTitle("");
    setNoticeContent("");
    setShowNoticeForm(false);
  }

  return (
    <header className="flex items-center justify-between px-6 h-14 bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2">
        <h1 className="text-sm font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* 알림 — 조회 전용 계정은 알림을 받지 않으므로 아이콘 자체를 표시하지 않음 */}
        {user?.role !== "VIEWER" && (
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zm0 16a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3z" />
            </svg>
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => { setNotifOpen(false); setShowNoticeForm(false); }} />
              <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 max-h-[70vh] overflow-y-auto">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 shrink-0">알림</h3>
                  <div className="flex items-center gap-3">
                    {notifCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-slate-500 hover:text-slate-700">
                        모두 읽음
                      </button>
                    )}
                    {canPostNotice && (
                      <button
                        onClick={() => setShowNoticeForm((v) => !v)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        + 공지 작성
                      </button>
                    )}
                  </div>
                </div>

                {showNoticeForm && canPostNotice && (
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 space-y-2">
                    <input
                      value={noticeTitle}
                      onChange={(e) => setNoticeTitle(e.target.value)}
                      placeholder="제목"
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                    <textarea
                      value={noticeContent}
                      onChange={(e) => setNoticeContent(e.target.value)}
                      placeholder="내용"
                      rows={3}
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 resize-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setShowNoticeForm(false); setNoticeTitle(""); setNoticeContent(""); }}
                        className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        취소
                      </button>
                      <button
                        onClick={submitNotice}
                        disabled={!noticeTitle.trim() || !noticeContent.trim()}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        등록
                      </button>
                    </div>
                  </div>
                )}

                {overdueAlerts.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 tracking-wide">
                      연체 알림 · {overdueAlerts.length}건
                    </p>
                    {overdueAlerts.map((a) => (
                      <div key={a.id} className={`flex items-start gap-1.5 px-4 py-2.5 border-b border-slate-50 transition-colors ${isRead(a.id) ? "opacity-50" : "hover:bg-slate-50"}`}>
                        <Link
                          href="/receivables"
                          onClick={() => { if (user) markNotificationRead(user.id, a.id); setNotifOpen(false); }}
                          className="flex-1 min-w-0"
                        >
                          <p className="text-xs font-medium text-red-600 flex items-center gap-1.5">
                            {!isRead(a.id) && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />}
                            {a.leadInstitutionName} · {a.projectName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{a.detail}</p>
                        </Link>
                        <NotifActions read={isRead(a.id)} onRead={() => user && markNotificationRead(user.id, a.id)} onDismiss={() => user && dismissNotification(user.id, a.id)} />
                      </div>
                    ))}
                  </div>
                )}

                {issueAlerts.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 tracking-wide">
                      이슈/메모 알림 · {issueAlerts.length}건
                    </p>
                    {issueAlerts.map((i) => (
                      <div key={i.id} className={`flex items-start gap-1.5 px-4 py-2.5 border-b border-slate-50 transition-colors ${isRead(i.id) ? "opacity-50" : "hover:bg-slate-50"}`}>
                        <Link
                          href={`/projects/${i.projectId}`}
                          onClick={() => { if (user) markNotificationRead(user.id, i.id); setNotifOpen(false); }}
                          className="flex-1 min-w-0"
                        >
                          <p className="text-xs font-medium text-amber-600 flex items-center gap-1.5">
                            {!isRead(i.id) && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                            {i.projectName}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{i.content}</p>
                        </Link>
                        <NotifActions read={isRead(i.id)} onRead={() => user && markNotificationRead(user.id, i.id)} onDismiss={() => user && dismissNotification(user.id, i.id)} />
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 tracking-wide">공지사항</p>
                  {visibleNotices.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-slate-400">등록된 공지가 없습니다</p>
                  ) : (
                    visibleNotices.map((n) => (
                      <div key={n.id} className={`flex items-start gap-1.5 px-4 py-2.5 border-b border-slate-50 last:border-0 ${isRead(n.id) ? "opacity-50" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                            {!isRead(n.id) && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                            {n.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 whitespace-pre-wrap">{n.content}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {n.authorName} · {ROLE_LABELS[n.authorRole] ?? n.authorRole} · {fmtDatetime(n.createdAt)}
                          </p>
                        </div>
                        <NotifActions read={isRead(n.id)} onRead={() => user && markNotificationRead(user.id, n.id)} onDismiss={() => handleDeleteNotice(n.id, n.authorName)} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        )}

        {/* 사용자 메뉴 */}
        <div className="relative flex items-center">
          {user && (
            <Link
              href={`/admin/users/${user.id}`}
              className="flex items-center gap-2 hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-xs text-white font-medium">
                {initials}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-slate-700 leading-tight">{user.name}</p>
                <p className="text-xs text-slate-400 leading-tight">{ROLE_LABELS[user.role] ?? user.role}</p>
              </div>
            </Link>
          )}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 hover:bg-slate-50 rounded-lg transition-colors"
          >
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
