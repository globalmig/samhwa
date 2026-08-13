import type { FeePolicy, FeeRateBracket, ExemptInstDetail, TermFeeCalc, PolicyRule, Project, ProjectMember, TermFee, FundingAgency } from "./mock";
import { fmtWonFull } from "./utils";

// ─── 등급 정규화 ─────────────────────────────────────────────────
// "최우수(S)", "최우수" → "S"   /   "우수(A)" → "A"   /   "우수(B)" → "B"   /   "우수(C)" → "C"   /   나머지 → "일반"
export function normalizeGrade(grade: string): string {
  if (!grade) return "일반";
  if (grade === "S" || grade.startsWith("최우수")) return "S";
  if (grade === "A" || grade.startsWith("우수(A)")) return "A";
  if (grade === "B" || grade.startsWith("우수(B)")) return "B";
  if (grade === "C" || grade.startsWith("우수(C)")) return "C";
  return "일반";
}

// ─── 연차별 등급 조회 ────────────────────────────────────────────
// 등급평가(정산면제리스트)는 연차마다 갱신될 수 있어, 특정 연차부터 등급이 바뀐 경우
// gradeOverrides에 그 연차 이후분만 따로 기록한다. 오버라이드가 없는 연차는 institutionGrade(기본값)를 쓴다.
export function resolveMemberGradeForTerm(member: Pick<ProjectMember, "institutionGrade" | "gradeOverrides">, termNumber: number): string {
  const override = member.gradeOverrides?.find((g) => g.termNumber === termNumber);
  return override?.grade ?? member.institutionGrade ?? "일반";
}

// ─── 연차별 정산구분 조회 ───────────────────────────────────────────
// 참여기관의 위탁/자체 정산 여부가 계약 변경 등으로 연차 중간에 바뀔 수 있어, 특정 연차부터 달라진
// 경우 settlementTypeOverrides에 그 연차 이후분만 따로 기록한다. 오버라이드가 없는 연차는
// settlementType(기본값), 그것도 없으면 정책의 defaultSettlementType을 쓴다.
export function resolveMemberSettlementTypeForTerm(
  member: Pick<ProjectMember, "settlementType" | "settlementTypeOverrides">,
  termNumber: number,
  defaultSettlementType: "위탁정산" | "자체정산" = "자체정산",
): "위탁정산" | "자체정산" {
  const override = member.settlementTypeOverrides?.find((g) => g.termNumber === termNumber);
  return override?.settlementType ?? member.settlementType ?? defaultSettlementType;
}

// ─── 연차별 공문 수신자 조회 ─────────────────────────────────────────
// 공문을 받는 담당자가 연차 중간에 바뀌는 경우가 많아, 특정 연차만 다른 경우 recipientOverrides에
// 그 연차분만 따로 기록한다. 오버라이드가 없는 연차는 contactName/Email/Phone(기본값)을 쓴다.
export function resolveMemberRecipientForTerm(
  member: Pick<ProjectMember, "contactName" | "contactEmail" | "contactPhone" | "recipientOverrides">,
  termNumber: number,
): { recipientName: string; recipientEmail: string; recipientPhone: string } {
  const override = member.recipientOverrides?.find((r) => r.termNumber === termNumber);
  return {
    recipientName: override?.recipientName ?? member.contactName ?? "",
    recipientEmail: override?.recipientEmail ?? member.contactEmail ?? "",
    recipientPhone: override?.recipientPhone ?? member.contactPhone ?? "",
  };
}

// ─── 정산(SETTLEMENT) 연차 판정 ───────────────────────────────────
// 일괄협약: 총연차의 마지막 연차만 정산. 단계협약: 각 단계의 마지막 연차가 정산.
// autoGenerateTermFees(store.ts)와 과제 상세 화면(연차별 수수료 현황·참여기관 목록)이
// 동일한 기준으로 판정해야 화면마다 다른 workType이 표시되는 일이 없다.
export function isSettlementTerm(project: Pick<Project, "agreementType" | "stages" | "totalTerms">, termNumber: number): boolean {
  const isBatch = !project.agreementType || project.agreementType === "BATCH";
  if (isBatch) return termNumber === project.totalTerms;
  const stages = project.stages ?? [];
  const stage = stages.find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
  return stage ? termNumber === stage.endTermNumber : termNumber === project.totalTerms;
}

// ─── 단계-연차 날짜 불일치 판정 ───────────────────────────────────
// 담당자가 특정 연차에 실제 날짜(TermFee.termStartDate/termEndDate)를 직접 지정해뒀는데, 그 뒤 단계
// 날짜가 바뀌면서(계약변경 등) 그 연차가 더 이상 자기 단계의 기간 안에 들지 않게 된 경우를 찾는다.
// 목록·상세 화면에서 "단계-연차 날짜 불일치" 경고 배지를 띄우는 데 쓴다.
export function hasStageTermDateMismatch(project: Pick<Project, "stages">, termFees: { termNumber: number; termStartDate?: string; termEndDate?: string }[]): boolean {
  const stages = project.stages ?? [];
  if (stages.length === 0) return false;
  return termFees.some((tf) => {
    if (!tf.termStartDate || !tf.termEndDate) return false;
    const stage = stages.find((s) => tf.termNumber >= s.startTermNumber && tf.termNumber <= s.endTermNumber);
    if (!stage?.stageStartDate || !stage.stageEndDate) return false;
    return tf.termStartDate < stage.stageStartDate || tf.termEndDate > stage.stageEndDate;
  });
}

// ─── 정산절차 안내 공문 "■ 수수료" 섹션용 — 해당 과제·해당 연차 요약 ──────────────
// 정산절차 안내 공문은 항상 "지금 진행 중인 연차"를 대상으로 발송되므로, 그 연차의
// 산정액·당해 청구액·미청구액을 공문 미리보기/발송 시 자동으로 채워 넣는 데 쓴다.
// 과제 상세 화면의 연차별 수수료 카드와 계산 기준(FEE_STATUS·otherFirmHandled 처리 포함)을
// 그대로 맞춰야 화면마다 다른 숫자가 나오지 않는다 — 로직을 각 발송 화면에 따로 두지 않고 여기 하나로 모은다.
const FEE_STATUS_LABEL: Record<TermFee["status"], string> = {
  BILLED: "청구완료",
  CONFIRMED: "확정",
  DRAFT: "초안",
  SCHEDULED: "연차 미시작",
};

export function buildNoticeFeeRows(project: Pick<Project, "agreementType" | "stages" | "totalTerms">, projectTermFees: TermFee[], termNumber: number): { label: string; value: string }[] {
  const fees = projectTermFees.filter((f) => f.termNumber === termNumber);
  if (fees.length === 0) return [];

  const termYear = fees[0].termYear;
  const isSettlement = isSettlementTerm(project, termNumber);
  const otherFirmHandled = fees[0]?.otherFirmHandled ?? false;
  const termStatus: TermFee["status"] = fees.some((f) => f.status === "DRAFT") ? "DRAFT" : fees.every((f) => f.status === "BILLED") ? "BILLED" : "CONFIRMED";
  const totalCalculated = fees.reduce((s, f) => s + f.calculatedFee, 0);
  const totalApplied = fees.reduce((s, f) => s + f.appliedFee, 0);
  const termUnclaimed = fees.reduce((s, f) => s + (f.unclaimedFee ?? 0), 0);

  const rows: { label: string; value: string }[] = [
    { label: "대상 연차", value: `${termYear}년 ${termNumber}연차 (${isSettlement ? "정산" : "연차상시"})` },
    { label: "진행 상태", value: FEE_STATUS_LABEL[termStatus] },
  ];

  // 타회계법인이 진행한 연차는 85% 몫(당해 청구액) 금액을 외부로 보내는 공문에 노출하지 않는다 —
  // 과제 상세 화면에서 화면에 뿌릴 때 이미 지키는 규칙과 동일하게 맞춘다.
  if (otherFirmHandled) {
    rows.push({ label: "당해 청구액", value: "타회계법인 진행 — 금액 비공개" });
    if (!isSettlement && termUnclaimed > 0) {
      rows.push({ label: "당해 미청구액(15%)", value: fmtWonFull(termUnclaimed) });
    }
  } else {
    rows.push({ label: "산정액", value: fmtWonFull(totalCalculated) });
    rows.push({ label: "당해 청구액", value: fmtWonFull(totalApplied) });
    if (!isSettlement && termUnclaimed > 0) {
      rows.push({ label: "당해 미청구액", value: fmtWonFull(termUnclaimed) });
    }
  }

  return rows;
}

// ─── 정책 파라미터로부터 "등급별 산출 비율" 참고표 생성 ────────────
// exemptGrades/exemptionMode/hasAutonomyTrack/annualBillingRate가 정책의 유일한 진실 소스이며,
// 이 표는 그 값들로부터 매번 다시 계산한다 — 손으로 별도 관리하는 rules 데이터를 두면
// 정책 파라미터가 바뀌거나 새 전담기관이 추가될 때 표가 조용히 어긋날 수 있기 때문.
export function buildPolicyDisplayRules(policy: Pick<FeePolicy, "exemptGrades" | "exemptionMode" | "hasAutonomyTrack" | "annualBillingRate" | "exemptCustomRate">): PolicyRule[] {
  const annualPct = Math.round(policy.annualBillingRate * 100);
  // CUSTOM 모드는 면제등급 기관에만 exemptCustomRate(없으면 annualBillingRate)를 적용한다 —
  // 일반 기관의 연차상시청구비율(annualPct)과 다른 값일 수 있다.
  const exemptPct = policy.exemptionMode === "CUSTOM" ? Math.round((policy.exemptCustomRate ?? policy.annualBillingRate) * 100) : annualPct;
  const gradeName: Record<"S" | "A" | "B" | "C", string> = { S: "최우수", A: "우수(A)", B: "우수(B)", C: "우수(C)" };
  const rows: PolicyRule[] = [{ subject: "기관", grade: "일반", gradeName: "일반", settlementType: "위탁정산", annualRate: annualPct, settlementRate: 100 }];

  (["S", "A", "B", "C"] as const).forEach((grade) => {
    if (!policy.exemptGrades.includes(grade)) {
      rows.push({ subject: "기관", grade, gradeName: gradeName[grade], settlementType: "위탁정산", annualRate: annualPct, settlementRate: 100 });
      return;
    }
    if (policy.exemptionMode === "EXCLUDE") {
      rows.push({ subject: "기관", grade, gradeName: gradeName[grade], settlementType: "제외대상", annualRate: 0, settlementRate: 0 });
      return;
    }
    rows.push({ subject: "기관", grade, gradeName: gradeName[grade], settlementType: "자체정산", annualRate: exemptPct, settlementRate: exemptPct });
    rows.push({ subject: "기관", grade, gradeName: gradeName[grade], settlementType: "위탁정산", annualRate: exemptPct, settlementRate: 100 });
  });

  if (policy.hasAutonomyTrack) {
    rows.push({ subject: "과제", grade: "자율성트랙", gradeName: "자율성트랙", settlementType: "자체정산", annualRate: annualPct, settlementRate: annualPct });
    rows.push({ subject: "과제", grade: "자율성트랙", gradeName: "자율성트랙", settlementType: "위탁정산", annualRate: annualPct, settlementRate: 100 });
  }

  return rows;
}

// ─── 전담기관 소속기관 자동판별 ──────────────────────────────────
// 전담기관마다 "소속기관 자동판별"을 켜두고 목록을 등록해둘 수 있다(수수료 기준 관리 화면에서 편집).
// 예: RDA1/RDA2(둘 다 표시명은 "농촌진흥청")처럼 같은 실제 기관을 정책상 두 레코드로 나눠 관리하는
// 경우, 담당자가 뭘 고르든 주관기관명이 어느 전담기관의 소속기관 목록에 있으면 그 전담기관으로
// 자동 교정한다 — 사람이 고르면 실수하기 쉬운 경우를 방지한다. 두 곳 이상의 목록에 동시에
// 매칭되면 배열에 먼저 나오는 전담기관을 우선한다.
export function resolveAutoDetectedAgencyId(
  selectedAgencyId: string,
  leadInstitutionName: string,
  agencies: readonly Pick<FundingAgency, "id" | "autoDetectByLeadInstitution" | "affiliatedInstitutionNames">[],
): string {
  const matched = agencies.find(
    (a) => a.autoDetectByLeadInstitution && a.affiliatedInstitutionNames?.includes(leadInstitutionName)
  );
  return matched ? matched.id : selectedAgencyId;
}

// ─── 완전 제외 대상 판정 (EXCLUDE 모드 정책의 면제등급) ──────────
// IITP/RDA1/RDA2: 면제등급(S)은 연차상시도 수행하지 않으므로 산정기준액 자체에서 제외된다.
// 영리/비영리 구분 없이 평가 등급만으로 면제 여부가 결정된다.
export function isExcludedMember(grade: string, policy: FeePolicy): boolean {
  return policy.exemptionMode === "EXCLUDE" && policy.exemptGrades.includes(normalizeGrade(grade));
}

// ─── 산정 기준액 (현금 또는 현금+현물) ────────────────────────────
export function getMemberAmount(m: { cashBudget: number; inKindBudget?: number }, feeBasis: FeePolicy["feeBasis"]): number {
  return feeBasis === "CASH_PLUS_INKIND" ? m.cashBudget + (m.inKindBudget ?? 0) : m.cashBudget;
}

// ─── 정수 원단위 배분 (최대잉여법 / largest remainder method) ────
// total(정수 원)을 weights 비율대로 여러 기관에 나눌 때, 기관별로 각자 반올림하면(Math.round)
// 그 합이 total과 1~2원 어긋날 수 있다 — 이 함수로 배분하면 결과 배열의 합이 항상 total과
// 정확히 일치한다. 우선 내림(Math.floor)한 값을 기본으로 주고, 남는 원(remainder)을 소수부가
// 큰 기관부터 순서대로 1원씩 얹어준다.
export function allocateExact(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((s, w) => s + w, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map((r) => Math.floor(r));
  const remainder = total - floors.reduce((s, f) => s + f, 0);
  const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac);
  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k % order.length].i] += 1;
  }
  return result;
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
// TIERED/FLAT도 결국 "1번째 가산율/추가 1개당 가산율" 쌍의 특수 케이스다 —
// FLAT은 두 비율이 같은 경우(0.1/0.1)와 수학적으로 동일하다. CUSTOM은 정책에서 이 두 비율을 직접 받는다.
export function getAddonFee(baseFee: number, coInstCount: number, method: "TIERED" | "FLAT" | "CUSTOM", customRates?: { first: number; additional: number }): number {
  if (coInstCount === 0) return 0;
  const { first, additional } =
    method === "CUSTOM" && customRates
      ? customRates
      : method === "FLAT"
        ? { first: 0.1, additional: 0.1 } // KETEP: 기본수수료 × 10% × 공동기관수
        : { first: 0.1, additional: 0.05 }; // TIERED: 첫 1개 10% + 추가 N개 5%씩 (KEIT)
  return Math.round(baseFee * first + baseFee * additional * (coInstCount - 1));
}

// ─── 공동기관 수 산정 ────────────────────────────────────────────
// 기본: 주관을 제외한 모든 기관(PARTICIPANT+ENTRUSTED, 즉 공동+위탁) 수.
// excludeLeadFromCalc(RDA2): 주관기관이 산정기준액에서 완전히 빠지므로, 남은 기관 중 1개를
// 가상의 주관기관으로 보정하여 -1 한다 (문서 예시: 공동기관 3개 중 면제기관 제외 후 2개 남으면 1개로 보정).
function getCoInstCount(list: CalcMember[], policy: FeePolicy): number {
  if (policy.excludeLeadFromCalc) return Math.max(0, list.length - 1);
  return list.filter((m) => m.role !== "LEAD").length;
}

// ─── 입력 타입 ───────────────────────────────────────────────────
export interface CalcMember {
  institutionId: string;
  institutionName: string;
  role: "LEAD" | "PARTICIPANT" | "ENTRUSTED";
  grade: string; // 해당 연도 등급
  institutionType: string;
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
  // 자율성트랙 과제 전체에 적용되는 정산구분 — 참여기관 개별 "정산구분"(CalcMember.settlementType)과는
  // 별개의 프로젝트 단위 설정이다. 자율성트랙과 일반과제는 수수료 계산 방식 자체가 다르기 때문에,
  // 참여기관별로 다르게 지정될 수 있는 값을 그대로 재사용하면 안 된다. projectType이 AUTONOMY_TRACK일
  // 때만 의미가 있으며, 미지정 시 "자체정산"으로 취급한다.
  autonomySettlementType?: "위탁정산" | "자체정산";
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
  // 일반기관(면제등급 아님) 기관별 배분 — 정산구분(위탁/자체)이나 연차 종류와 무관하게 항상
  // billingRatio로 청구되며, 나머지는 unclaimedFee로 남는다. cashBudget 필드는 안 쓰지만
  // (면제기관과 구조를 맞추기 위해) ExemptInstDetail을 그대로 재사용한다.
  generalBreakdown: ExemptInstDetail[];
  carriedOverUnclaimed: number;
  totalBillingFee: number;

  // 이 정책에 적용된 연차상시 청구비율 — 기관별 이월액을 정확히 배분하려면 store.ts에서도
  // 이 값이 필요한데, policy.annualBillingRate의 기본값(0.85) 처리를 여기서만 하고 있어
  // 재계산 대신 결과에 실어 보낸다.
  billingRatio: number;
}

// ─── 핵심 산정 함수 ───────────────────────────────────────────────
export function calcTermFee(input: CalcInput): CalcResult {
  const { members, workType, policy, projectType, carriedOverUnclaimed, autonomySettlementType } = input;
  const { feeRateBrackets, coInstAddonMethod, exemptGrades, hasAutonomyTrack, annualBillingRate } = policy;
  const feeBasis = policy.feeBasis ?? "CASH";
  const billingRatio = annualBillingRate ?? 0.85;
  const minimumFee = policy.minimumFee ?? 0;
  const customAddonRates = coInstAddonMethod === "CUSTOM" ? { first: policy.coInstFirstRate ?? 0.1, additional: policy.coInstAdditionalRate ?? 0.05 } : undefined;
  const amountOf = (m: CalcMember) => getMemberAmount(m, feeBasis);

  // EXCLUDE 모드 면제등급(S)은 연차상시도 하지 않으므로 산정기준액에서 완전히 빠진다.
  // excludeLeadFromCalc(RDA2): 주관기관(농진청/소속기관)도 함께 완전히 제외된다.
  const excludedMembers = members.filter((m) => isExcludedMember(m.grade, policy) || (policy.excludeLeadFromCalc === true && m.role === "LEAD"));
  const excludedInstitutionIds = excludedMembers.map((m) => m.institutionId);
  const eligibleMembers = members.filter((m) => !excludedMembers.includes(m));

  // 산정 기준액(현금 또는 현금+현물)이 있는 기관만 대상
  const cashMembers = eligibleMembers.filter((m) => amountOf(m) > 0);

  // calcMode "PER_INSTITUTION" (IITP ICT기금사업): 공동기관 구분 없이 참여기관별로 각자의
  // 사업비를 구간표에 각각 대입해 개별 산정하며, 매년 청구비율(annualBillingRate)을 그대로 적용한다.
  if (policy.calcMode === "PER_INSTITUTION") {
    // 청구액(85%)은 기관별로 각자 반올림하면(Math.round(std*ratio)) 합계가 "연차 수수료 100%
    // 금액의 85%"(Math.round(totalStd*ratio))와 1~2원 어긋날 수 있다 — 연차 총액을 먼저 한 번만
    // 반올림한 뒤, 그 총액을 기관별 표준수수료 비중대로 allocateExact(최대잉여법)로 정확히
    // 배분해야 기관별 합계가 항상 연차 총 청구액과 정확히 일치한다.
    const stdFees = cashMembers.map((m) => Math.max(getBaseFee(amountOf(m), feeRateBrackets), minimumFee));
    const totalStd = stdFees.reduce((s, v) => s + v, 0);
    const totalBill = workType === "SETTLEMENT" ? totalStd : Math.round(totalStd * billingRatio);
    const billShares = allocateExact(totalBill, stdFees);
    const perInstitutionFees: ExemptInstDetail[] = cashMembers.map((m, idx) => {
      const std = stdFees[idx];
      const bill = billShares[idx];
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
      generalBreakdown: [],
      carriedOverUnclaimed,
      totalBillingFee: generalBillingFee + carriedOverUnclaimed,
      billingRatio,
      perInstitutionFees,
    };
  }

  // 1. 표준수수료
  const totalCashBudget = cashMembers.reduce((s, m) => s + amountOf(m), 0);
  const coInstCount = getCoInstCount(cashMembers, policy);
  const baseFee = Math.max(getBaseFee(totalCashBudget, feeRateBrackets), minimumFee);
  const addonFee = getAddonFee(baseFee, coInstCount, coInstAddonMethod, customAddonRates);
  const standardFee = baseFee + addonFee;

  // 자율성트랙 + 자체정산(기본값): 전 연도 billingRatio 균일 적용(정산 없음, 면제기관 미고려) —
  // 참여기관 개별 "정산구분"과는 무관하게 프로젝트 전체에 적용된다.
  // 자율성트랙 + 위탁정산: 일반과제와 완전히 동일한 계산 방식(면제기관 분리·정산연차 100%청구 등)을
  // 그대로 적용하므로, 여기서 return하지 않고 아래 일반과제 로직으로 흘려보낸다(fall through).
  if (projectType === "AUTONOMY_TRACK" && hasAutonomyTrack && (autonomySettlementType ?? "자체정산") === "자체정산") {
    const calculatedFee = Math.round(standardFee * billingRatio);
    return {
      totalCashBudget,
      coInstCount,
      baseFee,
      addonFee,
      standardFee,
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
      generalBreakdown: [],
      carriedOverUnclaimed: 0,
      totalBillingFee: calculatedFee + carriedOverUnclaimed,
      billingRatio,
    };
  }

  // 2. 면제기관 분리 (DISCOUNT 모드 정책에서만 — exemptGrades에 속하는 비영리기관)
  // EXCLUDE 모드 정책은 면제등급이 이미 cashMembers 이전 단계에서 완전히 빠졌으므로 여기서는 항상 빈 배열이 된다.
  // 정산면제는 과기정통부 연구비지원체계 평가를 받는 비영리기관에만 적용되므로, 영리기업은 등급이
  // 면제등급이어도 일반기관과 동일하게 계산한다.
  // 주관기관도 다른 기관과 동일하게 "자기 등급"대로 면제/비면제가 갈린다 — 가산금(공동기관수)
  // 계산에서만 주관기관을 제외하고(coInstMembers), 면제등급 분류는 cashMembers(주관기관 포함) 기준.
  // CUSTOM 모드는 DISCOUNT와 동일하게 면제등급도 산정기준액에 포함시키되, 청구비율만 아래에서
  // exemptBillingRatio로 따로 적용한다(일반 기관의 billingRatio와 분리).
  //
  // 면제/일반 분류는 연차상시·정산 구분 없이 항상 등급 기준만으로 정해진다(정산구분은 분류에
  // 영향을 주지 않는다 — professional_agency_fee_calculation_flow.md의 "면제기관 정의"도 등급만으로
  // 규정). 위탁정산/자체정산 차이는 아래 exemptRatios·generalRatioGroups에서 "정산 연차의 청구비율
  // (100% vs exemptBillingRatio)"에만 반영되며, 표준수수료 구간·배분 계산 자체는 건드리지 않는다.
  const exemptMembers = policy.exemptionMode === "DISCOUNT" || policy.exemptionMode === "CUSTOM"
    ? cashMembers.filter((m) => exemptGrades.includes(normalizeGrade(m.grade)))
    : [];
  const nonExemptMembers = cashMembers.filter((m) => !exemptMembers.includes(m));

  const nonExemptCashBudget = nonExemptMembers.reduce((s, m) => s + amountOf(m), 0);
  const nonExemptCoInstCount = getCoInstCount(nonExemptMembers, policy);
  const nonExemptBaseFee = Math.max(getBaseFee(nonExemptCashBudget, feeRateBrackets), minimumFee);
  const nonExemptAddonFee = getAddonFee(nonExemptBaseFee, nonExemptCoInstCount, coInstAddonMethod, customAddonRates);
  const generalFee = nonExemptBaseFee + nonExemptAddonFee;

  // 3. 면제기관 수수료 (비례 배분) — 기관별로 각자 반올림하면 그 합이 exemptFeeTotal과 1~2원
  // 어긋날 수 있어 allocateExact(최대잉여법)로 배분해 합계가 항상 정확히 일치하게 한다.
  // 청구액은 정산구분(자체정산/위탁정산 100%)에 따라 요율이 갈릴 수 있으므로, 같은 요율을
  // 쓰는 기관끼리 묶어(그룹) 그룹 안에서 다시 정확히 배분한다.
  const exemptFeeTotal = standardFee - generalFee;
  const exemptStdShares = allocateExact(
    exemptFeeTotal,
    exemptMembers.map((m) => amountOf(m)),
  );

  // CUSTOM 모드에서만 면제기관 전용 청구비율(exemptCustomRate)을 쓰고, 그 외(DISCOUNT)는 일반
  // 기관과 동일한 billingRatio를 그대로 쓴다 — exemptCustomRate 미지정 시엔 billingRatio로 대체한다.
  const exemptBillingRatio = policy.exemptionMode === "CUSTOM" ? (policy.exemptCustomRate ?? billingRatio) : billingRatio;

  // 5. 청구수수료 (일반기관) — 표준수수료는 기관별로 미리 배분해둔다(allocateExact).
  const generalCalcFee = generalFee;
  const generalCalcShares = allocateExact(
    generalCalcFee,
    nonExemptMembers.map((m) => amountOf(m)),
  );

  // 정산 연차엔 등급과 무관하게 이 기관의 정산구분만으로 청구비율이 갈린다 — 위탁정산은 이번
  // 연차 산정액을 100% 청구하고(이월 미청구액은 store.ts에서 기관별로 따로 더해 걷는다), 자체정산은
  // 해당 청구비율만 청구한다. 연차상시는 정산구분과 무관하게 전원 해당 청구비율.
  //
  // 같은 요율을 쓰는 기관끼리 묶어 그룹 총액을 반올림한 뒤 그룹 안에서 정확히 배분해야(allocateExact)
  // 반올림 후에도 합계가 정확히 맞는다 — 이때 "면제기관 그룹"과 "일반기관 그룹"을 따로따로 반올림하면
  // 안 된다. 두 그룹이 같은 요율을 쓰는 경우(예: DISCOUNT 모드 연차상시는 면제·일반 모두 billingRatio)
  // 각 그룹 소계가 우연히 정확히 .5원에 걸리면 둘 다 위로 반올림되면서, 전체를 한 번에 반올림했을 때보다
  // 총액이 1원 더 많아지는 문제가 있었다. 그래서 면제/일반 구분과 무관하게 "실제 요율 값"이 같은
  // 기관은 전부 하나의 그룹으로 묶어 딱 한 번만 반올림한다.
  const isSettlement = workType === "SETTLEMENT";
  type RatioEntry = { pool: "exempt" | "general"; idx: number; calc: number };
  const ratioGroups = new Map<number, RatioEntry[]>();
  const pushEntry = (ratio: number, entry: RatioEntry) => {
    if (!ratioGroups.has(ratio)) ratioGroups.set(ratio, []);
    ratioGroups.get(ratio)!.push(entry);
  };
  exemptMembers.forEach((m, idx) => {
    const ratio = isSettlement && m.settlementType === "위탁정산" ? 1.0 : exemptBillingRatio;
    pushEntry(ratio, { pool: "exempt", idx, calc: exemptStdShares[idx] });
  });
  nonExemptMembers.forEach((m, idx) => {
    const ratio = isSettlement ? (m.settlementType === "자체정산" ? billingRatio : 1.0) : billingRatio;
    pushEntry(ratio, { pool: "general", idx, calc: generalCalcShares[idx] });
  });
  const exemptBillShares: number[] = new Array(exemptMembers.length).fill(0);
  const generalBillShares: number[] = new Array(nonExemptMembers.length).fill(0);
  ratioGroups.forEach((entries, ratio) => {
    const groupCalc = entries.map((e) => e.calc);
    // 그룹 청구 총액은 반올림해서 정하고(정확히 .5원에 걸리는 경우 위로 반올림 — 절사하면 경계에서
    // 1원 부족하게 청구되는 사례가 있었다), 그 총액을 그룹 내에서 다시 정확히 배분한다.
    const groupBillTotal = Math.round(groupCalc.reduce((s, c) => s + c, 0) * ratio);
    const groupBill = allocateExact(groupBillTotal, groupCalc);
    entries.forEach((e, k) => {
      if (e.pool === "exempt") exemptBillShares[e.idx] = groupBill[k];
      else generalBillShares[e.idx] = groupBill[k];
    });
  });

  const exemptBreakdown: ExemptInstDetail[] = exemptMembers.map((m, idx) => {
    const stdFee = exemptStdShares[idx];
    const calcFee = stdFee;
    const billFee = exemptBillShares[idx];
    return {
      institutionId: m.institutionId,
      institutionName: m.institutionName,
      grade: m.grade,
      cashBudget: m.cashBudget,
      standardFee: stdFee,
      calculatedFee: calcFee,
      billingFee: billFee,
      unclaimedFee: calcFee - billFee,
    };
  });

  // 4. 과제 산정수수료
  const calculatedFee = Math.round(generalFee + exemptFeeTotal * billingRatio);

  const generalBillingFee = generalBillShares.reduce((s, v) => s + v, 0);
  const generalUnclaimedFee = generalCalcFee - generalBillingFee;
  const generalBreakdown: ExemptInstDetail[] = nonExemptMembers.map((m, idx) => ({
    institutionId: m.institutionId,
    institutionName: m.institutionName,
    grade: m.grade,
    cashBudget: m.cashBudget,
    standardFee: generalCalcShares[idx],
    calculatedFee: generalCalcShares[idx],
    billingFee: generalBillShares[idx],
    unclaimedFee: generalCalcShares[idx] - generalBillShares[idx],
  }));

  // 이월 미청구액(carriedOverUnclaimed)은 정산 연차에만 함께 청구되므로(기관별 청구액 산출부와 동일 기준),
  // 연차상시 연차의 합계에는 더하지 않는다 — 예전엔 연차상시에도 더해져 실제 청구 합계와 어긋났었다.
  const exemptTotalBilling = exemptBreakdown.reduce((s, e) => s + e.billingFee, 0);
  const totalBillingFee = workType === "ANNUAL" ? generalBillingFee + exemptTotalBilling : generalBillingFee + exemptTotalBilling + carriedOverUnclaimed;

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
    generalBreakdown,
    generalBillingFee,
    generalUnclaimedFee,
    carriedOverUnclaimed,
    totalBillingFee,
    billingRatio,
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
export function resolvePolicy(agencyId: string, policies: FeePolicy[], programType: "GENERAL" | "ICT_FUND" = "GENERAL"): FeePolicy | undefined {
  const matchesType = (p: FeePolicy) => (p.programType ?? "GENERAL") === programType;
  // 1. 전담기관 자체 정책 (ACTIVE)
  const agencyPolicy = policies.find((p) => p.agencyId === agencyId && p.status === "ACTIVE" && matchesType(p));
  if (agencyPolicy) return agencyPolicy;
  // 2. 공통 정책 (ACTIVE)
  return policies.find((p) => p.agencyId === null && p.status === "ACTIVE" && matchesType(p));
}
