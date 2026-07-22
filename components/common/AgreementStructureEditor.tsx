"use client";

import { FiPlus, FiTrash2 } from "react-icons/fi";

export interface Stage {
  stageNumber: number;
  startTermNumber: number;
  endTermNumber: number;
}

interface Props {
  agreementType: "BATCH" | "STAGED" | undefined;
  stages: Stage[] | undefined;
  totalTerms: number;
  onChange: (agreementType: "BATCH" | "STAGED", stages: Stage[] | undefined) => void;
}

// ─── 협약 구조 (일괄협약 / 단계협약) 편집기 ──────────────────────
// 정산연차 판정(isSettlementTerm)의 기준이 되는 필드 — 일괄협약은 총연차의 마지막 연차만,
// 단계협약은 각 단계의 마지막 연차마다 정산한다. 전담기관 정책이 아니라 그 과제 개별 협약
// 구조에 달린 문제라 과제 단위로 입력받는다.
export default function AgreementStructureEditor({ agreementType, stages, totalTerms, onChange }: Props) {
  const type = agreementType ?? "BATCH";
  const rows = stages ?? [];

  function setType(next: "BATCH" | "STAGED") {
    if (next === "STAGED" && rows.length === 0) {
      onChange(next, [{ stageNumber: 1, startTermNumber: 1, endTermNumber: totalTerms }]);
    } else {
      onChange(next, next === "STAGED" ? rows : undefined);
    }
  }

  function addStage() {
    const last = rows[rows.length - 1];
    const nextStart = last ? last.endTermNumber + 1 : 1;
    onChange(type, [...rows, { stageNumber: rows.length + 1, startTermNumber: nextStart, endTermNumber: Math.max(nextStart, totalTerms) }]);
  }

  function removeStage(i: number) {
    onChange(type, rows.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stageNumber: idx + 1 })));
  }

  function setField(i: number, field: "startTermNumber" | "endTermNumber", value: number) {
    onChange(type, rows.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-500">
          협약 구조
          <span className="ml-1 text-slate-400 font-normal">· 각 단계의 마지막 연차가 정산연차가 됩니다</span>
        </label>
      </div>
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
        <button type="button" onClick={() => setType("BATCH")}
          className={`flex-1 px-2 py-1.5 transition-colors ${type === "BATCH" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
          일괄협약 <span className="opacity-75">· 마지막 연차만 정산</span>
        </button>
        <button type="button" onClick={() => setType("STAGED")}
          className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${type === "STAGED" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
          단계협약 <span className="opacity-75">· 단계별로 정산</span>
        </button>
      </div>

      {type === "STAGED" && (
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium text-slate-500">단계</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">시작 연차</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">종료 연차 (정산연차)</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-1.5 text-slate-600 font-medium">{s.stageNumber}단계</td>
                  <td className="px-3 py-1.5">
                    <input type="number" min={1} value={s.startTermNumber}
                      onChange={(e) => setField(i, "startTermNumber", Number(e.target.value))}
                      className="w-20 border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="number" min={1} value={s.endTermNumber}
                      onChange={(e) => setField(i, "endTermNumber", Number(e.target.value))}
                      className="w-20 border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button type="button" onClick={() => removeStage(i)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                      <FiTrash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" onClick={addStage}
            className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors border-t border-slate-100">
            <FiPlus size={11} />단계 추가
          </button>
        </div>
      )}
    </div>
  );
}
