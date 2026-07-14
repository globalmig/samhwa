import type { FeePolicy, FeeRateBracket, ExemptInstDetail, TermFeeCalc } from "./mock";

// ─── 등급 정규화 ─────────────────────────────────────────────────
// "최우수(S)", "최우수" → "S"   /   "우수(A/B/C)", "우수" → "A~C"   /   나머지 → "일반"
export function normalizeGrade(grade: string): string {
  if (!grade) return "일반";
  if (grade === "S" || grade.startsWith("최우수")) return "S";
  if (grade === "A~C" || grade.startsWith("우수")) return "A~C";
  return "일반";
}

// ─── 완전 제외 대상 판정 (EXCLUDE 모드 정책의 면제등급) ──────────
// IITP/RDA1/RDA2: 면제등급(S)은 연차상시도 수행하지 않으므로 산정기준액 자체에서 제외된다.
export function isExcludedMember(grade: string, policy: FeePolicy): boolean {
  return policy.exemptionMode === "EXCLUDE" && policy.exemptGrades.includes(normalizeGrade(grade));
}

// ─── 산정 기준액 (현금 또는 현금+현물) ────────────────────────────
export function getMemberAmount(m: { cashBudget: number; inKindBudget?: number }, feeBasis: FeePolicy["feeBasis"]): number {
  return feeBasis === "CASH_PLUS_INKIND" ? m.cashBudget + (m.inKindBudget ?? 0) : m.cashBudget;
}

// ─── 기본수수료 구간 조회 ────────────────────────────────────────
export function getBaseFee(cashBudget: number, brackets: FeeRateBracket[]): number {
  const sorted = [...brackets].sort((a, b) => a.minAmount - b.minAmount);
  let result = sorted[0]?.baseFee ?? 0;
  for (const b of sorted) {
    if (cashBudget >= b.minAmount) result = b.baseFee;
  }
  return result;
}

// ─── 가산금 계산 ─────────────────────────────────────────────────
export function getAddonFee(
  baseFee: number,
  coInstCount: number,
  method: "TIERED" | "FLAT",
): number {
  if (coInstCount === 0) return 0;
  if (method === "FLAT") {
    // KETEP: 기본수수료 × 10% × 공동기관수
    return Math.round(baseFee * 0.1 * coInstCount);
  }
  // TIERED: 첫 1개 10% + 추가 N개 5%씩 (KEIT)
  return Math.round(baseFee * 0.1 + baseFee * 0.05 * (coInstCount - 1));
}

// ─── 공동기관 수 산정 ────────────────────────────────────────────
// 기본: 공동(PARTICIPANT) 역할 기관 수.
// excludeLeadFromCalc(RDA2): 주관기관이 산정기준액에서 완전히 빠지므로, 남은 기관 중 1개를
// 가상의 주관기관으로 보정하여 -1 한다 (문서 예시: 공동기관 3개 중 면제기관 제외 후 2개 남으면 1개로 보정).
function getCoInstCount(list: CalcMember[], policy: FeePolicy): number {
  if (policy.excludeLeadFromCalc) return Math.max(0, list.length - 1);
  return list.filter((m) => m.role === "PARTICIPANT").length;
}

// ─── 입력 타입 ───────────────────────────────────────────────────
export interface CalcMember {
  institutionId: string;
  institutionName: string;
  role: "LEAD" | "PARTICIPANT";
  grade: string;              // 해당 연도 등급
  settlementType: "위탁정산" | "자체정산";
  cashBudget: number;
  inKindBudget?: number;
}

export interface CalcInput {
  members: CalcMember[];
  workType: "ANNUAL" | "SETTLEMENT";
  policy: FeePolicy;
  projectType: "GENERAL" | "AUTONOMY_TRACK";
  carriedOverUnclaimed: number; // 이전 연도 일반 미청구 누적액
}

// ─── 산정 결과 타입 ───────────────────────────────────────────────
export interface CalcResult {
  // 1. 표준수수료
  totalCashBudget: number;
  coInstCount: number;
  baseFee: number;
  addonFee: number;
  standardFee: number;

  // 2. 일반수수료 (면제기관 제외)
  nonExemptCashBudget: number;
  nonExemptCoInstCount: number;
  nonExemptBaseFee: number;
  nonExemptAddonFee: number;
  generalFee: number;

  // 3. 면제기관 수수료
  exemptFeeTotal: number;
  exemptBreakdown: ExemptInstDetail[];
  // exemptionMode "EXCLUDE" 정책에서 산정기준액 자체에서 완전히 제외된 기관 (연차상시 포함 수수료 없음)
  excludedInstitutionIds: string[];

  // calcMode "PER_INSTITUTION" 전용 — 참여기관별로 각자의 사업비를 구간표에 대입해 개별 산정한 내역 (IITP ICT기금사업)
  perInstitutionFees?: ExemptInstDetail[];

  // 4. 과제 산정수수료
  calculatedFee: number;

  // 5. 청구수수료
  generalCalcFee: number;
  generalBillingFee: number;
  generalUnclaimedFee: number;
  carriedOverUnclaimed: number;
  totalBillingFee: number;
}

// ─── 핵심 산정 함수 ───────────────────────────────────────────────
export function calcTermFee(input: CalcInput): CalcResult {
  const { members, workType, policy, projectType, carriedOverUnclaimed } = input;
  const { feeRateBrackets, coInstAddonMethod, exemptGrades, hasAutonomyTrack, annualBillingRate } = policy;
  const feeBasis = policy.feeBasis ?? "CASH";
  const billingRatio = annualBillingRate ?? 0.85;
  const minimumFee = policy.minimumFee ?? 0;
  const amountOf = (m: CalcMember) => getMemberAmount(m, feeBasis);

  // EXCLUDE 모드 면제등급(S)은 연차상시도 하지 않으므로 산정기준액에서 완전히 빠진다.
  // excludeLeadFromCalc(RDA2): 주관기관(농진청/소속기관)도 함께 완전히 제외된다.
  const excludedMembers = members.filter(
    (m) => isExcludedMember(m.grade, policy) || (policy.excludeLeadFromCalc === true && m.role === "LEAD"),
  );
  const excludedInstitutionIds = excludedMembers.map((m) => m.institutionId);
  const eligibleMembers = members.filter((m) => !excludedMembers.includes(m));

  // 산정 기준액(현금 또는 현금+현물)이 있는 기관만 대상
  const cashMembers = eligibleMembers.filter((m) => amountOf(m) > 0);
  const coInstMembers = cashMembers.filter((m) => m.role === "PARTICIPANT");

  // calcMode "PER_INSTITUTION" (IITP ICT기금사업): 공동기관 구분 없이 참여기관별로 각자의
  // 사업비를 구간표에 각각 대입해 개별 산정하며, 매년 청구비율(annualBillingRate)을 그대로 적용한다.
  if (policy.calcMode === "PER_INSTITUTION") {
    const perInstitutionFees: ExemptInstDetail[] = cashMembers.map((m) => {
      const amt = amountOf(m);
      const std = Math.max(getBaseFee(amt, feeRateBrackets), minimumFee);
      const bill = workType === "SETTLEMENT" ? std : Math.round(std * billingRatio);
      return {
        institutionId: m.institutionId,
        institutionName: m.institutionName,
        grade: m.grade,
        cashBudget: m.cashBudget,
        standardFee: std,
        calculatedFee: std,
        billingFee: bill,
        unclaimedFee: std - bill,
      };
    });
    const totalCashBudget = cashMembers.reduce((s, m) => s + amountOf(m), 0);
    const standardFee = perInstitutionFees.reduce((s, e) => s + e.standardFee, 0);
    const generalBillingFee = perInstitutionFees.reduce((s, e) => s + e.billingFee, 0);
    const generalUnclaimedFee = perInstitutionFees.reduce((s, e) => s + e.unclaimedFee, 0);
    return {
      totalCashBudget,
      coInstCount: Math.max(0, cashMembers.length - 1),
      baseFee: 0,
      addonFee: 0,
      standardFee,
      nonExemptCashBudget: totalCashBudget,
      nonExemptCoInstCount: 0,
      nonExemptBaseFee: 0,
      nonExemptAddonFee: 0,
      generalFee: standardFee,
      exemptFeeTotal: 0,
      exemptBreakdown: [],
      excludedInstitutionIds,
      calculatedFee: standardFee,
      generalCalcFee: standardFee,
      generalBillingFee,
      generalUnclaimedFee,
      carriedOverUnclaimed,
      totalBillingFee: generalBillingFee + carriedOverUnclaimed,
      perInstitutionFees,
    };
  }

  // 1. 표준수수료
  const totalCashBudget = cashMembers.reduce((s, m) => s + amountOf(m), 0);
  const coInstCount = getCoInstCount(cashMembers, policy);
  const baseFee = Math.max(getBaseFee(totalCashBudget, feeRateBrackets), minimumFee);
  const addonFee = getAddonFee(baseFee, coInstCount, coInstAddonMethod);
  const standardFee = baseFee + addonFee;

  // 자율성트랙 자체정산: 전 연도 billingRatio 균일, 정산 없음
  if (
    projectType === "AUTONOMY_TRACK" &&
    hasAutonomyTrack &&
    members.every((m) => m.settlementType === "자체정산")
  ) {
    const calculatedFee = Math.round(standardFee * billingRatio);
    return {
      totalCashBudget, coInstCount, baseFee, addonFee, standardFee,
      nonExemptCashBudget: totalCashBudget,
      nonExemptCoInstCount: coInstCount,
      nonExemptBaseFee: baseFee,
      nonExemptAddonFee: addonFee,
      generalFee: standardFee,
      exemptFeeTotal: 0,
      exemptBreakdown: [],
      excludedInstitutionIds,
      calculatedFee,
      generalCalcFee: calculatedFee,
      generalBillingFee: calculatedFee,
      generalUnclaimedFee: 0,
      carriedOverUnclaimed: 0,
      totalBillingFee: calculatedFee + carriedOverUnclaimed,
    };
  }

  // 2. 면제기관 분리 (DISCOUNT 모드 정책에서만 — 공동기관 중 exemptGrades에 속하고 자체정산 선택한 기관)
  // EXCLUDE 모드 정책은 면제등급이 이미 cashMembers 이전 단계에서 완전히 빠졌으므로 여기서는 항상 빈 배열이 된다.
  const exemptMembers = policy.exemptionMode === "DISCOUNT"
    ? coInstMembers.filter(
        (m) => exemptGrades.includes(normalizeGrade(m.grade)) && m.settlementType === "자체정산",
      )
    : [];
  const nonExemptMembers = cashMembers.filter((m) => !exemptMembers.includes(m));

  const nonExemptCashBudget = nonExemptMembers.reduce((s, m) => s + amountOf(m), 0);
  const nonExemptCoInstCount = getCoInstCount(nonExemptMembers, policy);
  const nonExemptBaseFee = Math.max(getBaseFee(nonExemptCashBudget, feeRateBrackets), minimumFee);
  const nonExemptAddonFee = getAddonFee(nonExemptBaseFee, nonExemptCoInstCount, coInstAddonMethod);
  const generalFee = nonExemptBaseFee + nonExemptAddonFee;

  // 3. 면제기관 수수료 (비례 배분)
  const exemptFeeTotal = standardFee - generalFee;
  const totalExemptCash = exemptMembers.reduce((s, m) => s + amountOf(m), 0);
  const exemptBreakdown: ExemptInstDetail[] = exemptMembers.map((m) => {
    const stdFee = totalExemptCash > 0
      ? Math.round(exemptFeeTotal * (amountOf(m) / totalExemptCash))
      : 0;
    const calcFee = Math.round(stdFee * 0.85);

    // 정산 연차 요율 분기
    // - 자체정산: 정산 연차에도 85% (면제 유지, 기관이 자체 정산)
    // - 위탁정산: 정산 연차에 100% (회계법인이 정산, 일반기관과 동일)
    const isSettlement = workType === "SETTLEMENT";
    const effectiveBillingRatio =
      isSettlement && m.settlementType === "위탁정산" ? 1.0 : billingRatio;

    const billFee = Math.round(calcFee * effectiveBillingRatio);
    return {
      institutionId: m.institutionId,
      institutionName: m.institutionName,
      grade: m.grade,
      cashBudget: m.cashBudget,
      standardFee: stdFee,
      calculatedFee: calcFee,
      billingFee: billFee,
      unclaimedFee: Math.round(calcFee * (1 - effectiveBillingRatio)),
    };
  });

  // 4. 과제 산정수수료
  const calculatedFee = Math.round(generalFee + exemptFeeTotal * 0.85);

  // 5. 청구수수료
  const generalCalcFee = generalFee;
  let generalBillingFee: number;
  let generalUnclaimedFee: number;

  if (workType === "ANNUAL") {
    generalBillingFee = Math.round(generalCalcFee * billingRatio);
    generalUnclaimedFee = generalCalcFee - generalBillingFee;
  } else {
    // 정산: 일반 100% + 과거 미청구 일반분 합산
    generalBillingFee = generalCalcFee;
    generalUnclaimedFee = 0;
  }

  const exemptTotalBilling = exemptBreakdown.reduce((s, e) => s + e.billingFee, 0);
  const totalBillingFee =
    workType === "ANNUAL"
      ? Math.round(calculatedFee * billingRatio) + carriedOverUnclaimed
      : generalBillingFee + exemptTotalBilling + carriedOverUnclaimed;

  return {
    totalCashBudget,
    coInstCount,
    baseFee,
    addonFee,
    standardFee,
    nonExemptCashBudget,
    nonExemptCoInstCount,
    nonExemptBaseFee,
    nonExemptAddonFee,
    generalFee,
    exemptFeeTotal,
    exemptBreakdown,
    excludedInstitutionIds,
    calculatedFee,
    generalCalcFee,
    generalBillingFee,
    generalUnclaimedFee,
    carriedOverUnclaimed,
    totalBillingFee,
  };
}

// ─── TermFeeCalc → CalcResult 변환 (오버라이드 반영) ────────────
export function applyOverrides(calc: TermFeeCalc): TermFeeCalc {
  let result = { ...calc };
  for (const ov of calc.overrides) {
    (result as Record<string, unknown>)[ov.field] = ov.adjustedValue;
  }
  return result;
}

// ─── 과제에 적용할 정책 조회 헬퍼 ───────────────────────────────
// programType: 동일 전담기관이 사업 유형별로 별도 정책을 둘 수 있음 (예: IITP 일반 R&D vs ICT기금사업).
// 정책의 programType이 지정되지 않은 경우 "GENERAL"로 취급한다.
export function resolvePolicy(
  agencyId: string,
  policies: FeePolicy[],
  programType: "GENERAL" | "ICT_FUND" = "GENERAL",
): FeePolicy | undefined {
  const matchesType = (p: FeePolicy) => (p.programType ?? "GENERAL") === programType;
  // 1. 전담기관 자체 정책 (ACTIVE)
  const agencyPolicy = policies.find(
    (p) => p.agencyId === agencyId && p.status === "ACTIVE" && matchesType(p),
  );
  if (agencyPolicy) return agencyPolicy;
  // 2. 공통 정책 (ACTIVE)
  return policies.find((p) => p.agencyId === null && p.status === "ACTIVE" && matchesType(p));
}
