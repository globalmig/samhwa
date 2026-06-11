"use client";

import { useState, useMemo } from "react";
import { useStore } from "@/lib/store";
import { type EmailDispatch } from "@/lib/mock";
import StatusBadge from "@/components/common/StatusBadge";

const STATUS_MAP: Record<EmailDispatch["status"], { label: string; color: "green" | "red" | "amber" }> = {
  SUCCESS: { label: "성공", color: "green" },
  FAILED: { label: "실패", color: "red" },
  PENDING: { label: "대기중", color: "amber" },
};

export default function EmailsPage() {
  const { emailDispatches } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [batchFilter, setBatchFilter] = useState("ALL");

  const batches = useMemo(() => [...new Set(emailDispatches.map((e) => e.batchId))], [emailDispatches]);

  const filtered = useMemo(
    () =>
      emailDispatches.filter(
        (e) =>
          (statusFilter === "ALL" || e.status === statusFilter) &&
          (batchFilter === "ALL" || e.batchId === batchFilter) &&
          (search === "" || e.recipientInstitution.includes(search) || e.recipientEmail.includes(search) || e.subject.includes(search))
      ),
    [emailDispatches, search, statusFilter, batchFilter]
  );

  const successCount = emailDispatches.filter((e) => e.status === "SUCCESS").length;
  const failedCount = emailDispatches.filter((e) => e.status === "FAILED").length;
  const pendingCount = emailDispatches.filter((e) => e.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">이메일 발송 이력 · 전체 {emailDispatches.length}건</p>
        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium">시스템 발송 이력</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 발송", value: `${emailDispatches.length}건`, color: "text-slate-800" },
          { label: "성공", value: `${successCount}건`, color: "text-green-600" },
          { label: "실패", value: `${failedCount}건`, color: "text-red-600" },
          { label: "대기중", value: `${pendingCount}건`, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9z" clipRule="evenodd" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="기관명, 이메일, 제목 검색..." className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400" />
        <div className="flex items-center gap-2 shrink-0">
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 배치</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="SUCCESS">성공</option>
            <option value="FAILED">실패</option>
            <option value="PENDING">대기중</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">배치 ID</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발송일시</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수신기관</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">이메일</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">제목</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{e.batchId}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{e.sentAt}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 whitespace-nowrap">{e.recipientInstitution}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{e.recipientEmail}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">{e.subject}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge label={STATUS_MAP[e.status].label} color={STATUS_MAP[e.status].color} /></td>
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
