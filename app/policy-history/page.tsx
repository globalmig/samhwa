"use client";

import { policyHistory, PolicyHistoryEntry } from "@/lib/mock";
import StatusBadge from "@/components/common/StatusBadge";

const TYPE_MAP: Record<PolicyHistoryEntry["changeType"], { label: string; color: "blue" | "amber" | "purple" }> = {
  CREATED: { label: "신규 생성", color: "blue" },
  UPDATED: { label: "수정", color: "amber" },
  ROLLBACK: { label: "롤백", color: "purple" },
};

export default function PolicyHistoryPage() {
  const lastChange = policyHistory[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">정책 변경 이력 · 전체 {policyHistory.length}건</p>
        <span className="text-xs bg-amber-50 text-amber-600 px-2 py-1 rounded-md font-medium">임시 데이터</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 이력", value: `${policyHistory.length}건` },
          { label: "신규 생성", value: `${policyHistory.filter((p) => p.changeType === "CREATED").length}건` },
          { label: "수정", value: `${policyHistory.filter((p) => p.changeType === "UPDATED").length}건` },
          { label: "최근 변경", value: lastChange?.changedAt.slice(0, 10).replace(/-/g, ".") ?? "-" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">변경 이력 타임라인</h2>
          <p className="text-xs text-slate-400 mt-0.5">모든 정책 변경 이력은 영구 보존되며 롤백 가능합니다</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">버전</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">변경일시</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">변경자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">유형</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">변경 내용</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">변경 사유</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">영향 과제</th>
              </tr>
            </thead>
            <tbody>
              {policyHistory.map((entry, idx) => (
                <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                      {entry.version}
                    </span>
                    {idx === 0 && (
                      <span className="ml-1 text-xs text-blue-600 font-medium">최신</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{entry.changedAt}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-slate-700">{entry.changedBy}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={TYPE_MAP[entry.changeType].label} color={TYPE_MAP[entry.changeType].color} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700 max-w-xs">{entry.changeSummary}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-xs">{entry.reason}</td>
                  <td className="px-4 py-3 text-center text-xs">
                    {entry.affectedProjects > 0
                      ? <span className="text-slate-700 font-medium">{entry.affectedProjects}건</span>
                      : <span className="text-slate-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {policyHistory.length}건
        </div>
      </div>
    </div>
  );
}
