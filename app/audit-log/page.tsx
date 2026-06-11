"use client";

import React, { useState, useMemo } from "react";
import { useStore, AuditEntry, ENTITY_NAMES } from "@/lib/store";
import StatusBadge from "@/components/common/StatusBadge";

const ACTION_MAP: Record<AuditEntry["action"], { label: string; color: "blue" | "amber" | "red" }> = {
  CREATE: { label: "생성", color: "blue" },
  UPDATE: { label: "수정", color: "amber" },
  DELETE: { label: "삭제", color: "red" },
};

export default function AuditLogPage() {
  const { auditLog } = useStore();
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      auditLog.filter(
        (e) =>
          (entityFilter === "ALL" || e.entityType === entityFilter) &&
          (actionFilter === "ALL" || e.action === actionFilter)
      ),
    [auditLog, entityFilter, actionFilter]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">변경이력 · 전체 {auditLog.length}건</p>
        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium">실시간 기록</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 이력", value: `${auditLog.length}건`, color: "text-slate-800" },
          { label: "생성", value: `${auditLog.filter((e) => e.action === "CREATE").length}건`, color: "text-blue-600" },
          { label: "수정", value: `${auditLog.filter((e) => e.action === "UPDATE").length}건`, color: "text-amber-600" },
          { label: "삭제", value: `${auditLog.filter((e) => e.action === "DELETE").length}건`, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-slate-500">필터</span>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white"
        >
          <option value="ALL">전체 유형</option>
          {Object.entries(ENTITY_NAMES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white"
        >
          <option value="ALL">전체 액션</option>
          <option value="CREATE">생성</option>
          <option value="UPDATE">수정</option>
          <option value="DELETE">삭제</option>
        </select>
        <span className="ml-auto text-xs text-slate-400">최신순 정렬</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-slate-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="text-sm text-slate-500 font-medium">변경 이력이 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">데이터를 추가·수정·삭제하면 여기에 기록됩니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">일시</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">액션</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">대상</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수행자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <React.Fragment key={entry.id}>
                  <tr
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
                      {entry.performedAt}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                      {ENTITY_NAMES[entry.entityType] ?? entry.entityType}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={ACTION_MAP[entry.action].label} color={ACTION_MAP[entry.action].color} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{entry.entityLabel}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{entry.entityId}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-700">{entry.performedBy}</td>
                    <td className="px-4 py-3 text-center">
                      {entry.changedFields && Object.keys(entry.changedFields).length > 0 && (
                        <button
                          onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          {expanded === entry.id ? "접기" : `${Object.keys(entry.changedFields).length}개 필드`}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded === entry.id && entry.changedFields && (
                    <tr className="bg-blue-50/50 border-b border-slate-100">
                      <td colSpan={6} className="px-6 py-3">
                        <div className="space-y-1.5">
                          {Object.entries(entry.changedFields).map(([field, change]) => (
                            <div key={field} className="flex items-start gap-3 text-xs">
                              <span className="text-slate-500 font-mono w-32 shrink-0">{field}</span>
                              <span className="text-red-500 line-through">{String(change.before)}</span>
                              <span className="text-slate-400">→</span>
                              <span className="text-blue-700 font-medium">{String(change.after)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
            총 {filtered.length}건 표시 (전체 {auditLog.length}건)
          </div>
        </div>
      )}
    </div>
  );
}
