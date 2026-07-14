"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { type EmailDispatch } from "@/lib/mock";
import StatusBadge from "@/components/common/StatusBadge";

const TYPE_MAP: Record<EmailDispatch["emailType"], { label: string; color: "blue" | "indigo" | "purple" }> = {
  TAX_INVOICE: { label: "세금계산서 공문", color: "blue" },
  FEE_DETAIL: { label: "수수료 산출내역 안내", color: "indigo" },
  SETTLEMENT_NOTICE: { label: "정산절차 안내 공문", color: "purple" },
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

export default function EmailDispatchesPage() {
  const router = useRouter();
  const { emailDispatches } = useStore();
  const [filterRecipient, setFilterRecipient] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(
    () =>
      [...emailDispatches]
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        .filter(
          (e) =>
            (typeFilter === "ALL" || e.emailType === typeFilter) &&
            (statusFilter === "ALL" || e.status === statusFilter) &&
            (filterRecipient === "" ||
              e.recipientInstitution.includes(filterRecipient) ||
              e.recipientEmail.includes(filterRecipient)) &&
            (filterSubject === "" || e.subject.includes(filterSubject))
        ),
    [emailDispatches, filterRecipient, filterSubject, typeFilter, statusFilter]
  );

  const successCount = emailDispatches.filter((e) => e.status === "SUCCESS").length;
  const failedCount = emailDispatches.filter((e) => e.status === "FAILED").length;
  const pendingCount = emailDispatches.filter((e) => e.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">공문 발송이력 · 전체 {emailDispatches.length}건</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 발송", value: `${emailDispatches.length}건`, color: "text-slate-800" },
          { label: "발송완료", value: `${successCount}건`, color: "text-emerald-600" },
          { label: "발송실패", value: `${failedCount}건`, color: "text-red-600" },
          { label: "대기", value: `${pendingCount}건`, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 grid grid-cols-2 gap-3">
          {[
            { label: "수신기관 / 이메일", value: filterRecipient, onChange: setFilterRecipient },
            { label: "제목", value: filterSubject, onChange: setFilterSubject },
          ].map(({ label, value, onChange }) => (
            <div key={label}>
              <p className="text-[10px] font-medium text-slate-400 mb-1">{label}</p>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`${label} 검색...`}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
          ))}
        </div>
        <div className="px-4 py-2.5 flex justify-end gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 유형</option>
            <option value="TAX_INVOICE">세금계산서 공문</option>
            <option value="FEE_DETAIL">수수료 산출내역 안내</option>
            <option value="SETTLEMENT_NOTICE">정산절차 안내 공문</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="SUCCESS">발송완료</option>
            <option value="FAILED">발송실패</option>
            <option value="PENDING">대기</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-36">발송일시</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수신기관</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">제목</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">첨부</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/emails/${e.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">{e.sentAt}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm font-medium text-slate-800">{e.recipientInstitution}</p>
                      <p className="text-xs text-slate-400">{e.recipientEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{e.subject}</p>
                      {e.feeCategory && (
                        <p className="text-xs text-slate-400 mt-0.5">{CATEGORY_LABEL[e.feeCategory]}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={TYPE_MAP[e.emailType].label} color={TYPE_MAP[e.emailType].color} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{e.attachments.length}개</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={STATUS_MAP[e.status].label} color={STATUS_MAP[e.status].color} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {emailDispatches.length}건)</div>
      </div>
    </div>
  );
}
