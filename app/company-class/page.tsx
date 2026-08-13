"use client";

import { useState, useMemo } from "react";
import { FiChevronDown, FiChevronRight, FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  useStore,
  addFeePolicy,
  updateFeePolicy,
  deleteFeePolicy,
  addFundingAgency,
  updateFundingAgency,
  deleteFundingAgency,
} from "@/lib/store";
import { type PolicyRule, type FeePolicy, type FundingAgency, type FeeRateBracket, KEIT_BRACKETS, KETEP_BRACKETS, KOFPI_BRACKETS } from "@/lib/mock";
import { buildPolicyDisplayRules } from "@/lib/fee-calculator";
import Modal from "@/components/common/Modal";
import StatusBadge from "@/components/common/StatusBadge";
import DateInput from "@/components/common/DateInput";
import MoneyInput from "@/components/common/MoneyInput";
import { useCanWrite } from "@/lib/permissions";
import { fmtDate, fmtWonFull } from "@/lib/utils";

// ─── 공통 스타일 ────────────────────────────────────────────────
const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

// "수수료 산정 특성" 표의 값 글자 색 — neutral(기본값)과 그 외(정책이 기본값과 달라지는 지점)를
// 색으로 구분해 한눈에 "이 전담기관이 뭐가 특이한지"만 훑어볼 수 있게 한다.
const FEATURE_TONE_CLS: Record<string, string> = {
  neutral: "text-slate-700",
  emerald: "text-emerald-700",
  amber: "text-amber-700",
  purple: "text-purple-700",
  fuchsia: "text-fuchsia-700",
  orange: "text-orange-700",
  sky: "text-sky-700",
};

// ─── 등급 상수 ──────────────────────────────────────────────────
const GRADE_BADGE: Record<string, string> = {
  일반: "bg-slate-100 text-slate-600",
  S: "bg-yellow-100 text-yellow-700",
  A: "bg-blue-100 text-blue-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-blue-100 text-blue-700",
  자율성트랙: "bg-purple-100 text-purple-700",
};

const POLICY_STATUS_MAP: Record<FeePolicy["status"], { label: string; color: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "적용중", color: "green" },
  EXPIRED: { label: "만료", color: "slate" },
  DRAFT: { label: "초안", color: "amber" },
};

// ─── 기준표 (읽기 전용 — exemptGrades·exemptionMode·hasAutonomyTrack·annualBillingRate로부터 자동 생성) ──
function RuleTable({ rules, standardRate }: { rules: PolicyRule[]; standardRate: number }) {
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
            const excluded = r.settlementType === "제외대상";
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
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                    r.settlementType === "자체정산" ? "bg-emerald-50 text-emerald-700" :
                    r.settlementType === "위탁정산" ? "bg-amber-50 text-amber-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>
                    {r.settlementType}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{excluded ? "—" : `${r.annualRate}%`}</td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{excluded ? "—" : `${r.settlementRate}%`}</td>
                <td className="px-3 py-2.5 text-center">
                  {excluded ? (
                    <span className="text-xs text-slate-400">산정 제외</span>
                  ) : (
                    <span className="text-xs font-semibold text-blue-700">
                      연{effectiveAnnual}% / 정{effectiveSettlement}%
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
    description: "",
    createdAt: new Date().toISOString().slice(0, 10),
    createdBy: "김관리",
    feeRateBrackets: templatePolicy?.feeRateBrackets ?? KEIT_BRACKETS,
    coInstAddonMethod: templatePolicy?.coInstAddonMethod ?? "TIERED",
    coInstFirstRate: templatePolicy?.coInstFirstRate ?? 0.1,
    coInstAdditionalRate: templatePolicy?.coInstAdditionalRate ?? 0.05,
    exemptGrades: templatePolicy?.exemptGrades ?? ["S", "A", "B", "C"],
    exemptionMode: templatePolicy?.exemptionMode ?? "DISCOUNT",
    exemptCustomRate: templatePolicy?.exemptCustomRate ?? 0.85,
    defaultSettlementType: templatePolicy?.defaultSettlementType ?? "자체정산",
    feeBasis: templatePolicy?.feeBasis ?? "CASH",
    hasAutonomyTrack: templatePolicy?.hasAutonomyTrack ?? true,
    annualBillingRate: templatePolicy?.annualBillingRate ?? 0.85,
    minimumFee: templatePolicy?.minimumFee ?? 0,
    excludeLeadFromCalc: templatePolicy?.excludeLeadFromCalc ?? false,
    calcMode: templatePolicy?.calcMode ?? "AGGREGATE",
    programType: templatePolicy?.programType ?? "GENERAL",
    legacyTransitionNote: templatePolicy?.legacyTransitionNote ?? "",
  };
}

// ─── 요율표 편집기 ───────────────────────────────────────────────
function BracketEditor({ brackets, onChange }: { brackets: FeeRateBracket[]; onChange: (b: FeeRateBracket[]) => void }) {
  // "이상"은 항상 바로 앞 구간의 "미만"과 이어져야(빈틈 없이) 하므로 직접 입력받지 않고 항상
  // 자동으로 맞춘다 — 예전엔 행마다 따로 입력받아서, 앞 구간을 고쳐도 다음 구간 "이상"이 안 따라와
  // 구간 사이에 빈틈이 생길 수 있었다(getBaseFee는 minAmount만 보고 구간을 찾으므로 실제 계산도 어긋남).
  function normalize(list: FeeRateBracket[]): FeeRateBracket[] {
    return list.map((b, i) => ({ ...b, minAmount: i === 0 ? 0 : (list[i - 1].maxAmount ?? 0) }));
  }
  function add() { onChange(normalize([...brackets, { minAmount: 0, maxAmount: null, baseFee: 0 }])); }
  function remove(i: number) { onChange(normalize(brackets.filter((_, idx) => idx !== i))); }
  function set(i: number, k: "maxAmount" | "baseFee", v: number | null) {
    onChange(normalize(brackets.map((b, idx) => idx === i ? { ...b, [k]: v } : b)));
  }
  const fmtAmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-slate-700">현금사업비 구간별 기본수수료 (정액)</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onChange(normalize(KEIT_BRACKETS))} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KEIT 기준</button>
          <button type="button" onClick={() => onChange(normalize(KETEP_BRACKETS))} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KETEP 기준</button>
          <button type="button" onClick={() => onChange(normalize(KOFPI_BRACKETS))} className="text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors">KOFPI 기준</button>
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
              <th className="w-6 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {brackets.map((b, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0">
                <td className="px-2 py-1.5 text-slate-500">
                  {fmtAmt(b.minAmount)}원
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput placeholder="(상한없음)" className="w-36 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={b.maxAmount ?? 0} onFocus={(e) => e.target.select()} onChange={(v) => set(i, "maxAmount", v === 0 ? null : v)} />
                </td>
                <td className="px-2 py-1.5">
                  <MoneyInput className="w-28 text-xs border border-slate-200 rounded px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={b.baseFee} onFocus={(e) => e.target.select()} onChange={(v) => set(i, "baseFee", v)} />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button type="button" onClick={() => remove(i)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                    <FiTrash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            {brackets.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">구간이 없습니다. 행 추가 또는 기준 버튼을 사용하세요.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── 전담기관 수수료 산정 특성 요약 ─────────────────────────
// 기관별 특이사항(agency.specialNotes)은 정책 파라미터에서 자동 계산되는 값이 아니라, "전담기관 관리"
// 모달에서 담당자가 직접 입력·수정하는 순수 참고용 메모다(하드코딩 아님). 정책 자체의 경과조치
// 안내(policy.legacyTransitionNote)만 정책별로 따로 있어 뒤에 이어 붙인다.
function AgencyFeeModelSummary({ agency, policy }: { agency: Pick<FundingAgency, "shortName" | "name" | "specialNotes"> | undefined; policy: FeePolicy }) {
  const [showBrackets, setShowBrackets] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const staticNotes = agency?.specialNotes ?? [];
  const notes = policy.legacyTransitionNote ? [...staticNotes, policy.legacyTransitionNote] : staticNotes;

  // 각 항목을 값(짧은 배지)과 부가설명(작은 회색 텍스트)으로 분리한다 — 예전처럼 한 줄에
  // "값 — 설명"을 다 욱여넣으면 항목마다 줄바꿈 위치가 들쭉날쭉해져 옆 항목과 나란히 읽기 어려웠다.
  const exemptValue = policy.exemptGrades.length === 0 ? "없음" : `${policy.exemptGrades.join("·")} 등급`;
  // 실제 적용 비율은 항상 annualBillingRate(DISCOUNT) 또는 exemptCustomRate(CUSTOM)에서 그대로
  // 읽어와야 한다 — "85%"로 고정 텍스트를 쓰면 연차상시청구비율을 다른 값으로 바꿨을 때 화면
  // 문구와 실제 계산이 서로 어긋나 보이는 문제가 있었다.
  const exemptAppliedPct = policy.exemptionMode === "CUSTOM"
    ? Math.round((policy.exemptCustomRate ?? policy.annualBillingRate) * 100)
    : Math.round(policy.annualBillingRate * 100);
  const exemptDetail = policy.exemptGrades.length === 0
    ? "모든 기관 일반 취급"
    : policy.exemptionMode === "EXCLUDE"
    ? "산정기준액에서 완전 제외 (연차상시도 안 함)"
    : policy.exemptionMode === "CUSTOM"
    ? `자체정산 선택 시 ${exemptAppliedPct}%만 적용 (일반 기관과 별도 비율)`
    : `자체정산 선택 시 ${exemptAppliedPct}%만 적용`;
  const exemptTone = policy.exemptGrades.length === 0 ? "neutral" : "amber";

  const showDefaultSettlement = policy.exemptGrades.length > 0 &&
    (policy.exemptionMode === "DISCOUNT" || policy.exemptionMode === "CUSTOM");
  const isSelfSettleDefault = (policy.defaultSettlementType ?? "자체정산") === "자체정산";
  const defaultSettlementValue = isSelfSettleDefault ? "자체정산" : "위탁정산";
  const defaultSettlementDetail = isSelfSettleDefault ? `정산 연차에도 ${exemptAppliedPct}% 유지` : "정산 연차엔 100%";

  const addonValue = policy.coInstAddonMethod === "TIERED" ? "누진형" : policy.coInstAddonMethod === "FLAT" ? "일률형" : "커스텀";
  const addonDetail = policy.coInstAddonMethod === "TIERED"
    ? "1번째 10% + 이후 추가 5%씩"
    : policy.coInstAddonMethod === "FLAT"
    ? "공동기관 수 × 10%"
    : `1번째 ${Math.round((policy.coInstFirstRate ?? 0.1) * 100)}% + 이후 추가 ${Math.round((policy.coInstAdditionalRate ?? 0.05) * 100)}%씩`;

  const feeBasisValue = policy.feeBasis === "CASH_PLUS_INKIND" ? "현금 + 현물 합산" : "현금사업비만";

  const isFullBilling = policy.annualBillingRate >= 1;
  const billingValue = isFullBilling ? "100%" : `${Math.round(policy.annualBillingRate * 100)}%`;
  const billingDetail = isFullBilling ? "연차상시·정산 모두 동일 (미청구 개념 없음)" : "연차상시 기준 · 정산 연차는 100%";

  const isPerInstitution = policy.calcMode === "PER_INSTITUTION";
  const calcModeValue = isPerInstitution ? "기관별 개별 산정" : "과제 전체 배분";
  const calcModeDetail = isPerInstitution ? "공동기관 구분 없이 각자 사업비를 구간표에 대입" : "과제 전체 사업비 기준 산정 후 배분";

  const isIctFund = policy.programType === "ICT_FUND";
  const programTypeValue = isIctFund ? "ICT 기금사업" : "일반 R&D";

  const hasMinimumFee = !!policy.minimumFee && policy.minimumFee > 0;
  const minimumFeeValue = hasMinimumFee ? fmtWonFull(policy.minimumFee!) : "없음";
  const minimumFeeDetail = hasMinimumFee ? "미만 시 이 금액 기준, 차액은 이월" : undefined;

  const excludeLeadValue = policy.excludeLeadFromCalc ? "제외" : "포함";
  const excludeLeadDetail = policy.excludeLeadFromCalc ? "산정기준액에서 완전 제외 (공동기관수 -1 보정)" : "일반 기관과 동일하게 포함";

  const fmtAmt = (n: number) => n.toLocaleString("ko-KR");
  const fmtFee = fmtWonFull;

  type FeatureItem = { label: string; value: string; detail?: string; tone: keyof typeof FEATURE_TONE_CLS };
  const featureGroups: { title: string; items: FeatureItem[] }[] = [
    {
      title: "면제 · 정산 처리",
      items: [
        { label: "면제기관", value: exemptValue, detail: exemptDetail, tone: exemptTone },
        ...(showDefaultSettlement
          ? [{ label: "정산구분 기본값", value: defaultSettlementValue, detail: defaultSettlementDetail, tone: isSelfSettleDefault ? "emerald" as const : "amber" as const }]
          : []),
      ],
    },
    {
      title: "산정 계산",
      items: [
        { label: "산정 기준액", value: feeBasisValue, tone: "neutral" },
        { label: "산정 방식", value: calcModeValue, detail: calcModeDetail, tone: isPerInstitution ? "fuchsia" : "neutral" },
        { label: "가산금 방식", value: addonValue, detail: addonDetail, tone: "neutral" },
        { label: "주관기관 산정", value: excludeLeadValue, detail: excludeLeadDetail, tone: policy.excludeLeadFromCalc ? "orange" : "neutral" },
        { label: "최소수수료", value: minimumFeeValue, detail: minimumFeeDetail, tone: hasMinimumFee ? "orange" : "neutral" },
      ],
    },
    {
      title: "청구 정책",
      items: [
        { label: "연차상시 청구", value: billingValue, detail: billingDetail, tone: isFullBilling ? "emerald" : "sky" },
        { label: "자율성트랙", value: policy.hasAutonomyTrack ? "있음" : "없음", detail: policy.hasAutonomyTrack ? "해당 과제 전 연도 85% 청구" : undefined, tone: policy.hasAutonomyTrack ? "purple" : "neutral" },
        { label: "사업 유형", value: programTypeValue, tone: isIctFund ? "fuchsia" : "neutral" },
      ],
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <span className="text-xs font-bold text-slate-500 tracking-wide">수수료 산정 특성</span>
        {agency && <span className="text-xs text-slate-400">— {agency.name} ({agency.shortName})</span>}
      </div>
      <div className="px-5 py-4 space-y-4">
        {/* 핵심 파라미터 — 성격별로 묶고, 그룹 안에서는 한 행에 3항목씩 격자로 줄맞춤한다.
            항목 하나당 표 한 줄(라벨|값)을 다 쓰면 세로로 너무 길어져서, 3열로 채워 넣어
            그룹 하나가 차지하는 높이를 줄이면서도 격자 테두리로 항목 경계는 그대로 유지했다. */}
        {featureGroups.map((group) => {
          const cols = 3;
          const totalRows = Math.ceil(group.items.length / cols);
          return (
            <div key={group.title}>
              <p className="text-[11px] font-bold text-slate-500 tracking-wide mb-2">{group.title}</p>
              <div className="border border-slate-200 rounded-lg overflow-hidden grid grid-cols-3">
                {group.items.map((item, i) => {
                  const rowIdx = Math.floor(i / cols);
                  const isLastCol = i % cols === cols - 1 || i === group.items.length - 1;
                  const isLastRow = rowIdx === totalRows - 1;
                  return (
                    <div
                      key={item.label}
                      className={`px-3.5 py-2.5 ${!isLastCol ? "border-r border-slate-200" : ""} ${!isLastRow ? "border-b border-slate-200" : ""}`}
                    >
                      <p className="text-xs text-slate-500 font-semibold mb-1">{item.label}</p>
                      <span className={`text-sm font-bold ${FEATURE_TONE_CLS[item.tone]}`}>{item.value}</span>
                      {item.detail && <p className="text-xs text-slate-500 mt-0.5 leading-snug">{item.detail}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* 특이사항 노트 — 기본은 접어두고(내용이 많아 늘 펼쳐두면 화면을 많이 차지함), 눌러야
            펼쳐지게 했다. 색도 진한 amber 배경 대신 눈에 덜 피로한 회색 톤으로, 다이아몬드(◆)
            불릿도 "-"로 바꿨다. */}
        {notes.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setShowNotes((v) => !v)}
              className="w-full flex items-center gap-1.5 px-3.5 py-2.5 text-xs text-slate-500 hover:bg-slate-50 transition-colors">
              <span className="font-medium text-slate-600">특이사항</span>
              <span className="text-slate-400">{notes.length}건</span>
              <span className="text-blue-500 ml-1">{showNotes ? "접기 ▲" : "펼치기 ▼"}</span>
            </button>
            {showNotes && (
              <div className="border-t border-slate-200 bg-slate-50 px-3.5 py-2.5 space-y-1.5">
                {notes.map((note, i) => (
                  <p key={i} className="text-xs text-slate-600 flex items-start gap-1.5">
                    <span className="shrink-0 text-slate-400">-</span>{note}
                  </p>
                ))}
              </div>
            )}
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
          {showBrackets && (() => {
            const cols = 2;
            const totalRows = Math.ceil(policy.feeRateBrackets.length / cols);
            return (
              <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden grid grid-cols-2 text-xs">
                {policy.feeRateBrackets.map((b, i) => {
                  const rowIdx = Math.floor(i / cols);
                  const isLastCol = i % cols === cols - 1 || i === policy.feeRateBrackets.length - 1;
                  const isLastRow = rowIdx === totalRows - 1;
                  return (
                    <div
                      key={i}
                      className={`px-3.5 py-2 flex items-center justify-between gap-3 ${!isLastCol ? "border-r border-slate-200" : ""} ${!isLastRow ? "border-b border-slate-200" : ""}`}
                    >
                      <span className="text-slate-500">
                        {fmtAmt(b.minAmount)} 이상{b.maxAmount ? ` ~ ${fmtAmt(b.maxAmount)} 미만` : " (상한 없음)"}
                      </span>
                      <span className="font-mono font-semibold text-slate-800 shrink-0">{fmtFee(b.baseFee)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

const EXEMPT_GRADE_OPTIONS = ["S", "A", "B", "C"];

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
          <DateInput className="w-full" value={form.effectiveFrom} onChange={(v) => sf("effectiveFrom", v)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">적용 종료일</label>
          <DateInput className="w-full" value={form.effectiveTo ?? ""} onChange={(v) => sf("effectiveTo", v || null)} />
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

      {/* 수수료 산정 파라미터 — 읽기 전용 요약 카드(AgencyFeeModelSummary)와 동일한 3개 그룹으로
          나눠서, 저장 후 보게 될 요약 화면과 편집 화면의 구조가 서로 대응되게 했다. 예전엔 12개
          넘는 항목이 구분 없이 한 덩어리로 쌓여 있어 지금 뭘 고치고 있는지 훑어보기 어려웠다. */}
      <div className="rounded-lg border border-slate-200 p-4 space-y-5 bg-slate-50/50">
        <p className="text-xs font-semibold text-slate-700">수수료 산정 파라미터</p>

        {/* 면제 · 정산 처리 */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-slate-500 tracking-wide">면제 · 정산 처리</p>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">정산면제 등급</label>
            <div className="flex items-center gap-3">
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
          {(() => {
            // 면제기관에 실제로 적용되는 비율 — DISCOUNT는 일반 기관과 같은 annualBillingRate,
            // CUSTOM은 exemptCustomRate(미지정 시 annualBillingRate)를 쓴다. 아래 라벨들이 실제
            // 값과 다르게 "85%"로 고정 표시되던 문제가 있어 항상 이 값으로 동적으로 표시한다.
            const annualPct = Math.round((form.annualBillingRate ?? 0.85) * 100);
            const exemptPct = form.exemptionMode === "CUSTOM"
              ? Math.round((form.exemptCustomRate ?? form.annualBillingRate ?? 0.85) * 100)
              : annualPct;
            return (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">면제기관 처리 방식</label>
                  {/* 옵션 목록엔 숫자를 넣지 않는다 — "OO% 적용"처럼 드롭다운 항목 안에 실제 값을
                      박아 넣으면, 이 항목을 고르는 게 그 %를 여기서 지정/고정하는 것처럼 보여서
                      혼동을 준다(실제로는 그냥 "일반 기관과 같은 비율을 쓴다"는 모드 선택일 뿐이고,
                      진짜 숫자는 아래 "연차상시 청구 비율" 필드가 정한다). 숫자는 옵션 밑에 별도
                      안내문구로만 보여준다. */}
                  <select className={inputCls} value={form.exemptionMode ?? "DISCOUNT"}
                    onChange={(e) => sf("exemptionMode", e.target.value as "DISCOUNT" | "EXCLUDE" | "CUSTOM")}>
                    <option value="DISCOUNT">일반 기관과 동일 비율 적용 (KEIT/KETEP)</option>
                    <option value="EXCLUDE">완전 제외 — 연차상시도 안 함 (IITP/RDA)</option>
                    <option value="CUSTOM">커스텀 — 면제기관에만 별도 비율 적용</option>
                  </select>
                  {form.exemptionMode === "DISCOUNT" && (
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      면제기관도 아래 &quot;연차상시 청구 비율&quot;과 동일하게 적용됩니다 — 현재 <span className="font-semibold text-slate-500">{annualPct}%</span>
                    </p>
                  )}
                  {form.exemptionMode === "CUSTOM" && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-500 shrink-0">면제기관 전용 청구비율</span>
                      <input type="number" min={0} max={100} step={5}
                        value={Math.round((form.exemptCustomRate ?? form.annualBillingRate ?? 0.85) * 100)}
                        onChange={(e) => sf("exemptCustomRate", Number(e.target.value) / 100)}
                        className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      <span className="text-xs text-slate-500">% (일반 기관은 {annualPct}% 그대로 유지)</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    면제기관 정산구분 기본값
                    <span className="ml-1 text-slate-400 font-normal">· 참여기관별로 개별 지정 안 했을 때 적용</span>
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
                    <button type="button"
                      onClick={() => sf("defaultSettlementType", "자체정산")}
                      className={`flex-1 px-2 py-1.5 transition-colors ${
                        (form.defaultSettlementType ?? "자체정산") === "자체정산" ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>자체정산 (정산연차도 {exemptPct}%)</button>
                    <button type="button"
                      onClick={() => sf("defaultSettlementType", "위탁정산")}
                      className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${
                        form.defaultSettlementType === "위탁정산" ? "bg-amber-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>위탁정산 (정산연차 100%)</button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* 산정 계산 */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 tracking-wide">산정 계산</p>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">산정 기준액</label>
              <select className={inputCls} value={form.feeBasis ?? "CASH"}
                onChange={(e) => sf("feeBasis", e.target.value as "CASH" | "CASH_PLUS_INKIND")}>
                <option value="CASH">현금사업비만</option>
                <option value="CASH_PLUS_INKIND">현금 + 현물 합산 (RDA)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">산정 방식</label>
              <select className={inputCls} value={form.calcMode ?? "AGGREGATE"}
                onChange={(e) => sf("calcMode", e.target.value as "AGGREGATE" | "PER_INSTITUTION")}>
                <option value="AGGREGATE">과제 전체 사업비 기준 (기본)</option>
                <option value="PER_INSTITUTION">기관별 개별 산정 (IITP ICT기금사업)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">공동기관 가산금 방식</label>
              <select className={inputCls} value={form.coInstAddonMethod ?? "TIERED"}
                onChange={(e) => sf("coInstAddonMethod", e.target.value as "TIERED" | "FLAT" | "CUSTOM")}>
                <option value="TIERED">누진 (1개 10% + 추가 5%씩)</option>
                <option value="FLAT">일률 (공동기관수 × 10%)</option>
                <option value="CUSTOM">커스텀 (직접 입력)</option>
              </select>
            </div>
          </div>

          {form.coInstAddonMethod === "CUSTOM" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">1번째 공동기관 가산율 (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} step={0.5}
                    value={Math.round((form.coInstFirstRate ?? 0.1) * 1000) / 10}
                    onChange={(e) => sf("coInstFirstRate", Number(e.target.value) / 100)}
                    className="w-24 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  <span className="text-xs text-slate-500">%</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">이후 공동기관 1개당 가산율 (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} step={0.5}
                    value={Math.round((form.coInstAdditionalRate ?? 0.05) * 1000) / 10}
                    onChange={(e) => sf("coInstAdditionalRate", Number(e.target.value) / 100)}
                    className="w-24 text-sm border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  <span className="text-xs text-slate-500">%</span>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">최소수수료 (원)</label>
              <MoneyInput className={inputCls} value={form.minimumFee ?? 0}
                onChange={(v) => sf("minimumFee", v)} placeholder="0 = 없음" />
              <p className="text-[10px] text-slate-400 mt-1">연차별 산정수수료가 이 금액 미만이면 이 금액을 기준으로 하고 차액은 이월 (RDA1/RDA2: 100,000원)</p>
            </div>
            <div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.excludeLeadFromCalc ?? false}
                  onChange={(e) => sf("excludeLeadFromCalc", e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs font-medium text-slate-700">주관기관을 산정기준액에서 완전 제외</span>
              </label>
              <p className="text-[10px] text-slate-400 mt-1 ml-6">주관기관이 산정에서 빠지고 공동기관수 -1 보정 후, 남은 기관에 사업비 비율로 배분 (RDA2: 주관기관이 농진청/소속기관인 경우)</p>
            </div>
          </div>
        </div>

        {/* 청구 정책 */}
        <div className="space-y-3 pt-4 border-t border-slate-200">
          <p className="text-[11px] font-bold text-slate-500 tracking-wide">청구 정책</p>
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
          <div className="grid grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">사업 유형</label>
              <select className={inputCls} value={form.programType ?? "GENERAL"}
                onChange={(e) => sf("programType", e.target.value as "GENERAL" | "ICT_FUND")}>
                <option value="GENERAL">일반 R&D</option>
                <option value="ICT_FUND">ICT 기금사업</option>
              </select>
              <p className="text-[10px] text-slate-400 mt-1">동일 전담기관에 사업 유형별로 별도 정책을 둘 수 있음</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <label className="block text-xs font-medium text-slate-600 mb-1">경과조치 안내</label>
          <textarea className={`${inputCls} resize-y`} rows={2} value={form.legacyTransitionNote ?? ""}
            onChange={(e) => sf("legacyTransitionNote", e.target.value)}
            placeholder="예: 26년 이후 수수료체계 변경 — 이전 과제 미청구수수료는 수기 조정 필요 (KETEP 등)" />
        </div>
        <BracketEditor brackets={form.feeRateBrackets ?? []} onChange={(b) => sf("feeRateBrackets", b)} />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-700 mb-2">
          실제 수수료율 미리보기 <span className="text-slate-400 font-normal">— 위 파라미터로부터 자동 계산됨</span>
        </label>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <RuleTable rules={buildPolicyDisplayRules(form)} standardRate={form.standardRate} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

// ─── 소속기관 자동판별 목록 편집기 ──────────────────────────────
// 이 전담기관 자동판별을 켜두면, 새 과제 등록/수정·엑셀 업로드 시 주관기관명이 아래 목록에 있는
// 과제는 다른 전담기관을 선택해도 이 전담기관으로 자동 교정된다(resolveAutoDetectedAgencyId).
// RDA1/RDA2처럼 같은 실제 기관을 정책상 여러 전담기관 레코드로 나눠 관리할 때 쓰지만,
// 특정 전담기관 한 곳에만 국한되지 않고 어느 전담기관이든 켤 수 있다.
// 소속기관 목록·기관별 특이사항 둘 다 "문자열 여러 줄을 추가/삭제하며 편집"하는 동일한 모양이라
// 하나의 컴포넌트를 공유한다.
function StringListEditor({
  label, addLabel, placeholder, emptyText, values, onChange,
}: {
  label: string; addLabel: string; placeholder: string; emptyText: string;
  values: string[]; onChange: (values: string[]) => void;
}) {
  function add() { onChange([...values, ""]); }
  function remove(i: number) { onChange(values.filter((_, idx) => idx !== i)); }
  function set(i: number, v: string) { onChange(values.map((n, idx) => (idx === i ? v : n))); }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs font-medium text-slate-600">{label}</label>
        <button type="button" onClick={add} className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors">
          <FiPlus size={11} />{addLabel}
        </button>
      </div>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        {values.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400">{emptyText}</p>
        ) : (
          values.map((value, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0">
              <input value={value} onChange={(e) => set(i, e.target.value)} placeholder={placeholder}
                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <button type="button" onClick={() => remove(i)} className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                <FiTrash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── 전담기관 폼 ────────────────────────────────────────────────
const EMPTY_AGENCY: Omit<FundingAgency, "id"> = {
  name: "", shortName: "", code: "", contactName: "", contactEmail: "",
  contactPhone: "", status: "ACTIVE", registeredAt: new Date().toISOString().slice(0, 10), website: "",
  noticeRecipientScope: "LEAD_ONLY",
  autoDetectByLeadInstitution: false,
  affiliatedInstitutionNames: [],
  specialNotes: [],
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
          <DateInput className="w-full" value={form.registeredAt} onChange={(v) => s("registeredAt", v)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">웹사이트</label>
          <input className={inputCls} value={form.website ?? ""} onChange={(e) => s("website", e.target.value)} placeholder="https://..." />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">공문·세금계산서 발송 대상</label>
        <select className={inputCls} value={form.noticeRecipientScope} onChange={(e) => s("noticeRecipientScope", e.target.value as FundingAgency["noticeRecipientScope"])}>
          <option value="LEAD_ONLY">주관기관만</option>
          <option value="LEAD_AND_PARTICIPANTS">주관+참여기관 모두</option>
        </select>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.autoDetectByLeadInstitution ?? false}
            onChange={(e) => s("autoDetectByLeadInstitution", e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-xs font-medium text-slate-700">소속기관 자동판별</span>
        </label>
        <p className="text-[10px] text-slate-400 mt-1 ml-6">
          켜두면 주관기관명이 아래 목록에 있는 과제는 다른 전담기관을 선택해도 이 전담기관으로 자동 교정됩니다
          (예: RDA1/RDA2처럼 같은 실제 기관을 전담기관 레코드 여러 개로 나눠 관리하는 경우).
        </p>
        {form.autoDetectByLeadInstitution && (
          <div className="mt-2">
            <StringListEditor
              label="소속기관 목록" addLabel="기관 추가" placeholder="예: 국립농업과학원"
              emptyText='등록된 기관명이 없습니다. "기관 추가"로 등록하세요.'
              values={form.affiliatedInstitutionNames ?? []}
              onChange={(names) => s("affiliatedInstitutionNames", names)}
            />
          </div>
        )}
      </div>
      <div>
        <StringListEditor
          label="기관별 특이사항" addLabel="특이사항 추가" placeholder="예: S등급은 산정기준액에서 완전 제외"
          emptyText='등록된 특이사항이 없습니다. "특이사항 추가"로 등록하세요.'
          values={form.specialNotes ?? []}
          onChange={(notes) => s("specialNotes", notes)}
        />
        <p className="text-[10px] text-slate-400 mt-1">
          &ldquo;수수료 산정 특성&rdquo; 카드의 특이사항에 그대로 표시됩니다 — 정책 값에서 자동으로 계산되지 않는 순수 참고용 메모입니다.
        </p>
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

const NOTICE_SCOPE_LABEL: Record<FundingAgency["noticeRecipientScope"], string> = {
  LEAD_ONLY: "주관기관만",
  LEAD_AND_PARTICIPANTS: "주관+참여기관 모두",
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
            <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">발송 대상</th>
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
                <StatusBadge
                  label={NOTICE_SCOPE_LABEL[agency.noticeRecipientScope]}
                  color={agency.noticeRecipientScope === "LEAD_AND_PARTICIPANTS" ? "amber" : "slate"}
                />
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

// ─── 수수료 기준 이력 삭제 확인 모달 ────────────────────────────
// 되돌릴 수 없는 데이터 삭제라서, 실수로 삭제 버튼을 눌러도 안전하도록 정해진 문구를 그대로
// 입력해야만 삭제 버튼이 활성화된다.
function PolicyDeleteConfirm({ policy, onConfirm, onClose }: { policy: FeePolicy; onConfirm: () => void; onClose: () => void }) {
  const [typed, setTyped] = useState("");
  const canConfirm = typed === DELETE_CONFIRM_TEXT;

  return (
    <div className="p-5 space-y-4">
      <p className="text-sm text-slate-700">
        <strong className="font-semibold">{policy.version} · {policy.name}</strong> 버전을 삭제하시겠습니까?
      </p>
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 space-y-1">
        <p className="font-medium">삭제하면 되돌릴 수 없습니다</p>
        <ul className="list-disc list-inside space-y-0.5">
          <li>이 버전의 기준표(등급별 요율 등) 이력이 완전히 사라집니다</li>
          {policy.status === "ACTIVE" && (
            <li>지금 적용 중인(ACTIVE) 버전입니다 — 삭제 즉시 남은 버전 중 다음으로 적용되는 기준으로 관련 과제의 연차별 수수료가 자동 재산정됩니다</li>
          )}
        </ul>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          삭제를 원하시는 경우 <strong className="font-semibold text-red-600">&quot;{DELETE_CONFIRM_TEXT}&quot;</strong>라고 입력해야 삭제할 수 있습니다.
        </label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={DELETE_CONFIRM_TEXT}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={onConfirm}
          disabled={!canConfirm}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          삭제
        </button>
      </div>
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
    const blockedReason = deleteFundingAgency(agency.id);
    if (blockedReason) { alert(blockedReason); return; }
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
  | { kind: "policy-delete"; target: FeePolicy }
  | { kind: "agency-manage" };

const DELETE_CONFIRM_TEXT = "수수료 기준 삭제";

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
  // 전담기관 하나가 사업유형(programType)별로 별도 정책을 동시에 ACTIVE로 둘 수 있다
  // (예: IITP는 "일반 R&D"와 "ICT 기금사업" 정책이 동시에 활성). find()로 하나만 고르면
  // 배열 순서상 먼저 나온 정책만 항상 표시되고 나머지는 화면에서 영영 보이지 않으므로,
  // ACTIVE 정책을 전부 모아 각각 카드로 보여준다.
  const activePolicy = agencyPolicies.find((p) => p.status === "ACTIVE");
  const activePolicies = agencyPolicies.filter((p) => p.status === "ACTIVE");
  const commonActivePolicy = feePolicies.find((p) => p.status === "ACTIVE" && p.agencyId === null);
  const summaryPolicies = activePolicies.length > 0 ? activePolicies : commonActivePolicy ? [commonActivePolicy] : [];

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
    <div className="space-y-4 pb-16">
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

      {/* 기관 수수료 산정 특성 요약 — 사업유형별로 동시에 ACTIVE인 정책이 여러 개면 각각 카드로 표시 */}
      {summaryPolicies.map((policy) => (
        <AgencyFeeModelSummary
          key={policy.id}
          agency={selectedAgency ?? undefined}
          policy={policy}
        />
      ))}

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
                <RuleTable rules={buildPolicyDisplayRules(commonActivePolicy)} standardRate={commonActivePolicy.standardRate} />
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {agencyPolicies.map((policy) => {
              const isActive = policy.status === "ACTIVE";
              const isExpanded = isActive || expandedIds.has(policy.id);

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
                      {canEdit && (
                        <button onClick={() => setModal({ kind: "policy-delete", target: policy })} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded transition-colors">
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 기준표 (펼쳐진 상태) */}
                  {isExpanded && (
                    <div className={`px-5 pb-4 ${isActive ? "" : "pt-1"}`}>
                      <RuleTable rules={buildPolicyDisplayRules(policy)} standardRate={policy.standardRate} />
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
      {modal?.kind === "policy-delete" && (
        <Modal title="수수료 기준 삭제" onClose={() => setModal(null)}>
          <PolicyDeleteConfirm
            policy={modal.target}
            onConfirm={() => { deleteFeePolicy(modal.target.id); setModal(null); }}
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
