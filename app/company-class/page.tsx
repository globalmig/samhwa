"use client";

import { useState, useMemo } from "react";
import { FiChevronDown, FiChevronRight, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  useStore,
  addFeePolicy,
  updateFeePolicy,
  addFundingAgency,
  updateFundingAgency,
  deleteFundingAgency,
} from "@/lib/store";
import { type PolicyRule, type FeePolicy, type FundingAgency, type FeeRateBracket, KEIT_BRACKETS, KETEP_BRACKETS, KOFPI_BRACKETS } from "@/lib/mock";
import Modal from "@/components/common/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import { useCanWrite } from "@/lib/permissions";
import { fmtDate, fmtWonFull } from "@/lib/utils";

// ─── 공통 스타일 ────────────────────────────────────────────────
const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

// ─── 등급 상수 ──────────────────────────────────────────────────
const GRADE_OPTIONS = ["일반", "S", "A~C", "자율성트랙"];
const GRADE_NAME_MAP: Record<string, string> = {
  일반: "일반", S: "최우수", "A~C": "우수", 자율성트랙: "자율성트랙",
};
const GRADE_BADGE: Record<string, string> = {
  일반: "bg-slate-100 text-slate-600",
  S: "bg-yellow-100 text-yellow-700",
  "A~C": "bg-blue-100 text-blue-700",
  자율성트랙: "bg-purple-100 text-purple-700",
};

const POLICY_STATUS_MAP: Record<FeePolicy["status"], { label: string; color: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "적용중", color: "green" },
  EXPIRED: { label: "만료", color: "slate" },
  DRAFT: { label: "초안", color: "amber" },
};

// ─── 기준표 (읽기 전용) ─────────────────────────────────────────
function RuleTable({ rules, standardRate }: { rules: PolicyRule[]; standardRate: number }) {
  if (rules.length === 0) {
    return <p className="text-xs text-slate-400 py-4 text-center">공통 기준표가 적용됩니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">대상</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">구분</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">구분2</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">정산구분</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">연차상시</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">정산</th>
            <th className="text-center px-3 py-2 text-xs font-medium text-slate-500">실제 수수료율</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => {
            const effectiveAnnual = parseFloat((standardRate * r.annualRate / 100).toFixed(2));
            const effectiveSettlement = parseFloat((standardRate * r.settlementRate / 100).toFixed(2));
            return (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.subject === "기관" ? "bg-teal-50 text-teal-700" : "bg-violet-50 text-violet-700"}`}>
                    {r.subject}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${GRADE_BADGE[r.grade] ?? "bg-slate-100 text-slate-600"}`}>{r.grade}</span>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-600">{r.gradeName}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${r.settlementType === "자체정산" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {r.settlementType}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{r.annualRate}%</td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{r.settlementRate}%</td>
                <td className="px-3 py-2.5 text-center">
                  <span className="text-xs font-semibold text-blue-700">
                    연{effectiveAnnual}% / 정{effectiveSettlement}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── 기준 행 편집기 (PolicyForm 내부) ───────────────────────────
const EMPTY_RULE: PolicyRule = { subject: "기관", grade: "일반", gradeName: "일반", settlementType: "위탁정산", annualRate: 85, settlementRate: 100 };

function RuleEditor({ rules, onChange }: { rules: PolicyRule[]; onChange: (rules: PolicyRule[]) => void }) {
  function add() { onChange([...rules, { ...EMPTY_RULE }]); }
  function remove(i: number) { onChange(rules.filter((_, idx) => idx !== i)); }
  function set(i: number, k: keyof PolicyRule, v: string | number) {
    onChange(rules.map((r, idx) => idx === i ? { ...r, [k]: v } : r));
  }
  function handleGrade(i: number, grade: string) {
    onChange(rules.map((r, idx) => idx === i ? { ...r, grade, gradeName: GRADE_NAME_MAP[grade] ?? grade } : r));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-700">등급별 산출 비율 기준표</label>
        <button type="button" onClick={add} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
          <FiPlus size={11} />행 추가
        </button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-2 py-2 font-medium text-slate-500">대상</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">구분</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">구분2</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">정산구분</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">연차(%)</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">정산(%)</th>
              <th className="w-6 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-400">공통 기준이 적용됩니다. 행 추가로 자체 기준을 설정할 수 있습니다.</td></tr>
            )}
            {rules.map((r, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5">
                  <select className="text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.subject} onChange={(e) => set(i, "subject", e.target.value as PolicyRule["subject"])}>
                    <option value="기관">기관</option>
                    <option value="과제">과제</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <select className="text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.grade} onChange={(e) => handleGrade(i, e.target.value)}>
                    {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input className="w-20 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.gradeName} onChange={(e) => set(i, "gradeName", e.target.value)} />
                </td>
                <td className="px-2 py-1.5">
                  <select className="text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.settlementType} onChange={(e) => set(i, "settlementType", e.target.value as PolicyRule["settlementType"])}>
                    <option value="위탁정산">위탁정산</option>
                    <option value="자체정산">자체정산</option>
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} max={100} step={1}
                    className="w-16 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.annualRate} onChange={(e) => set(i, "annualRate", Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} max={100} step={1}
                    className="w-16 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.settlementRate} onChange={(e) => set(i, "settlementRate", Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button type="button" onClick={() => remove(i)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                    <FiTrash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-1.5">비율(%)은 표준수수료율에 곱하는 배율입니다. 빈 기준표는 공통 기준으로 대체됩니다.</p>
    </div>
  );
}

// ─── 정책 폼 ────────────────────────────────────────────────────
type PolicyFormData = Omit<FeePolicy, "id">;

function makePolicyEmpty(agencyId: string | null, templatePolicy: FeePolicy | null): PolicyFormData {
  return {
    agencyId,
    name: "",
    version: "",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: null,
    status: "DRAFT",
    standardRate: 3.0,
    rules: templatePolicy?.rules ?? [],
    description: "",
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: "김관리",
    feeRateBrackets: templatePolicy?.feeRateBrackets ?? KEIT_BRACKETS,
    coInstAddonMethod: templatePolicy?.coInstAddonMethod ?? "TIERED",
    exemptGrades: templatePolicy?.exemptGrades ?? ["S", "A~C"],
    hasAutonomyTrack: templatePolicy?.hasAutonomyTrack ?? true,
    annualBillingRate: templatePolicy?.annualBillingRate ?? 0.85,
  };
}

// ─── 요율표 편집기 ───────────────────────────────────────────────
function BracketEditor({ brackets, onChange }: { brackets: FeeRateBracket[]; onChange: (b: FeeRateBracket[]) => void }) {
  function add() {
    const last = brackets[brackets.length - 1];
    onChange([...brackets, { minAmount: last ? (last.maxAmount ?? 0) : 0, maxAmount: null, baseFee: 0 }]);
  }
  function remove(i: number) { onChange(brackets.filter((_, idx) => idx !== i)); }
  function set(i: number, k: keyof FeeRateBracket, v: number | null) {
    onChange(brackets.map((b, idx) => idx === i ? { ...b, [k]: v } : b));
  }
  const fmtAmt = (n: number) => n >= 100_000_000 ? `${n / 100_000_000}억` : n >= 10_000 ? `${n / 10_000}만` : String(n);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-700">현금사업비 구간별 기본수수료 (정액)</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onChange(KEIT_BRACKETS)} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KEIT 기준</button>
          <button type="button" onClick={() => onChange(KETEP_BRACKETS)} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KETEP 기준</button>
          <button type="button" onClick={() => onChange(KOFPI_BRACKETS)} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KOFPI 기준</button>
          <button type="button" onClick={add} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
            <FiPlus size={11} />행 추가
          </button>
        </div>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-2 py-2 font-medium text-slate-500">이상 (원)</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">미만 (원, 비워두면 상한없음)</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">기본수수료 (원)</th>
              <th className="text-left px-2 py-2 font-medium text-slate-500">구간 표시</th>
              <th className="w-6 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {brackets.map((b, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5">
                  <input type="number" min={0} step={10_000_000} className="w-32 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={b.minAmount} onFocus={(e) => e.target.select()} onChange={(e) => set(i, "minAmount", Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} step={10_000_000} placeholder="(상한없음)" className="w-36 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={b.maxAmount ?? ""} onFocus={(e) => e.target.select()} onChange={(e) => set(i, "maxAmount", e.target.value === "" ? null : Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" min={0} step={1_000} className="w-28 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={b.baseFee} onFocus={(e) => e.target.select()} onChange={(e) => set(i, "baseFee", Number(e.target.value))} />
                </td>
                <td className="px-2 py-1.5 text-slate-400">
                  {fmtAmt(b.minAmount)} ~ {b.maxAmount ? fmtAmt(b.maxAmount) : "∞"}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button type="button" onClick={() => remove(i)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                    <FiTrash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            {brackets.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-slate-400">구간이 없습니다. 행 추가 또는 기준 버튼을 사용하세요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 기관 특이사항 메모 ───────────────────────────────────────
const AGENCY_SPECIAL_NOTES: Record<string, string[]> = {
  KOFPI: [
    "위탁기관 있음 — 수수료 산정 시 공동기관과 동일하게 취급",
    "S·A~C 등급 관계없이 모든 기관을 일반기관으로 취급 (면제 없음)",
    "연차상시·정산 구분 없이 항상 100% 청구 → 미청구액 개념 없음",
  ],
  KEIT: [
    "단계협약(단계별 협약) 과제 지원 — 단계 내 연차상시 + 마지막 연차 정산",
    "자율성트랙 과제: 전 기간 산정수수료의 85% 균일 청구",
  ],
  KETEP: [
    "가산금 일률 방식: 공동기관 수 × 기본수수료 10% (KEIT 누진 방식과 다름)",
    "S등급만 면제 (A~C는 면제 아님)",
    "자율성트랙 없음",
    "2026년 이전 미청구액은 수기 이월 입력 필요",
  ],
};


// ─── 전담기관 수수료 산정 특성 요약 ─────────────────────────
function AgencyFeeModelSummary({ agency, policy }: { agency: { shortName: string; name: string } | undefined; policy: FeePolicy }) {
  const [showBrackets, setShowBrackets] = useState(false);
  const notes = agency ? (AGENCY_SPECIAL_NOTES[agency.shortName] ?? []) : [];

  const addonLabel = policy.coInstAddonMethod === "TIERED"
    ? "누진형 — 1번째 10% + 이후 추가 5%씩"
    : "일률형 — 공동기관 수 × 10%";

  const exemptLabel = policy.exemptGrades.length === 0
    ? "없음 (모든 기관 일반 취급)"
    : policy.exemptGrades.join("·") + " 등급 (자체정산 선택 시)";

  const billingLabel = policy.annualBillingRate >= 1
    ? "100% — 연차상시·정산 모두 동일 (미청구 개념 없음)"
    : `${Math.round(policy.annualBillingRate * 100)}% 연차상시 / 100% 정산`;

  const fmtAmt = (n: number) => n >= 1_000_000_000 ? `${n / 100_000_000}억` : n >= 100_000_000 ? `${n / 100_000_000}억` : n >= 10_000_000 ? `${n / 10_000_000}천만` : n >= 1_000_000 ? `${n / 1_000_000}백만` : n >= 10_000 ? `${n / 10_000}만` : String(n);
  const fmtFee = fmtWonFull;

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500 tracking-wide">수수료 산정 특성</span>
        {agency && <span className="text-xs text-slate-400">— {agency.name} ({agency.shortName})</span>}
      </div>
      <div className="px-5 py-4 space-y-3">
        {/* 핵심 파라미터 그리드 */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-24 text-slate-400 font-medium">면제기관</span>
            <span className={`text-slate-700 ${policy.exemptGrades.length === 0 ? "text-slate-500 italic" : ""}`}>{exemptLabel}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-24 text-slate-400 font-medium">가산금 방식</span>
            <span className="text-slate-700">{addonLabel}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-24 text-slate-400 font-medium">자율성트랙</span>
            <span className={policy.hasAutonomyTrack ? "text-purple-700 font-medium" : "text-slate-500 italic"}>
              {policy.hasAutonomyTrack ? "있음 — 해당 과제 전 연도 85% 청구" : "없음"}
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="shrink-0 w-24 text-slate-400 font-medium">연차상시 청구</span>
            <span className={policy.annualBillingRate >= 1 ? "text-emerald-700 font-medium" : "text-sky-700 font-medium"}>{billingLabel}</span>
          </div>
        </div>

        {/* 특이사항 노트 */}
        {notes.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 space-y-1">
            {notes.map((note, i) => (
              <p key={i} className="text-xs text-amber-800 flex items-start gap-1.5">
                <span className="shrink-0 mt-0.5 text-amber-400">◆</span>{note}
              </p>
            ))}
          </div>
        )}

        {/* 수수료 구간 요약 + 토글 */}
        <div>
          <button onClick={() => setShowBrackets((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">
            <span className="font-medium text-slate-600">수수료 구간표</span>
            <span className="text-slate-400">{policy.feeRateBrackets.length}구간</span>
            {policy.feeRateBrackets.length > 0 && (
              <span className="text-slate-400">
                ({fmtFee(policy.feeRateBrackets[0].baseFee)} ~ {fmtFee(policy.feeRateBrackets[policy.feeRateBrackets.length - 1].baseFee)})
              </span>
            )}
            <span className="text-blue-500 ml-1">{showBrackets ? "접기 ▲" : "펼치기 ▼"}</span>
          </button>
          {showBrackets && (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-slate-400 font-medium">
                    <th className="text-left px-3 py-1.5">현금사업비 구간</th>
                    <th className="text-right px-3 py-1.5">기본수수료</th>
                  </tr>
                </thead>
                <tbody>
                  {policy.feeRateBrackets.map((b, i) => (
                    <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-1.5 text-slate-600">
                        {fmtAmt(b.minAmount)} 이상 ~ {b.maxAmount ? fmtAmt(b.maxAmount) + " 미만" : "이상"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-slate-800">{fmtFee(b.baseFee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const EXEMPT_GRADE_OPTIONS = ["S", "A~C"];

function PolicyForm({ initial, onSubmit, onClose }: { initial: PolicyFormData; onSubmit: (d: PolicyFormData) => void; onClose: () => void }) {
  const [form, setForm] = useState<PolicyFormData>(initial);
  const sf = <K extends keyof PolicyFormData>(k: K, v: PolicyFormData[K]) => setForm((p) => ({ ...p, [k]: v }));

  function toggleExemptGrade(grade: string) {
    const grades = form.exemptGrades ?? [];
    sf("exemptGrades", grades.includes(grade) ? grades.filter((g) => g !== grade) : [...grades, grade]);
  }

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">정책명</label>
          <input className={inputCls} value={form.name} onChange={(e) => sf("name", e.target.value)} placeholder="2025년 상반기 정책" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">버전</label>
          <input className={inputCls} value={form.version} onChange={(e) => sf("version", e.target.value)} placeholder="v2025.1" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">설명</label>
        <input className={inputCls} value={form.description} onChange={(e) => sf("description", e.target.value)} placeholder="정책 변경 사유 및 주요 내용" />
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">표준수수료율 (%)</label>
          <input className={inputCls} type="number" step={0.1} min={0} max={100} value={form.standardRate}
            onChange={(e) => sf("standardRate", Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">적용 시작일</label>
          <input className={inputCls} type="date" value={form.effectiveFrom} onChange={(e) => sf("effectiveFrom", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">적용 종료일</label>
          <input className={inputCls} type="date" value={form.effectiveTo ?? ""} onChange={(e) => sf("effectiveTo", e.target.value || null)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">상태</label>
          <select className={inputCls} value={form.status} onChange={(e) => sf("status", e.target.value as FeePolicy["status"])}>
            <option value="DRAFT">초안</option>
            <option value="ACTIVE">적용중</option>
            <option value="EXPIRED">만료</option>
          </select>
        </div>
      </div>

      {/* 수수료 산정 파라미터 */}
      <div className="rounded-lg border border-slate-200 p-4 space-y-4 bg-slate-50/50">
        <p className="text-xs font-semibold text-slate-700">수수료 산정 파라미터</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">공동기관 가산금 방식</label>
            <select className={inputCls} value={form.coInstAddonMethod ?? "TIERED"}
              onChange={(e) => sf("coInstAddonMethod", e.target.value as "TIERED" | "FLAT")}>
              <option value="TIERED">누진 (1개 10% + 추가 5%씩)</option>
              <option value="FLAT">일률 (공동기관수 × 10%)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">정산면제 등급</label>
            <div className="flex items-center gap-3 pt-1">
              {EXEMPT_GRADE_OPTIONS.map((g) => (
                <label key={g} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={(form.exemptGrades ?? []).includes(g)}
                    onChange={() => toggleExemptGrade(g)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${GRADE_BADGE[g] ?? "bg-slate-100 text-slate-600"}`}>{g}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">자율성트랙 과제 존재</label>
            <div className="flex items-center gap-3 pt-1">
              {([true, false] as const).map((v) => (
                <label key={String(v)} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="hasAutonomyTrack" checked={(form.hasAutonomyTrack ?? true) === v}
                    onChange={() => sf("hasAutonomyTrack", v)}
                    className="text-blue-600 focus:ring-blue-500" />
                  <span className="text-xs text-slate-700">{v ? "있음" : "없음"}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            연차상시 청구 비율 <span className="font-bold text-blue-700">{Math.round((form.annualBillingRate ?? 0.85) * 100)}%</span>
            <span className="ml-2 text-slate-400 font-normal">(85% = KEIT/KETEP, 100% = KOFPI 등 미청구 없는 기관)</span>
          </label>
          <div className="flex items-center gap-3">
            <input type="range" min={50} max={100} step={5}
              value={Math.round((form.annualBillingRate ?? 0.85) * 100)}
              onChange={(e) => sf("annualBillingRate", Number(e.target.value) / 100)}
              className="flex-1 accent-blue-600" />
            <input type="number" min={50} max={100} step={5}
              value={Math.round((form.annualBillingRate ?? 0.85) * 100)}
              onChange={(e) => sf("annualBillingRate", Number(e.target.value) / 100)}
              className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
            <span className="text-xs text-slate-500">%</span>
          </div>
        </div>
        <BracketEditor brackets={form.feeRateBrackets ?? []} onChange={(b) => sf("feeRateBrackets", b)} />
      </div>

      <RuleEditor rules={form.rules} onChange={(rules) => sf("rules", rules)} />
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

// ─── 전담기관 폼 ────────────────────────────────────────────────
const EMPTY_AGENCY: Omit<FundingAgency, "id"> = {
  name: "", shortName: "", code: "", contactName: "", contactEmail: "",
  contactPhone: "", status: "ACTIVE", registeredAt: new Date().toISOString().slice(0, 10), website: "",
};

function AgencyForm({ initial, onSubmit, onClose }: { initial: Omit<FundingAgency, "id">; onSubmit: (d: Omit<FundingAgency, "id">) => void; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const s = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">약칭</label>
          <input className={inputCls} value={form.shortName} onChange={(e) => s("shortName", e.target.value.toUpperCase())} placeholder="KEIT" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">기관 코드</label>
          <input className={inputCls} value={form.code} onChange={(e) => s("code", e.target.value.toUpperCase())} placeholder="KEIT" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">전담기관명</label>
        <input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="한국산업기술기획평가원" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">담당자</label>
          <input className={inputCls} value={form.contactName} onChange={(e) => s("contactName", e.target.value)} placeholder="담당자명" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">이메일</label>
          <input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => s("contactEmail", e.target.value)} placeholder="info@example.kr" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">전화번호</label>
          <input className={inputCls} value={form.contactPhone} onChange={(e) => s("contactPhone", e.target.value)} placeholder="02-0000-0000" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">상태</label>
          <select className={inputCls} value={form.status} onChange={(e) => s("status", e.target.value as FundingAgency["status"])}>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">등록일</label>
          <input className={inputCls} type="date" value={form.registeredAt} onChange={(e) => s("registeredAt", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">웹사이트</label>
          <input className={inputCls} value={form.website ?? ""} onChange={(e) => s("website", e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

const AGENCY_STATUS_MAP: Record<FundingAgency["status"], { label: string; color: "green" | "slate" }> = {
  ACTIVE: { label: "활성", color: "green" },
  INACTIVE: { label: "비활성", color: "slate" },
};

function AgencyTable({ agencies, canEdit, onEdit, onDelete }: { agencies: FundingAgency[]; canEdit: boolean; onEdit: (a: FundingAgency) => void; onDelete: (a: FundingAgency) => void }) {
  if (agencies.length === 0) return <div className="text-center py-10 text-sm text-slate-400">등록된 전담기관이 없습니다.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">전담기관</th>
            <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">코드</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">담당자</th>
            <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">연락처</th>
            <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">상태</th>
            {canEdit && <th className="w-16 px-3 py-3" />}
          </tr>
        </thead>
        <tbody>
          {agencies.map((agency) => (
            <tr key={agency.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex min-w-12 justify-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">{agency.shortName}</span>
                  <div>
                    <p className="font-medium text-slate-800">{agency.name}</p>
                    {agency.website && <p className="text-xs text-slate-400 mt-0.5">{agency.website}</p>}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">{agency.code}</td>
              <td className="px-4 py-3 text-slate-600">{agency.contactName || "-"}</td>
              <td className="px-4 py-3 text-xs text-slate-500">
                <p>{agency.contactEmail || "-"}</p>
                <p className="mt-0.5">{agency.contactPhone || "-"}</p>
              </td>
              <td className="px-4 py-3 text-center">
                <StatusBadge label={AGENCY_STATUS_MAP[agency.status].label} color={AGENCY_STATUS_MAP[agency.status].color} />
              </td>
              {canEdit && (
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 justify-center">
                    <button onClick={() => onEdit(agency)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"><FiEdit2 size={13} /></button>
                    <button onClick={() => onDelete(agency)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><FiTrash2 size={13} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 전담기관 관리 모달 ─────────────────────────────────────────
type AgencyInner = null | { mode: "add" } | { mode: "edit"; target: FundingAgency };

function AgencyManageModal({ canEdit, onAgencyDeleted }: { canEdit: boolean; onAgencyDeleted: (id: string) => void }) {
  const { fundingAgencies } = useStore();
  const [inner, setInner] = useState<AgencyInner>(null);
  const sorted = useMemo(() => [...fundingAgencies].sort((a, b) => a.shortName.localeCompare(b.shortName)), [fundingAgencies]);

  function handleSubmit(data: Omit<FundingAgency, "id">) {
    const normalized = { ...data, shortName: data.shortName.trim().toUpperCase(), code: data.code.trim().toUpperCase(), name: data.name.trim(), website: data.website?.trim() || undefined };
    if (inner?.mode === "add") addFundingAgency(normalized);
    else if (inner?.mode === "edit") updateFundingAgency(inner.target.id, normalized);
    setInner(null);
  }

  function handleDelete(agency: FundingAgency) {
    if (!confirm(`"${agency.shortName}" 전담기관을 삭제하시겠습니까?`)) return;
    deleteFundingAgency(agency.id);
    onAgencyDeleted(agency.id);
  }

  if (inner !== null) {
    const initial = inner.mode === "edit" ? (({ id: _id, ...rest }) => rest)(inner.target) : EMPTY_AGENCY;
    return (
      <div>
        <div className="px-5 pt-4">
          <button onClick={() => setInner(null)} className="text-xs text-slate-500 hover:text-slate-700 transition-colors">← 목록으로</button>
        </div>
        <AgencyForm initial={initial} onSubmit={handleSubmit} onClose={() => setInner(null)} />
      </div>
    );
  }

  return (
    <div>
      {canEdit && (
        <div className="px-5 pt-4 flex justify-end">
          <button onClick={() => setInner({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-700 rounded-lg hover:bg-slate-800 transition-colors">
            <FiPlus size={12} />전담기관 추가
          </button>
        </div>
      )}
      <AgencyTable agencies={sorted} canEdit={canEdit} onEdit={(a) => setInner({ mode: "edit", target: a })} onDelete={handleDelete} />
    </div>
  );
}

// ─── 모달 상태 타입 ──────────────────────────────────────────────
type ModalState =
  | { kind: "policy-add" }
  | { kind: "policy-edit"; target: FeePolicy }
  | { kind: "agency-manage" };

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function CompanyClassPage() {
  const canEdit = useCanWrite("company-class");
  const { fundingAgencies, feePolicies } = useStore();
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<ModalState | null>(null);

  const activeAgencies = fundingAgencies.filter((a) => a.status === "ACTIVE");
  const tabs = [
    { id: null as string | null, shortName: "공통", name: "공통 기준" },
    ...activeAgencies.map((a) => ({ id: a.id, shortName: a.shortName, name: a.name })),
  ];
  const selectedAgency = activeAgencies.find((a) => a.id === selectedAgencyId);

  const agencyPolicies = useMemo(
    () => [...feePolicies.filter((p) => p.agencyId === selectedAgencyId)].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [feePolicies, selectedAgencyId],
  );
  const activePolicy = agencyPolicies.find((p) => p.status === "ACTIVE");
  const commonActivePolicy = feePolicies.find((p) => p.status === "ACTIVE" && p.agencyId === null);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function handlePolicySubmit(data: PolicyFormData) {
    if (modal?.kind === "policy-add") addFeePolicy(data);
    else if (modal?.kind === "policy-edit") updateFeePolicy(modal.target.id, data);
    setModal(null);
  }

  function getNewVersionTemplate(): FeePolicy | null {
    return activePolicy ?? commonActivePolicy ?? null;
  }

  const modalTitle =
    modal?.kind === "policy-add"
      ? `새 버전 추가 — ${selectedAgencyId === null ? "공통" : (selectedAgency?.shortName ?? "")}`
      : modal?.kind === "policy-edit"
      ? `버전 수정 — ${modal.target.version}`
      : "전담기관 관리";

  return (
    <div className="space-y-4">
      {/* 탭 + 전담기관 관리 버튼 */}
      <div className="bg-white rounded-xl border border-slate-200 flex items-center overflow-hidden">
        <div className="flex overflow-x-auto flex-1">
          {tabs.map((tab) => {
            const hasActive = feePolicies.some((p) => p.agencyId === tab.id && p.status === "ACTIVE");
            return (
              <button
                key={String(tab.id)}
                onClick={() => setSelectedAgencyId(tab.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  selectedAgencyId === tab.id ? "border-blue-600 text-blue-700 bg-blue-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                {tab.shortName}
                {hasActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="shrink-0 px-3 border-l border-slate-100">
          <button
            onClick={() => setModal({ kind: "agency-manage" })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            전담기관 관리 · {fundingAgencies.length}개
          </button>
        </div>
      </div>

      {/* 기관 수수료 산정 특성 요약 */}
      {(activePolicy ?? commonActivePolicy) && (
        <AgencyFeeModelSummary
          agency={selectedAgency ?? undefined}
          policy={(activePolicy ?? commonActivePolicy)!}
        />
      )}

      {/* 수수료 기준 이력 카드 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              {selectedAgencyId === null ? "공통 기준 이력" : `${selectedAgency?.name ?? ""} 기준 이력`}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedAgencyId === null
                ? "전담기관 자체 기준이 없는 경우 적용되는 공통 수수료 기준"
                : `${selectedAgency?.shortName} 자체 기준 · 없으면 공통 기준 적용`}
              {" · "}총 {agencyPolicies.length}개 버전
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setModal({ kind: "policy-add" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
            >
              <FiPlus size={12} />새 버전
            </button>
          )}
        </div>

        {agencyPolicies.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-slate-400">등록된 버전이 없습니다.</p>
            {selectedAgencyId !== null && commonActivePolicy && (
              <div className="mt-4 mx-auto max-w-xl rounded-lg bg-slate-50 border border-slate-200 p-4 text-left">
                <p className="text-xs font-medium text-slate-600 mb-3">공통 기준 ({commonActivePolicy.version}) 적용 중</p>
                <RuleTable rules={commonActivePolicy.rules} standardRate={commonActivePolicy.standardRate} />
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {agencyPolicies.map((policy) => {
              const isActive = policy.status === "ACTIVE";
              const isExpanded = isActive || expandedIds.has(policy.id);
              const displayRules = policy.rules.length > 0 ? policy.rules : (commonActivePolicy?.rules ?? []);
              const displayRate = policy.rules.length > 0 ? policy.standardRate : (commonActivePolicy?.standardRate ?? policy.standardRate);

              return (
                <div key={policy.id} className={isActive ? "bg-blue-50/30" : undefined}>
                  {/* 버전 헤더 */}
                  <div className="px-5 py-3.5 flex items-center gap-3">
                    {!isActive && (
                      <button onClick={() => toggleExpand(policy.id)} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
                        {isExpanded ? <FiChevronDown size={15} /> : <FiChevronRight size={15} />}
                      </button>
                    )}
                    {isActive && <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" />}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="font-mono text-xs text-slate-500 shrink-0">{policy.version}</span>
                      <span className="font-medium text-slate-800 text-sm truncate">{policy.name}</span>
                      {policy.description && <span className="text-xs text-slate-400 truncate hidden sm:block">{policy.description}</span>}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-slate-500 hidden md:block">
                        {fmtDate(policy.effectiveFrom)} ~ {policy.effectiveTo ? fmtDate(policy.effectiveTo) : "현재"}
                      </span>
                      <span className={`text-sm font-bold ${isActive ? "text-blue-700" : "text-slate-500"}`}>{policy.standardRate}%</span>
                      <StatusBadge label={POLICY_STATUS_MAP[policy.status].label} color={POLICY_STATUS_MAP[policy.status].color} />
                      {canEdit && (
                        <button onClick={() => setModal({ kind: "policy-edit", target: policy })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-100 rounded transition-colors">
                          <FiEdit2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 기준표 (펼쳐진 상태) */}
                  {isExpanded && (
                    <div className={`px-5 pb-4 ${isActive ? "" : "pt-1"}`}>
                      {policy.rules.length === 0 && commonActivePolicy && (
                        <p className="text-xs text-slate-400 mb-2">공통 기준표 적용 ({commonActivePolicy.version})</p>
                      )}
                      <RuleTable rules={displayRules} standardRate={displayRate} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 모달 */}
      {(modal?.kind === "policy-add" || modal?.kind === "policy-edit") && (
        <Modal title={modalTitle} onClose={() => setModal(null)} size="xl">
          <PolicyForm
            initial={
              modal.kind === "policy-edit"
                ? Object.fromEntries(Object.entries(modal.target).filter(([k]) => k !== "id")) as PolicyFormData
                : makePolicyEmpty(selectedAgencyId, getNewVersionTemplate())
            }
            onSubmit={handlePolicySubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
      {modal?.kind === "agency-manage" && (
        <Modal title="전담기관 관리" onClose={() => setModal(null)} size="xl">
          <AgencyManageModal canEdit={canEdit} onAgencyDeleted={(id) => { if (selectedAgencyId === id) setSelectedAgencyId(null); }} />
        </Modal>
      )}
    </div>
  );
}
