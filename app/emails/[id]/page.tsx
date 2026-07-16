"use client";

import { use } from "react";
import Link from "next/link";
import { FiArrowLeft, FiFile } from "react-icons/fi";
import { useStore } from "@/lib/store";
import { type EmailDispatch } from "@/lib/mock";
import StatusBadge from "@/components/common/StatusBadge";
import NoticeLetterPreview from "@/components/common/NoticeLetterPreview";

const TYPE_MAP: Record<EmailDispatch["emailType"], { label: string; color: "blue" | "indigo" | "purple" | "slate" }> = {
  TAX_INVOICE: { label: "세금계산서 공문", color: "blue" },
  FEE_DETAIL: { label: "수수료 산출내역 안내", color: "indigo" },
  SETTLEMENT_NOTICE: { label: "정산절차 안내 공문", color: "purple" },
  OTHER: { label: "기타 공문", color: "slate" },
};

const CATEGORY_LABEL: Record<NonNullable<EmailDispatch["feeCategory"]>, string> = {
  ANNUAL: "연차상시점검수수료",
  SETTLEMENT: "위탁정산수수료",
};

const STATUS_MAP: Record<EmailDispatch["status"], { label: string; color: "green" | "red" | "amber" }> = {
  SUCCESS: { label: "발송완료", color: "green" },
  FAILED: { label: "발송실패", color: "red" },
  PENDING: { label: "대기", color: "amber" },
};

export default function EmailDispatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { emailDispatches } = useStore();

  const dispatch = emailDispatches.find((e) => e.id === id);

  if (!dispatch) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">발송 이력을 찾을 수 없습니다</p>
        <Link href="/emails" className="text-xs text-blue-600 hover:underline">← 공문 발송이력으로</Link>
      </div>
    );
  }

  const typeInfo = TYPE_MAP[dispatch.emailType];
  const statusInfo = STATUS_MAP[dispatch.status];

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Breadcrumb */}
      <Link href="/emails" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
        <FiArrowLeft size={12} />
        공문 발송이력
      </Link>

      {/* 헤더 */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge label={typeInfo.label} color={typeInfo.color} />
              <StatusBadge label={statusInfo.label} color={statusInfo.color} />
            </div>
            <h2 className="text-base font-bold text-slate-800">{dispatch.subject}</h2>
            {dispatch.feeCategory && (
              <p className="text-xs text-slate-400 mt-1">
                {CATEGORY_LABEL[dispatch.feeCategory]}{dispatch.isReverseRequest ? " · 역발행 요청" : ""}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 공문/메일 내용 — 발송 시점 그대로 재현 */}
      {dispatch.noticeSnapshot ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">공문 내용</h3>
          </div>
          <div className="p-8">
            <NoticeLetterPreview
              template={dispatch.noticeSnapshot.template}
              statusRows={dispatch.noticeSnapshot.statusRows}
              docNumber={dispatch.noticeSnapshot.docNumber}
              issuedDate={dispatch.noticeSnapshot.issuedDate}
            />
          </div>
        </div>
      ) : dispatch.body ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">메일 본문</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.body}</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-6 text-center text-sm text-slate-400">
          이 발송 건은 본문 내용이 기록되지 않았습니다
        </div>
      )}

      {/* 발송 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 space-y-3">
        <h3 className="text-xs font-semibold text-slate-700">발송 정보</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
          {[
            { label: "발송일시", value: dispatch.sentAt },
            { label: "발송인", value: dispatch.senderName },
            { label: "배치 ID", value: dispatch.batchId },
            { label: "수신기관", value: dispatch.recipientInstitution },
            { label: "수신 이메일", value: dispatch.recipientEmail },
            { label: "발송 ID", value: dispatch.id },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between border-b border-slate-50 pb-2">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-xs text-slate-700 font-mono">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 첨부파일 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">첨부파일</h3>
          <span className="text-xs text-slate-400">{dispatch.attachments.length}개</span>
        </div>
        {dispatch.attachments.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-400">첨부파일이 없습니다</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {dispatch.attachments.map((file) => (
              <div key={file} className="px-5 py-3 flex items-center gap-2 text-sm text-slate-700">
                <FiFile size={14} className="text-slate-400 shrink-0" />
                <span className="truncate">{file}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
