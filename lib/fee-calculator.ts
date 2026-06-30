import type { FeePolicy, FeeRateBracket, ExemptInstDetail, TermFeeCalc } from "./mock";

// ─── 등급 정규화 ─────────────────────────────────────────────────
// "최우수(S)", "최우수" → "S"   /   "우수(A/B/C)", "우수" → "A~C"   /   나머지 → "일반"
export function normalizeGrade(grade: string): string {
  if (!grade) return "일반";
  if (grade === "S" || grade.startsWith("최우수")) return "S";
  if (grade === "A~C" || grade.startsWith("우수")) return "A~C";
  return "일반";
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
  const billingRatio = annualBillingRate ?? 0.85;

  // 현금사업비 있는 기관만 대상
  const cashMembers = members.filter((m) => m.cashBudget > 0);
  const coInstMembers = cashMembers.filter((m) => m.role === "PARTICIPANT");

  // 1. 표준수수료
  const totalCashBudget = cashMembers.reduce((s, m) => s + m.cashBudget, 0);
  const coInstCount = coInstMembers.length;
  const baseFee = getBaseFee(totalCashBudget, feeRateBrackets);
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
      calculatedFee,
      generalCalcFee: calculatedFee,
      generalBillingFee: calculatedFee,
      generalUnclaimedFee: 0,
      carriedOverUnclaimed: 0,
      totalBillingFee: calculatedFee + carriedOverUnclaimed,
    };
  }

  // 2. 면제기관 분리 (공동기관 중 exemptGrades에 속하고 자체정산 선택한 기관)
  const exemptMembers = coInstMembers.filter(
    (m) => exemptGrades.includes(normalizeGrade(m.grade)) && m.settlementType === "자체정산",
  );
  const nonExemptMembers = cashMembers.filter((m) => !exemptMembers.includes(m));

  const nonExemptCashBudget = nonExemptMembers.reduce((s, m) => s + m.cashBudget, 0);
  const nonExemptCoInstCount = nonExemptMembers.filter((m) => m.role === "PARTICIPANT").length;
  const nonExemptBaseFee = getBaseFee(nonExemptCashBudget, feeRateBrackets);
  const nonExemptAddonFee = getAddonFee(nonExemptBaseFee, nonExemptCoInstCount, coInstAddonMethod);
  const generalFee = nonExemptBaseFee + nonExemptAddonFee;

  // 3. 면제기관 수수료 (비례 배분)
  const exemptFeeTotal = standardFee - generalFee;
  const totalExemptCash = exemptMembers.reduce((s, m) => s + m.cashBudget, 0);
  const exemptBreakdown: ExemptInstDetail[] = exemptMembers.map((m) => {
    const stdFee = totalExemptCash > 0
      ? Math.round(exemptFeeTotal * (m.cashBudget / totalExemptCash))
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
export function resolvePolicy(
  agencyId: string,
  policies: FeePolicy[],
): FeePolicy | undefined {
  // 1. 전담기관 자체 정책 (ACTIVE)
  const agencyPolicy = policies.find(
    (p) => p.agencyId === agencyId && p.status === "ACTIVE",
  );
  if (agencyPolicy) return agencyPolicy;
  // 2. 공통 정책 (ACTIVE)
  return policies.find((p) => p.agencyId === null && p.status === "ACTIVE");
}
