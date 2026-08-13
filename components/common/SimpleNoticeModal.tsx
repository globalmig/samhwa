"use client";

import { useState } from "react";
import Modal from "./Modal";
import { useStore, addEmailDispatch } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

// 세금계산서 공문(첨부파일·서식 있음)과 달리 "메일 본문 하나만" 보내면 되는 간단한 안내 메일 —
// 계산서발행 서류 요청(세금계산서를 발행하기 전에 사업자등록증 등을 요청)과 입금 확인 요청
// (발행 후 미수 상태를 독촉)이 여기 해당한다. 필요해지면 이 union에 새 종류를 더 추가하면 된다.
export type SimpleNoticeKind = "DOC_REQUEST" | "PAYMENT_REMINDER";

export interface SimpleNoticeTarget {
  kind: SimpleNoticeKind;
  projectNumber: string;
  projectName: string;
  agencyName: string;
  leadInstitutionName: string;
  termStart: string; // YYYY-MM-DD
  termEnd: string;
  researchLead: string;
  participantCount: number;
  recipientEmail: string;
  // PAYMENT_REMINDER 전용
  totalAmount?: number;
  invoiceIssuedAt?: string;
}

export const SIMPLE_NOTICE_LABEL: Record<SimpleNoticeKind, string> = {
  DOC_REQUEST: "계산서발행 서류 요청",
  PAYMENT_REMINDER: "입금 확인 요청",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function fmtKoreanDate(s: string | undefined): string {
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return s;
  return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일`;
}

// 양식(공문 양식 관리 > 계산서발행 서류 요청/입금 확인 요청)에 저장된 {토큰}을 실제 과제 정보로
// 치환한다 — 토큰 목록은 lib/mock.ts의 SimpleNoticeTemplate 주석 참고.
export function fillTokens(template: string, t: SimpleNoticeTarget): string {
  const period = `${fmtKoreanDate(t.termStart)} ~ ${fmtKoreanDate(t.termEnd)}`;
  const tokens: Record<string, string> = {
    "{과제번호}": t.projectNumber,
    "{과제명}": t.projectName,
    "{전담기관명}": t.agencyName,
    "{기관명}": t.leadInstitutionName,
    "{당해연구개발기간}": period,
    "{연구책임자}": t.researchLead,
    "{참여기관수}": String(t.participantCount),
    "{수수료금액}": `${(t.totalAmount ?? 0).toLocaleString()}원`,
    "{세금계산서발행일}": fmtKoreanDate(t.invoiceIssuedAt),
  };
  let result = template;
  for (const [token, value] of Object.entries(tokens)) result = result.split(token).join(value);
  return result;
}

export default function SimpleNoticeModal({ target, onClose }: { target: SimpleNoticeTarget; onClose: () => void }) {
  const { users, simpleNoticeTemplates } = useStore();
  const senderUser = users.find((u) => u.id === getCurrentUser()?.id) ?? null;
  const canSendMail = !!senderUser?.hiworksEmail && !!senderUser?.hiworksMailPassword;

  // 공문 양식 관리(/notice-templates/invoices)에 등록된 대표양식을 우선 쓰고, 혹시 못 찾으면(등록
  // 전 등) 최소한 발송은 되도록 과거 하드코딩 문구로 대체한다.
  const activeTemplate = simpleNoticeTemplates.find((t) => t.category === target.kind && t.isDefault)
    ?? simpleNoticeTemplates.find((t) => t.category === target.kind);

  const [toEmail, setToEmail] = useState(target.recipientEmail);
  const [subject, setSubject] = useState(() => fillTokens(activeTemplate?.content.subject ?? `[{과제번호}] {기관명}`, target));
  const [body, setBody] = useState(() => fillTokens(activeTemplate?.content.body ?? "", target));
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(false);

  const emailValid = EMAIL_RE.test(toEmail.trim());
  const canSend = emailValid && !!subject.trim() && !sending && canSendMail;

  async function handleSend() {
    if (!canSend || !senderUser?.hiworksEmail || !senderUser?.hiworksMailPassword) return;
    setSending(true);
    setSendError("");

    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    try {
      const res = await fetch("/api/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: senderUser.hiworksEmail,
          senderPassword: senderUser.hiworksMailPassword,
          senderName: senderUser.name,
          to: [toEmail.trim()],
          subject,
          text: body,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        status = "FAILED";
        setSendError(json.error || "메일 발송에 실패했습니다.");
      }
    } catch {
      status = "FAILED";
      setSendError("메일 발송 중 네트워크 오류가 발생했습니다.");
    }

    addEmailDispatch({
      batchId: `BATCH-${Date.now()}`,
      sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      senderName: senderUser.name,
      recipientInstitution: target.leadInstitutionName,
      recipientEmail: toEmail.trim(),
      subject,
      emailType: target.kind,
      attachments: [],
      status,
      body,
    });

    setSending(false);
    if (status === "SUCCESS") setSent(true);
  }

  return (
    <Modal title={SIMPLE_NOTICE_LABEL[target.kind]} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        {sent ? (
          <div className="text-center py-10 space-y-3">
            <p className="text-sm font-medium text-slate-700">발송이 완료됐습니다.</p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            {!canSendMail && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                발송 계정(하이웍스 이메일·비밀번호)이 등록돼 있지 않습니다 — 관리자 &gt; 사용자 관리에서 먼저 등록해주세요.
              </p>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">받는사람</label>
              <input
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                placeholder="email@example.com"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
              {toEmail.trim() && !emailValid && (
                <p className="text-[11px] text-red-500 mt-1">이메일 형식이 올바르지 않습니다.</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">제목</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">본문</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={18}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
            {sendError && <p className="text-xs text-red-600">{sendError}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSend}
                disabled={!canSend}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {sending ? "발송 중..." : "발송"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
