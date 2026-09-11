"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { FiAlertTriangle, FiAlertOctagon, FiRefreshCw, FiCalendar, FiCheckCircle, FiFlag, FiFolderPlus, FiHome, FiUsers } from "react-icons/fi";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { styleTemplateHeader, styleTemplateDataRows, applyDropdown, downloadWorkbook, TEMPLATE_BLANK_ROWS } from "@/lib/excel-template-style";
import Modal from "@/components/common/Modal";
import {
  SHEET_DEFS,
  matchSheet,
  buildColumnMapping,
  type SheetDef,
  type ColMappingResult,
  type UnknownColumn,
} from "@/lib/rcms-columns";
import {
  useStore,
  addFundingAgency,
  addInstitutionsBulk,
  addProject,
  addProjectMember,
  addProjectIssue,
  updateProject,
  updateProjectMember,
  recalcProjectTotalBudget,
  setTermOtherFirmHandled,
  beginSyncBatch,
  endSyncBatchAndWait,
} from "@/lib/store";
import type { Project, ProjectMember, AnnualBudget, AnnualFinancials, Institution, SystemUser, FundingAgency } from "@/lib/mock";
import { getCurrentUser } from "@/lib/auth";
import {
  isSettlementTerm,
  resolveAutoDetectedAgencyId,
  backfillExistingTermOverrides,
  resolveMemberGradeForTerm,
  resolveMemberSettlementTypeForTerm,
  resolveMemberRecipientForTerm,
  resolveResearchLeadForTerm,
} from "@/lib/fee-calculator";
import { resolveTermDateRange, nowKST, todayKST, formatBizNumber } from "@/lib/utils";
import ManagerPickerModal from "@/components/common/ManagerPickerModal";

type InstitutionGrade = NonNullable<ProjectMember["institutionGrade"]>;

// ============================================================
// 타입
// ============================================================

type Step = "upload" | "sheet" | "mapping" | "duplicate" | "preview" | "done";

interface ParsedSheet {
  sheetName: string;
  def: SheetDef;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColMappingResult[];
  unknown: UnknownColumn[];
}

interface ExtractedRow {
  agencyName: string;
  projectNumber: string;
  projectName: string;
  startDate: string;
  endDate: string;
  institutionName: string;
  bizNumber: string;
  institutionRole: string;
  sheetKey: string;
}

interface DuplicateInfo {
  type: "agency" | "project" | "institution";
  key: string;      // 이 값으로 기존 데이터와 대조했다 — 전담기관/사업자번호는 이름, 과제는 과제번호
  label?: string;    // 엑셀에 적힌 이름(과제명/기관명) — key만으론 뭘 가리키는지 알기 어려운 유형에만 채운다
  existing: string;
  status: "exact" | "similar";
  score?: number;
}

interface PreviewRow extends ExtractedRow {
  duplicates: DuplicateInfo[];
  willRegister: { agency: boolean; project: boolean; institution: boolean };
}

// 재업로드 시 "이미 등록된 과제"를 엑셀에 담긴 연차와 비교해 어떻게 처리할지 판단하는 정보.
// next: 진행중 연차보다 앞선 연차 데이터 → 다음 연차로 진행, 자동 반영
// same: 진행중 연차와 같은 연차 데이터 재제출 → 사용자 확인 후 반영
// behind: 이미 지난 연차 데이터 → 사용자 확인 후 반영 (기본은 반영 안 함)
type ProjectUpdateStatus = "next" | "same" | "behind";

interface ProjectUpdateInfo {
  normNum: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  currentTerm: number;
  excelTerm: number;
  status: ProjectUpdateStatus;
  // "동일 연차 재제출"/"과거 연차"로 판정돼 체크박스가 꺼져 있어도(연차·사업비는 미반영),
  // 단계 구조(stages) 변경은 안전한 추가 정보라 예외적으로 항상 반영된다 — 그 사실을 미리보기에서 알려준다.
  stageChanged: boolean;
  // 연구책임자·과제담당자·배정일(과제 레벨) 또는 실무자 메일주소(참여기관 레벨)처럼 승인 체크박스와
  // 무관하게 항상 반영되는 "안전한" 값이 실제로 바뀌는 경우 — stageChanged와 동일한 이유로 미리보기의
  // "N건 등록" 집계·버튼 활성화에 포함시켜야, 체크박스를 꺼도 이 정정만으로 등록할 수 있다.
  hasSafeFieldChange: boolean;
}

function defaultChoiceForStatus(status: ProjectUpdateStatus): boolean {
  return status === "next";
}

// 참여기관(ProjectMember) 자동 등록 — "연차별기관별" + "단계기관별" 시트를 과제+기관 단위로 합산
interface AggregatedBudget {
  termYear: number;
  termNumber: number;
  cashBudget: number;
  inKindBudget: number;
  // 이 연차·기관의 정부출연금/민간현금/민간현물 — 프로젝트 레벨 "당해 사업비" 필드
  // (govGrant/privateCash/privateInKind)를 채우기 위해 현재 연차 기준으로 기관별 합산에 쓴다.
  govGrant: number;
  privateCash: number;
  privateInKind: number;
  // 이 연차의 실제 시작/종료일(엑셀 "연차시작일자"/"연차종료일자") — 있으면 ProjectMember.annualBudgets에
  // 그대로 저장되어 autoGenerateTermFees가 TermFee.termStartDate/termEndDate로 옮겨 담는다.
  termStartDate?: string;
  termEndDate?: string;
  // 이 연차를 담당한 회계법인(엑셀 "회계법인") — 삼화가 아니면 그 연차를 타회계법인 진행으로 자동 표시.
  auditFirm?: string;
  // 이 연차 행에 실제로 적힌 정산형태·등급 — "연차별기관별" 시트가 연차마다 서로 다른 값을
  // 담고 있을 수 있어(예: 3연차부터 위탁정산으로 전환), 과제×기관당 단일값(MemberAggregate.
  // settlementType/institutionGrade)만으로는 "몇 연차부터 바뀌었는지"를 잃어버린다. 연차별
  // 오버라이드(settlementTypeOverrides/gradeOverrides)를 정확히 만들기 위해 연차별로도 남겨둔다.
  settlementType?: "위탁정산" | "자체정산";
  institutionGrade?: InstitutionGrade;
}

interface MemberAggregate {
  key: string; // normProjectNum|normBiz
  projectNumber: string;
  bizNumber: string;
  institutionName: string;
  role: "LEAD" | "PARTICIPANT" | "ENTRUSTED";
  settlementType: "위탁정산" | "자체정산";
  // 엑셀에 등급 컬럼이 없거나 값이 비어 있으면 undefined — 기존에 입력돼 있던 등급을 실수로
  // "일반"으로 덮어쓰지 않기 위해, "값이 아예 없었다"와 "일반으로 명시됨"을 구분해서 담아둔다.
  institutionGrade?: InstitutionGrade;
  // institutionGrade를 만든 원본 셀 텍스트 — "우수"라고만 적혀서(A/B/C 미지정) parseGrade가
  // 어쩔 수 없이 우수(A)로 기본 처리한 건지, 애초에 "우수(B)"처럼 구체적으로 적힌 건지 구분해
  // 기존에 더 구체적인 등급(B/C)이 있는 기관을 실수로 A로 깎아내리지 않는 데 쓴다.
  institutionGradeRaw?: string;
  // 실무자(구 "수신자") 이메일 — "실무자 메일주소" 컬럼에서 읽는다. 여러 개면 셀에 콤마(,)로
  // 구분해 적힌 그대로 문자열로 보존한다(발송 시점에 파싱). 마지막으로 읽은 행의 값(과제×기관당
  // "현재" 기본값 후보) — 연차별로 정확한 값은 아래 contactEmailsByTerm을 따로 쓴다.
  contactEmail?: string;
  // 연차별로 관측된 실무자 메일주소 — 담당자가 연차 중간에 바뀌는 경우가 있어(예: 3연차부터
  // 담당자 교체), 값이 있는 연차마다 정확히 recipientOverrides로 남기기 위해 따로 모은다.
  // "연차별기관별" 시트에만 연차 값이 있어 그 시트에서만 채워진다.
  contactEmailsByTerm: Map<number, string>;
  // 같은 연차 안에서 서로 다른 실무자 메일주소가 동시에 관측된 연차(중복 행 등 데이터 오류) —
  // 이 연차는 어느 값도 신뢰할 수 없으니 반영하지 않고 이슈로 안내한다.
  contactEmailConflictTerms: Set<number>;
  // 실무자 이름 — "실무자명" 컬럼에서 읽는다. contactEmail과 동일한 방식(마지막 값/연차별/충돌
  // 감지)으로 다룬다.
  contactName?: string;
  contactNamesByTerm: Map<number, string>;
  contactNameConflictTerms: Set<number>;
  // "연차별기관별"(현재 진행중인 연차 실적) 시트에서 이미 값을 받았는지 — "단계기관별" 시트는
  // 단계 전체의 정산 시점 스냅샷이라 지난 단계의 오래된 역할·정산형태·등급을 담고 있을 수 있어서,
  // 연차별 시트에 값이 있으면 그걸 우선하고 단계기관별 값으론 덮어쓰지 않는다.
  roleFromAnnual: boolean;
  settlementFromAnnual: boolean;
  gradeFromAnnual: boolean;
  budgetsByTerm: Map<number, AggregatedBudget>;
  totalCashBudgetFallback: number;
  totalInKindBudgetFallback: number;
}

// 이 참여기관 집계가 이번 파일만으로 사업비를 하나라도 가지고 있는지 — 수수료 산정(calcTermFee)이
// 실제로 참조하는 값(연차별 cashBudget/inKindBudget)뿐 아니라, "단계기관별" 시트에만 있는 경우를
// 위한 총액 폴백(totalCashBudgetFallback/totalInKindBudgetFallback)도 함께 본다.
function memberAggregateHasAnyBudget(agg: MemberAggregate): boolean {
  if (agg.totalCashBudgetFallback > 0 || agg.totalInKindBudgetFallback > 0) return true;
  for (const b of agg.budgetsByTerm.values()) {
    if (b.cashBudget > 0 || b.inKindBudget > 0) return true;
  }
  return false;
}

// "최우수(S)" / "우수(A~C)" / "일반" 텍스트, 또는 "연차별기관별" 시트의 "등급" 컬럼처럼
// S/A/B/C 낱글자만 있는 경우(D/E/F/"제외"는 특례등급 없음 = 일반) 모두 institutionGrade 값으로 변환한다.
function parseGrade(raw: string): InstitutionGrade | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (s.includes("최우수") || s === "S") return "최우수(S)";
  if (s.includes("우수") || s === "A" || s === "B" || s === "C") {
    if (s.includes("B")) return "우수(B)";
    if (s.includes("C")) return "우수(C)";
    return "우수(A)";
  }
  if (s.includes("일반") || s === "D" || s === "E" || s === "F" || s === "제외") return "일반";
  return undefined;
}

// 셀 값이 "우수"라고만 적혀 있어(A/B/C 미지정) parseGrade가 우수(A)로 임의 확정한 경우인지 판단한다 —
// 이 경우 기존에 더 구체적인 등급(우수(B)/우수(C))이 등록돼 있으면 그걸 A로 깎지 않고 보존해야 한다.
// "최우수"·"S"·"우수(A/B/C)"처럼 애초에 구체적으로 적힌 값은 모호하지 않다.
function isAmbiguousGoodGrade(raw: string): boolean {
  const s = raw.trim();
  return s.includes("우수") && !s.includes("최우수") && !s.includes("A") && !s.includes("B") && !s.includes("C");
}

// "연차별기관별" 시트가 연차마다 서로 다른 정산형태/등급을 담고 있을 수 있다(예: 3연차부터
// 위탁정산 전환). 과제×기관당 단일값(agg.settlementType/institutionGrade — 마지막에 읽은 행의
// 값)만 쓰면 "몇 연차부터 바뀌었는지"를 잃어버려서, 실제로는 3연차부터 바뀐 걸 마지막 연차부터
// 바뀐 것처럼 처리하게 된다. 그래서 값이 있는 연차마다 그대로 오버라이드로 남기고, 이번
// 업로드에 없는 연차의 기존 오버라이드는 보존한다.
function buildSettlementTypeOverridesFromExcel(
  agg: MemberAggregate,
  existingOverrides: NonNullable<ProjectMember["settlementTypeOverrides"]> | undefined
): ProjectMember["settlementTypeOverrides"] {
  const perTerm = Array.from(agg.budgetsByTerm.values())
    .filter((b) => b.settlementType !== undefined)
    .map((b) => ({ termNumber: b.termNumber, settlementType: b.settlementType! }));
  if (perTerm.length === 0) return existingOverrides;
  const newTermNumbers = new Set(perTerm.map((p) => p.termNumber));
  const merged = [
    ...(existingOverrides ?? []).filter((o) => !newTermNumbers.has(o.termNumber)),
    ...perTerm,
  ].sort((a, b) => a.termNumber - b.termNumber);
  return merged.length > 0 ? merged : undefined;
}

function buildGradeOverridesFromExcel(
  agg: MemberAggregate,
  existingOverrides: NonNullable<ProjectMember["gradeOverrides"]> | undefined
): ProjectMember["gradeOverrides"] {
  const perTerm = Array.from(agg.budgetsByTerm.values())
    .filter((b) => b.institutionGrade !== undefined)
    .map((b) => ({ termNumber: b.termNumber, grade: b.institutionGrade! }));
  if (perTerm.length === 0) return existingOverrides;
  const newTermNumbers = new Set(perTerm.map((p) => p.termNumber));
  const merged = [
    ...(existingOverrides ?? []).filter((o) => !newTermNumbers.has(o.termNumber)),
    ...perTerm,
  ].sort((a, b) => a.termNumber - b.termNumber);
  return merged.length > 0 ? merged : undefined;
}

// "연차별기관별" 시트가 연차마다 서로 다른 실무자 메일주소를 담고 있을 수 있다(예: 3연차부터 담당자
// 교체) — settlementType/institutionGrade와 동일한 방식으로, 값이 있는 연차마다 정확히 오버라이드로
// 남긴다. 같은 연차 안에서 서로 다른 값이 동시에 관측된 연차(agg.contactEmailConflictTerms)는 어느
// 값도 신뢰할 수 없으니 건너뛰고 기존 오버라이드를 그대로 둔다 — 그 연차는 별도로 이슈 안내한다.
function buildRecipientOverridesFromExcel(
  agg: MemberAggregate,
  existingMember: Pick<ProjectMember, "contactName" | "contactEmail" | "contactPhone">,
  existingOverrides: NonNullable<ProjectMember["recipientOverrides"]> | undefined
): ProjectMember["recipientOverrides"] {
  // 실무자명 컬럼은 실무자 메일주소와 별도로 입력될 수 있어(둘 다 있는 연차, 메일주소만 있는 연차 등)
  // 두 맵의 연차를 모두 합쳐서 순회한다 — 그 연차에 이름이 없으면 기존 담당자 이름으로 채운다.
  const termNumbers = new Set<number>([...agg.contactEmailsByTerm.keys(), ...agg.contactNamesByTerm.keys()]);
  const perTerm = Array.from(termNumbers)
    .filter((termNumber) => !agg.contactEmailConflictTerms.has(termNumber) && !agg.contactNameConflictTerms.has(termNumber))
    .map((termNumber) => ({
      termNumber,
      recipientName: agg.contactNamesByTerm.get(termNumber) ?? existingMember.contactName ?? "",
      // 이 연차에 실무자명만 새로 들어오고 메일주소는 안 들어온 경우, 여기서 빈 문자열로 덮어써버리면
      // (override.recipientEmail ?? contactEmail 폴백이 "값 없음"으로 착각) 기존에 잘 쓰던 메일주소가
      // 지워진다 — resolveContactEmailForTerm의 폴백값으로 보존한다.
      recipientEmail: agg.contactEmailsByTerm.get(termNumber) ?? resolveContactEmailForTerm(agg, termNumber) ?? existingMember.contactEmail ?? "",
      recipientPhone: existingMember.contactPhone ?? "",
    }));
  if (perTerm.length === 0) return existingOverrides;
  const newTermNumbers = new Set(perTerm.map((p) => p.termNumber));
  const merged = [
    ...(existingOverrides ?? []).filter((o) => !newTermNumbers.has(o.termNumber)),
    ...perTerm,
  ].sort((a, b) => a.termNumber - b.termNumber);
  return merged.length > 0 ? merged : undefined;
}

// buildRecipientOverridesFromExcel과 동일한 방식으로, "연차별기관별" 시트의 주관기관 행에 담긴
// 연차별 연구책임자 이름·메일주소를 Project.researchLeadOverrides로 직접 반영한다. 같은 연차 안에서
// 서로 다른 값이 동시에 관측된 연차(scalarInfo의 ...ConflictTerms)는 건너뛰고 기존 오버라이드를
// 그대로 둔다 — 그 연차는 별도로 이슈 안내한다. 이름/메일주소 중 한쪽만 그 연차에 적혀 있으면
// 나머지 한쪽은 지금 반영되는 기본값(currentName/currentEmail)으로 채운다.
function buildResearchLeadOverridesFromExcel(
  scalarInfo: ProjectScalarInfo | undefined,
  currentName: string | undefined,
  currentEmail: string | undefined,
  existingOverrides: NonNullable<Project["researchLeadOverrides"]> | undefined
): Project["researchLeadOverrides"] {
  if (!scalarInfo) return existingOverrides;
  const termNumbers = new Set<number>([
    ...scalarInfo.researchLeadsByTerm.keys(),
    ...scalarInfo.researchLeadEmailsByTerm.keys(),
  ]);
  const perTerm = [...termNumbers]
    .filter((t) => !scalarInfo.researchLeadConflictTerms.has(t) && !scalarInfo.researchLeadEmailConflictTerms.has(t))
    .map((termNumber) => ({
      termNumber,
      name: scalarInfo.researchLeadsByTerm.get(termNumber) ?? currentName ?? "",
      email: scalarInfo.researchLeadEmailsByTerm.get(termNumber) ?? currentEmail ?? "",
    }));
  if (perTerm.length === 0) return existingOverrides;
  const newTermNumbers = new Set(perTerm.map((p) => p.termNumber));
  const merged = [
    ...(existingOverrides ?? []).filter((o) => !newTermNumbers.has(o.termNumber)),
    ...perTerm,
  ].sort((a, b) => a.termNumber - b.termNumber);
  return merged.length > 0 ? merged : undefined;
}

// ============================================================
// 유틸
// ============================================================

function normBiz(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

// 연차별 이력(byTerm)에 그 연차 값이 있으면 우선 쓰고, 없으면 파일 전체에서 값이 정확히 하나로만
// 모아졌을 때(=서로 다른 연차라도 값이 전부 같을 때)만 그 값을 쓴다. assignedManager가 이미 쓰던
// "연차별 우선, 안 되면 유일값" 폴백을 연구책임자·책임자메일주소·실무자메일주소에도 동일하게 적용해,
// 연차마다 정말 다른 값(인사이동 등)을 "서로 달라 등록 못 함"으로 잘못 막지 않게 한다.
function resolveScalarForTerm(byTerm: Map<number, string> | undefined, term: number, flat: Set<string> | undefined): string | undefined {
  return byTerm?.get(term) ?? (flat && flat.size === 1 ? [...flat][0] : undefined);
}

function resolveContactEmailForTerm(agg: MemberAggregate, term: number): string | undefined {
  if (!agg.contactEmailConflictTerms.has(term)) {
    const termEmail = agg.contactEmailsByTerm.get(term);
    if (termEmail) return termEmail;
  }
  const emails = new Set(
    [...agg.contactEmailsByTerm.entries()]
      .filter(([termNumber]) => !agg.contactEmailConflictTerms.has(termNumber))
      .map(([, email]) => email)
  );
  return emails.size === 1 ? [...emails][0] : agg.contactEmail;
}

function resolveContactNameForTerm(agg: MemberAggregate, term: number): string | undefined {
  if (!agg.contactNameConflictTerms.has(term)) {
    const termName = agg.contactNamesByTerm.get(term);
    if (termName) return termName;
  }
  const names = new Set(
    [...agg.contactNamesByTerm.entries()]
      .filter(([termNumber]) => !agg.contactNameConflictTerms.has(termNumber))
      .map(([, name]) => name)
  );
  return names.size === 1 ? [...names][0] : agg.contactName;
}

function cleanRecipientOverridesForExcelMerge(
  overrides: ProjectMember["recipientOverrides"],
): ProjectMember["recipientOverrides"] {
  const cleaned = (overrides ?? []).filter((o) => o.recipientEmail !== "");
  return cleaned.length > 0 ? cleaned : undefined;
}

function normProjectNum(s: string): string {
  return s.replace(/\s/g, "").toUpperCase();
}

function simpleLevenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function strSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - simpleLevenshtein(a, b) / maxLen) * 100);
}

function getCellVal(row: Record<string, string>, mappedTo: string | null): string {
  if (!mappedTo) return "";
  return (row[mappedTo] ?? "").toString().trim();
}

function parseAmount(s: string): number {
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  // 원 단위는 소수점이 없어야 하는데, 엑셀 셀에 소수점 값이 들어있는 경우가 있어(수식 계산 오차 등)
  // 반올림해서 정수 원으로 맞춘다.
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// 엑셀 날짜 셀은 셀 서식이 "날짜"인 경우 시트 파싱 단계에서 일련번호(예: 45108)로 읽힌다.
// (cellDates 옵션은 브라우저 시간대에 따라 하루가 밀리는 문제가 있어 쓰지 않고, 대신
// XLSX.SSF로 일련번호를 직접 날짜로 환산한다.) 이미 "YYYY-MM-DD"류 문자열이면 그대로 둔다.
function toDateStr(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (Number.isFinite(n) && Number.isInteger(n) && n > 20000 && n < 80000) {
    const d = XLSX.SSF.parse_date_code(n);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  return s;
}

// "연차별기관별"(연차·예산) + "단계기관별"(정산형태·역할) 시트를 과제+기관 단위로 합산해
// 참여기관(ProjectMember) 등록에 쓸 데이터를 만든다. 이게 있어야 등록 시 연차 수수료가 자동 계산된다.
// "연차별기관별" 시트는 실무상 "현재 진행 중인 연차"만 담아 올리는 실적 시트이므로, 그 "연차" 값은
// 항상 과제 전체 기준 절대연차로 그대로 신뢰한다("단계" 컬럼이 있어도 오프셋을 더하지 않음).
// "단계기관별" 시트는 과제 전체 계획(단계 구조·총연차)을 나타낼 뿐, 이 절대연차 해석에는 관여하지 않는다.
function buildMemberAggregates(
  sheets: ParsedSheet[],
  institutions: readonly Pick<Institution, "bizNumber" | "referenceGrade">[]
): {
  members: MemberAggregate[];
  projectMaxTerm: Map<string, number>;
} {
  const memberMap = new Map<string, MemberAggregate>();
  const projectMaxTerm = new Map<string, number>();
  // bizNumber → referenceGrade — [수행기관 관리]의 정산면제리스트 업로드로 등록해둔 "연구지원체계
  // 등급". RCMS 셀엔 "우수"라고만 적혀 있어(A/B/C 미지정) parseGrade가 임의로 우수(A)를 확정하는
  // 경우, 이 값이 구체적(우수 A/B/C)이면 그걸로 상세 등급을 채운다. RCMS 자체에 A/B/C가 명시돼
  // 있으면(모호하지 않으면) RCMS 값을 그대로 신뢰하고 이 값은 참고하지 않는다.
  const referenceGradeByBiz = new Map<string, InstitutionGrade>();
  for (const inst of institutions) {
    if (inst.referenceGrade === "우수(A)" || inst.referenceGrade === "우수(B)" || inst.referenceGrade === "우수(C)") {
      referenceGradeByBiz.set(normBiz(inst.bizNumber), inst.referenceGrade);
    }
  }

  for (const sheet of sheets) {
    const get = (field: string, row: Record<string, string>) => {
      const m = sheet.mapping.find((x) => x.field === field);
      return getCellVal(row, m?.mappedTo ?? null);
    };

    for (const row of sheet.rows) {
      const projectNumber = get("projectNumber", row);
      const bizNumber = get("bizNumber", row);
      const normNum = normProjectNum(projectNumber);
      const normBizNum = normBiz(bizNumber);
      if (!normNum || !normBizNum) continue;

      const key = `${normNum}|${normBizNum}`;
      let agg = memberMap.get(key);
      if (!agg) {
        agg = {
          key,
          projectNumber,
          bizNumber,
          institutionName: get("institutionName", row) || "미입력",
          role: "PARTICIPANT",
          settlementType: "위탁정산",
          institutionGrade: undefined,
          roleFromAnnual: false,
          settlementFromAnnual: false,
          gradeFromAnnual: false,
          contactEmailsByTerm: new Map(),
          contactEmailConflictTerms: new Set(),
          contactNamesByTerm: new Map(),
          contactNameConflictTerms: new Set(),
          budgetsByTerm: new Map(),
          totalCashBudgetFallback: 0,
          totalInKindBudgetFallback: 0,
        };
        memberMap.set(key, agg);
      }

      const roleStr = get("institutionRole", row);
      const settlementStr = get("settlementType", row);
      const gradeStr = get("institutionGrade", row);
      const parsedGrade = parseGrade(gradeStr);
      // RCMS 셀이 "우수"라고만 적혀 있어(A/B/C 미지정) parseGrade가 우수(A)로 임의 확정한 경우엔,
      // 정산면제리스트에 등록된 구체적 등급(referenceGrade)이 있으면 그걸로 바꿔치기한다. 이때
      // institutionGradeRaw도 해석된 등급 문자열로 남겨서, 더 이상 "모호한 값"으로 취급되지 않게
      // 한다(아래 isAmbiguousGoodGrade 보호 로직이 이 값을 다시 A로 깎지 않도록).
      let resolvedGrade = parsedGrade;
      let resolvedGradeRaw = gradeStr;
      if (parsedGrade && isAmbiguousGoodGrade(gradeStr)) {
        const refGrade = referenceGradeByBiz.get(normBizNum);
        if (refGrade) {
          resolvedGrade = refGrade;
          resolvedGradeRaw = refGrade;
        }
      }

      if (sheet.def.key === "annual") {
        if (roleStr.includes("주관")) agg.role = "LEAD";
        else if (roleStr.includes("위탁")) agg.role = "ENTRUSTED";
        if (roleStr) agg.roleFromAnnual = true;

        if (settlementStr) {
          agg.settlementType = settlementStr.includes("자체") ? "자체정산" : "위탁정산";
          agg.settlementFromAnnual = true;
        }

        if (resolvedGrade) {
          agg.institutionGrade = resolvedGrade;
          agg.institutionGradeRaw = resolvedGradeRaw;
          agg.gradeFromAnnual = true;
        }
        const contactEmailStr = get("contactEmail", row);
        if (contactEmailStr) {
          agg.contactEmail = contactEmailStr;
          // 실무자 메일주소는 연차마다 값이 다를 수 있어(담당자 교체) 연차별로도 모은다 — 같은
          // 연차 안에서 서로 다른 값이 두 번 이상 나오면(중복 행 등) 그 연차는 신뢰할 수 없으니
          // contactEmailConflictTerms로 표시하고, 이미 기록된 값은 덮어쓰지 않는다.
          const termNumberForEmail = parseInt(get("termYear", row), 10) || 1;
          const existingEmailForTerm = agg.contactEmailsByTerm.get(termNumberForEmail);
          if (existingEmailForTerm !== undefined && existingEmailForTerm !== contactEmailStr) {
            agg.contactEmailConflictTerms.add(termNumberForEmail);
          } else {
            agg.contactEmailsByTerm.set(termNumberForEmail, contactEmailStr);
          }
        }
        const contactNameStr = get("contactName", row);
        if (contactNameStr) {
          agg.contactName = contactNameStr;
          // 실무자명도 실무자 메일주소와 동일한 방식(연차별 이력 + 충돌 감지)으로 다룬다.
          const termNumberForName = parseInt(get("termYear", row), 10) || 1;
          const existingNameForTerm = agg.contactNamesByTerm.get(termNumberForName);
          if (existingNameForTerm !== undefined && existingNameForTerm !== contactNameStr) {
            agg.contactNameConflictTerms.add(termNumberForName);
          } else {
            agg.contactNamesByTerm.set(termNumberForName, contactNameStr);
          }
        }
      } else {
        // "단계기관별"은 정산 시점 스냅샷이라 지난 단계의 값을 담고 있을 수 있음 — 연차별 시트가
        // 이미 채워둔 필드는 그대로 두고, 비어 있는 필드만 이걸로 보충한다.
        if (!agg.roleFromAnnual) {
          if (roleStr.includes("주관")) agg.role = "LEAD";
          else if (roleStr.includes("위탁")) agg.role = "ENTRUSTED";
        }
        if (!agg.settlementFromAnnual && settlementStr) {
          agg.settlementType = settlementStr.includes("자체") ? "자체정산" : "위탁정산";
        }
        if (!agg.gradeFromAnnual && resolvedGrade) {
          agg.institutionGrade = resolvedGrade;
          agg.institutionGradeRaw = resolvedGradeRaw;
        }
      }

      if (sheet.def.key === "annual") {
        // rcms-columns.ts 상 field명은 "termYear"지만 실제로는 "연차"(회차) 값이고,
        // 달력상 실제 연도는 "supportYear"(지원연도) 컬럼이 담당한다. "단계" 컬럼 값과 무관하게
        // 항상 과제 전체 기준 절대연차로 그대로 쓴다 — "단계기관별" 시트는 전체 계획(단계 구조)만
        // 나타낼 뿐, 이 시트에 실제로 몇 연차까지 올라왔는지와는 무관하기 때문이다.
        const termNumber = parseInt(get("termYear", row), 10) || 1;
        const supportYear = parseInt(get("supportYear", row), 10) || new Date().getFullYear();
        // "연차_기관_총사업비(현금/현물)"처럼 이 연차 전용 컬럼이 있으면 그쪽을 우선한다 —
        // 일부 RCMS 파일엔 과제 전체 누적 총액 컬럼("현금사업비 총액")도 같이 있어서 그걸 그대로
        // 쓰면 매 연차에 똑같은 값이 반복 등록되는 문제가 있다.
        const cashBudget = parseAmount(get("cashBudgetTerm", row) || get("cashBudget", row));
        const inKindBudget = parseAmount(get("inKindBudgetTerm", row) || get("inKindBudget", row));
        const govGrant = parseAmount(get("govGrant", row));
        let privateCash = parseAmount(get("privateCashTerm", row));
        let privateInKind = parseAmount(get("privateInKindTerm", row));
        // 정부출연금/민간현금/민간현물을 셋 다 안 채운 파일(테스트 파일 등)은, 과제의 "당해 사업비"
        // 자동계산값이 참여기관목록 사업비 합계와 어긋나 보이는 문제가 생긴다 — 정부출연금 비율은
        // 알 수 없으니 0으로 두고, 민간현금/민간현물을 현금/현물사업비 그대로 대체해 최소한 총액은
        // 항상 일치하게 한다. 셋 중 하나라도 값이 있으면(의도적으로 일부만 채운 것) 그대로 존중한다.
        if (govGrant === 0 && privateCash === 0 && privateInKind === 0) {
          privateCash = cashBudget;
          privateInKind = inKindBudget;
        }
        const termStartDate = toDateStr(get("termStartDate", row)) || undefined;
        const termEndDate = toDateStr(get("termEndDate", row)) || undefined;
        const auditFirm = get("auditFirm", row).trim() || undefined;
        agg.budgetsByTerm.set(termNumber, {
          termYear: supportYear, termNumber, cashBudget, inKindBudget, govGrant, privateCash, privateInKind, termStartDate, termEndDate, auditFirm,
          settlementType: settlementStr ? (settlementStr.includes("자체") ? "자체정산" : "위탁정산") : undefined,
          institutionGrade: resolvedGrade,
        });
        projectMaxTerm.set(normNum, Math.max(projectMaxTerm.get(normNum) ?? 0, termNumber));
      } else {
        const totalCash = parseAmount(get("totalCashBudget", row));
        if (totalCash > 0) agg.totalCashBudgetFallback = totalCash;
        const totalInKind = parseAmount(get("totalInKindBudget", row));
        if (totalInKind > 0) agg.totalInKindBudgetFallback = totalInKind;
      }
    }
  }

  return { members: Array.from(memberMap.values()), projectMaxTerm };
}

// 과제 레벨 단일값(과제담당자·자율성트랙·과제코드·연구책임자·과제명)을 시트 전체에서 모은다.
// 같은 과제번호의 여러 행(기관마다 반복)에 서로 다른 값이 섞여 있으면 그대로 등록하지 않고
// review-needed 이슈로 남겨 담당자가 직접 확인하게 한다(예: 같은 과제인데 과제코드가 다르게 찍힌 경우).
export interface ProjectScalarInfo {
  projectNames: Set<string>;
  assignedManagers: Set<string>;
  // 담당자는 인사이동 등으로 연차마다 바뀔 수 있어(예: 3연차 강상일 → 4연차 이진아), 과제 전체가
  // 하나로 통일돼야 하는 다른 스칼라 값들과 달리 연차별로 따로 모은다. "연차별기관별" 시트에만
  // 연차 값이 있어(termNumber 있는 행만) 채워진다.
  assignedManagersByTerm: Map<number, string>;
  // 과제담당자(정)도 (부)와 동일하게 인사이동 등으로 연차마다 바뀔 수 있어 이름을 연차별로 따로
  // 모은다(assignedManagersPrimary는 과제 전체에 값이 하나로 모아지는지 확인용 스칼라 집합,
  // ...PrimaryByTerm은 연차별 이력 구성용 — assignedManagers(By Term)와 동일한 이중 구조).
  // 연락처·이메일은 더 이상 여기서 다루지 않는다 — 공문 발송 시 이 이름으로 [권한관리](SystemUser)를
  // 찾아 쓰므로(lib/notice-contacts.ts) 엑셀에 실을 필요가 없다.
  assignedManagersPrimary: Set<string>;
  assignedManagersPrimaryByTerm: Map<number, string>;
  researchLeads: Set<string>;     // 주관기관 기관책임자 — 연차 구분 없이 관측된 모든 값(유일값 폴백용)
  researchLeadEmails: Set<string>; // 주관기관 "책임자 메일주소" — 위와 동일한 용도의 폴백
  // 연구책임자도 담당자와 마찬가지로 인사이동 등으로 연차마다 바뀔 수 있어(예: 3연차부터 책임교수
  // 변경) 연차별로 따로 모은다 — "연차별기관별" 시트의 주관기관 행에서만 채워진다.
  researchLeadsByTerm: Map<number, string>;
  researchLeadEmailsByTerm: Map<number, string>;
  // 같은 연차 안에서 서로 다른 값이 동시에 관측된 연차 — 정상적인 연차 간 변화(위 ...ByTerm)와
  // 달리 이건 데이터 오류이므로 그 연차만 반영하지 않고 이슈로 안내한다.
  researchLeadConflictTerms: Set<number>;
  researchLeadEmailConflictTerms: Set<number>;
  isAutonomyTrack: boolean;
  projectCategories: Set<string>;    // 과제구분(연차상시/정산)
  agencyAssignedAts: Set<string>;    // 전문기관배정일
  internalAssignedAts: Set<string>;  // 내부배정일
  // 총개발시작일자 — 신규 과제(아직 Project로 등록되지 않아 startDate를 알 수 없는 상태)에서
  // "엑셀 연차 vs 캘린더 계산 연차" 불일치를 미리보기 단계에서 미리 점검하는 데 쓴다.
  startDates: Set<string>;
}

function buildProjectScalarAggregates(sheets: ParsedSheet[]): Map<string, ProjectScalarInfo> {
  const map = new Map<string, ProjectScalarInfo>();

  function ensure(normNum: string): ProjectScalarInfo {
    let info = map.get(normNum);
    if (!info) {
      info = {
        projectNames: new Set(), assignedManagers: new Set(), assignedManagersByTerm: new Map(), assignedManagersPrimary: new Set(), researchLeads: new Set(),
        assignedManagersPrimaryByTerm: new Map(),
        researchLeadEmails: new Set(),
        researchLeadsByTerm: new Map(), researchLeadEmailsByTerm: new Map(),
        researchLeadConflictTerms: new Set(), researchLeadEmailConflictTerms: new Set(),
        isAutonomyTrack: false, projectCategories: new Set(), agencyAssignedAts: new Set(), internalAssignedAts: new Set(),
        startDates: new Set(),
      };
      map.set(normNum, info);
    }
    return info;
  }

  for (const sheet of sheets) {
    const get = (field: string, row: Record<string, string>) => {
      const m = sheet.mapping.find((x) => x.field === field);
      return getCellVal(row, m?.mappedTo ?? null);
    };

    for (const row of sheet.rows) {
      const normNum = normProjectNum(get("projectNumber", row));
      if (!normNum) continue;
      const info = ensure(normNum);

      const projectName = get("projectName", row);
      if (projectName) info.projectNames.add(projectName);

      const startDate = toDateStr(get("startDate", row));
      if (startDate) info.startDates.add(startDate);

      const manager = get("assignedManager", row);
      if (manager) {
        info.assignedManagers.add(manager);
        if (sheet.def.key === "annual") {
          const termNumber = parseInt(get("termYear", row), 10) || 0;
          if (termNumber > 0) info.assignedManagersByTerm.set(termNumber, manager);
        }
      }

      const managerPrimary = get("assignedManagerPrimary", row);
      if (managerPrimary) {
        info.assignedManagersPrimary.add(managerPrimary);
        if (sheet.def.key === "annual") {
          const termNumber = parseInt(get("termYear", row), 10) || 0;
          if (termNumber > 0) info.assignedManagersPrimaryByTerm.set(termNumber, managerPrimary);
        }
      }

      if (get("autonomyTrack", row) === "자율성트랙") info.isAutonomyTrack = true;

      // 연구책임자는 "주관"기관 행의 기관책임자만 채택 — 공동기관 책임자는 과제 전체의
      // 연구책임자가 아니므로 섞이면 안 된다.
      const roleStr = get("institutionRole", row);
      const lead = get("institutionLead", row);
      const leadEmail = get("researchLeadEmail", row);
      if (roleStr.includes("주관")) {
        if (lead) info.researchLeads.add(lead);
        if (leadEmail) info.researchLeadEmails.add(leadEmail);
        // 연차 값은 "연차별기관별" 시트에서만 알 수 있다 — "단계기관별" 시트는 연차 구분 없이
        // 단계 전체의 대표값 하나만 담고 있어 여기 넣으면 잘못된 연차에 고정될 수 있다.
        if (sheet.def.key === "annual") {
          const termNumber = parseInt(get("termYear", row), 10) || 0;
          if (termNumber > 0) {
            if (lead) {
              const existingLead = info.researchLeadsByTerm.get(termNumber);
              if (existingLead !== undefined && existingLead !== lead) info.researchLeadConflictTerms.add(termNumber);
              else info.researchLeadsByTerm.set(termNumber, lead);
            }
            if (leadEmail) {
              const existingLeadEmail = info.researchLeadEmailsByTerm.get(termNumber);
              if (existingLeadEmail !== undefined && existingLeadEmail !== leadEmail) info.researchLeadEmailConflictTerms.add(termNumber);
              else info.researchLeadEmailsByTerm.set(termNumber, leadEmail);
            }
          }
        }
      }

      const category = get("projectCategory", row);
      if (category) info.projectCategories.add(category.includes("정산") && !category.includes("연차") ? "정산" : "연차상시");

      const agencyAssignedAt = toDateStr(get("agencyAssignedAt", row));
      if (agencyAssignedAt) info.agencyAssignedAts.add(agencyAssignedAt);

      const internalAssignedAt = toDateStr(get("internalAssignedAt", row));
      if (internalAssignedAt) info.internalAssignedAts.add(internalAssignedAt);
    }
  }

  return map;
}

// 특정 과제·연차의 정부출연금/민간현금/민간현물을 참여기관 전체에서 합산 — Project의
// "당해" 사업비 필드(govGrant/privateCash/privateInKind)에 쓴다.
function sumTermFinancials(
  memberAggregates: MemberAggregate[],
  normNum: string,
  termNumber: number
): { govGrant: number; privateCash: number; privateInKind: number } {
  let govGrant = 0, privateCash = 0, privateInKind = 0;
  for (const agg of memberAggregates) {
    if (normProjectNum(agg.projectNumber) !== normNum) continue;
    const b = agg.budgetsByTerm.get(termNumber);
    if (!b) continue;
    govGrant += b.govGrant;
    privateCash += b.privateCash;
    privateInKind += b.privateInKind;
  }
  return { govGrant, privateCash, privateInKind };
}

// 특정 과제의 "파일에 담긴 모든 연차"의 정부출연금/민간현금/민간현물을 참여기관 전체에서 합산한다.
// sumTermFinancials는 연차 하나만 골라 Project의 단일 필드(당해 값)를 채우는 데 쓰이는 반면,
// 이건 Project.annualFinancials(연차별 이력 배열)를 채우는 데 쓴다 — 참여기관 annualBudgets와
// 동일하게, 재업로드로 여러 연차가 한 파일에 섞여 들어와도 연차별로 정확히 쌓이게 하기 위함.
function sumAllTermFinancials(
  memberAggregates: MemberAggregate[],
  normNum: string,
): AnnualFinancials[] {
  const byTerm = new Map<number, AnnualFinancials>();
  for (const agg of memberAggregates) {
    if (normProjectNum(agg.projectNumber) !== normNum) continue;
    for (const [termNumber, b] of agg.budgetsByTerm) {
      const entry = byTerm.get(termNumber) ?? { termYear: b.termYear, termNumber, govGrant: 0, privateCash: 0, privateInKind: 0 };
      entry.termYear = b.termYear;
      entry.govGrant += b.govGrant;
      entry.privateCash += b.privateCash;
      entry.privateInKind += b.privateInKind;
      byTerm.set(termNumber, entry);
    }
  }
  return Array.from(byTerm.values()).sort((a, b) => a.termNumber - b.termNumber);
}

// 이번에 업로드된 연차만 덮어쓰고, 파일에 없는 과거/미래 연차의 기존 기록은 그대로 보존한다 —
// ProjectMember.annualBudgets를 갱신할 때와 동일한 병합 규칙.
function mergeAnnualFinancials(
  existing: AnnualFinancials[] | undefined,
  updates: AnnualFinancials[],
): AnnualFinancials[] | undefined {
  if (updates.length === 0) return existing;
  const updatedTermNumbers = new Set(updates.map((u) => u.termNumber));
  const kept = (existing ?? []).filter((e) => !updatedTermNumbers.has(e.termNumber));
  return [...kept, ...updates].sort((a, b) => a.termNumber - b.termNumber);
}

// scalarInfo.assignedManagersByTerm(연차→담당자)을 Project.assignedManagerHistory 배열로 바꾼다.
// 연락처·이메일은 여기 담지 않는다 — 공문 발송 시 이 이름으로 [권한관리](SystemUser)를 찾아 쓴다.
type AssignedManagerHistoryEntry = { termNumber: number; assignedManager: string };
type AssignedManagerPrimaryHistoryEntry = { termNumber: number; assignedManagerPrimary: string };

// 엑셀 이름이 [권한관리]에 없어서(managerNameResolutions에 해소 결과가 있으면) 사람이 실제 계정을
// 골랐다면, 그 계정의 진짜 이름으로 바꿔 쓴다 — 그대로 두면 오탈자·미등록 이름이 과제에 그대로
// 남아 정산절차 안내 공문의 "문의사항 연락처" 표에 잘못된 이름이 계속 표시된다(연락처는 id로
// 올바르게 연동되더라도 이름 칸만 틀리게 보이는 불일치가 생김). 동명이인 해소는 애초에 후보를
// 이름이 이미 일치하는 사람들 중에서 고르므로 이 치환이 값을 바꾸지 않는다(안전하게 공용 가능).
function applyManagerNameResolution(name: string, resolutions: Record<string, string>, users: SystemUser[]): string {
  const userId = resolutions[name];
  if (!userId) return name;
  return users.find((u) => u.id === userId)?.name ?? name;
}

function buildAssignedManagerHistory(
  scalarInfo: ProjectScalarInfo | undefined,
  resolutions: Record<string, string>,
  users: SystemUser[],
): AssignedManagerHistoryEntry[] {
  if (!scalarInfo) return [];
  return Array.from(scalarInfo.assignedManagersByTerm.entries())
    .map(([termNumber, assignedManager]) => ({ termNumber, assignedManager: applyManagerNameResolution(assignedManager, resolutions, users) }))
    .sort((a, b) => a.termNumber - b.termNumber);
}

// buildAssignedManagerHistory와 동일한 방식으로 과제담당자(정)의 연차별 이력을 만든다.
function buildAssignedManagerPrimaryHistory(
  scalarInfo: ProjectScalarInfo | undefined,
  resolutions: Record<string, string>,
  users: SystemUser[],
): AssignedManagerPrimaryHistoryEntry[] {
  if (!scalarInfo) return [];
  return Array.from(scalarInfo.assignedManagersPrimaryByTerm.entries())
    .map(([termNumber, assignedManagerPrimary]) => ({ termNumber, assignedManagerPrimary: applyManagerNameResolution(assignedManagerPrimary, resolutions, users) }))
    .sort((a, b) => a.termNumber - b.termNumber);
}

// 담당자 이름이 [권한관리]에 동명이인으로 등록돼 있거나(2명 이상) 아예 없으면(0명, 오탈자 등)
// managerNameResolutions에 그 이름의 해소 결과가 있다 — 있으면 그 사용자 id를 쓴다. 이번
// 업로드에서 이름이 안 바뀌었고(=기존 값과 동일) 예전에 이미 다른 방식(과제상세 수동 선택 등)으로
// id가 연결돼 있었다면 그 값을 그대로 보존한다. 이름이 새로 바뀌었는데 이번엔 해소가 필요 없으면
// (=이름만으로 유일하게 식별됨) id는 비워둔다 — 이름 매칭만으로 충분하다.
function resolveManagerUserId(
  resolvedName: string | undefined,
  previousName: string | undefined,
  previousUserId: string | undefined,
  resolutions: Record<string, string>,
): string | undefined {
  if (!resolvedName) return previousUserId;
  return resolutions[resolvedName] ?? (resolvedName === previousName ? previousUserId : undefined);
}

// 이번에 업로드된 연차만 덮어쓰고, 파일에 없는 과거/미래 연차의 기존 담당자 이력은 보존한다 —
// annualFinancials/annualBudgets와 동일한 병합 규칙. 과제담당자(정)/(부) 이력 모두 이 규칙을 공유한다.
function mergeTermHistory<T extends { termNumber: number }>(
  existing: T[] | undefined,
  updates: T[],
): T[] | undefined {
  if (updates.length === 0) return existing;
  const updatedTermNumbers = new Set(updates.map((u) => u.termNumber));
  const kept = (existing ?? []).filter((e) => !updatedTermNumbers.has(e.termNumber));
  const merged = [...kept, ...updates].sort((a, b) => a.termNumber - b.termNumber);
  return merged.length > 0 ? merged : undefined;
}

// "단계기관별" 시트의 정산대상시작/종료단계·연차 값으로 과제별 단계 구조(Project.stages)를 추정한다.
// 이 4개 값은 과제 하나에 대해 여러 행(정산 처리 시점마다의 스냅샷)으로 나타나므로,
// 같은 단계번호로 관측된 시작/종료연차 중 가장 넓은 범위를 그 단계의 범위로 채택한다.
// 단계번호가 전부 0이면(=일괄협약 표기) 단계 구조를 만들지 않고 그대로 둔다.
interface ProjectStageInfo {
  ranges: Map<number, { start: number; end: number }>;
  // 단계별 실제 달력 날짜 범위(정산대상개발시작/종료일자) — Project.stageStartDate/stageEndDate에 사용.
  dateRanges: Map<number, { start: string; end: string }>;
  // 이 프로젝트의 단계기관별 행 중 하나라도 4개 값 중 일부가 비어 있거나(시작단계≠종료단계처럼)
  // 해석할 수 없었던 경우 true — 담당자 확인이 필요하다는 신호로 쓴다.
  hasMissing: boolean;
  // hasMissing이 왜 true가 됐는지 행 단위로 남기는 구체적 사유 — "일부 비어있음"이라는 뭉뚱그린
  // 메시지만으로는 정확히 어느 행·어느 값이 문제인지 알 수 없어서, 실제로 어느 기관·어느 단계값이
  // 걸러졌는지 사람이 바로 찾아 고칠 수 있게 남긴다.
  skipReasons: string[];
}

function buildStageAggregates(sheets: ParsedSheet[]): Map<string, ProjectStageInfo> {
  const map = new Map<string, ProjectStageInfo>();

  for (const sheet of sheets) {
    if (sheet.def.key !== "stage") continue;
    const get = (field: string, row: Record<string, string>) => {
      const m = sheet.mapping.find((x) => x.field === field);
      return getCellVal(row, m?.mappedTo ?? null);
    };

    for (const row of sheet.rows) {
      const normNum = normProjectNum(get("projectNumber", row));
      if (!normNum) continue;

      let info = map.get(normNum);
      if (!info) { info = { ranges: new Map(), dateRanges: new Map(), hasMissing: false, skipReasons: [] }; map.set(normNum, info); }

      const institutionName = get("institutionName", row) || "(기관명 미상)";
      const rawStartStage = get("stageStartNumber", row);
      const rawStartTerm = get("stageStartTerm", row);
      const rawEndStage = get("stageEndNumber", row);
      const rawEndTerm = get("stageEndTerm", row);
      if (!rawStartStage || !rawStartTerm || !rawEndStage || !rawEndTerm) {
        info.hasMissing = true;
        info.skipReasons.push(
          `${institutionName}: 정산대상시작단계="${rawStartStage}", 시작연차="${rawStartTerm}", 종료단계="${rawEndStage}", 종료연차="${rawEndTerm}" 중 비어있는 값이 있어 이 행을 건너뜀`
        );
        continue;
      }

      const startStage = parseInt(rawStartStage, 10);
      const startTerm = parseInt(rawStartTerm, 10);
      const endStage = parseInt(rawEndStage, 10);
      const endTerm = parseInt(rawEndTerm, 10);
      if (![startStage, startTerm, endStage, endTerm].every(Number.isFinite)) {
        info.hasMissing = true;
        info.skipReasons.push(`${institutionName}: 정산대상시작/종료단계·연차 값이 숫자가 아니어서 이 행을 건너뜀`);
        continue;
      }
      // 한 행이 여러 단계를 걸치는 경우는 이 파일 구조상 나타나지 않고 해석도 애매하므로 건너뛰고 표시만 한다.
      if (startStage !== endStage) {
        info.hasMissing = true;
        info.skipReasons.push(`${institutionName}: 정산대상시작단계(${startStage})와 종료단계(${endStage})가 서로 달라 이 행을 건너뜀 — 한 행은 하나의 단계만 나타낼 수 있습니다`);
        continue;
      }

      const existing = info.ranges.get(startStage);
      if (!existing) info.ranges.set(startStage, { start: startTerm, end: endTerm });
      else info.ranges.set(startStage, { start: Math.min(existing.start, startTerm), end: Math.max(existing.end, endTerm) });

      const startDateStr = toDateStr(get("stageStartDate", row));
      const endDateStr = toDateStr(get("stageEndDate", row));
      if (startDateStr && endDateStr) {
        const existingDate = info.dateRanges.get(startStage);
        if (!existingDate) info.dateRanges.set(startStage, { start: startDateStr, end: endDateStr });
        else info.dateRanges.set(startStage, {
          start: startDateStr < existingDate.start ? startDateStr : existingDate.start,
          end: endDateStr > existingDate.end ? endDateStr : existingDate.end,
        });
      }
    }
  }

  return map;
}

// "연차별기관별" 시트의 "단계시작일자"/"단계종료일자"로 단계별 실제 날짜를 보충한다 — 단계기관별
// 시트가 아예 없거나(비RCMS 파일 등) 그 시트에 날짜가 비어 있을 때의 보조 수단이다. 단계기관별
// 시트에 이미 값이 있으면 min/max 병합이라 결과가 넓어지기만 할 뿐, 우선순위 걱정 없이 그대로 섞어도 된다.
function supplementStageDatesFromAnnual(sheets: ParsedSheet[], stageAggregates: Map<string, ProjectStageInfo>): void {
  for (const sheet of sheets) {
    if (sheet.def.key !== "annual") continue;
    const get = (field: string, row: Record<string, string>) => {
      const m = sheet.mapping.find((x) => x.field === field);
      return getCellVal(row, m?.mappedTo ?? null);
    };

    for (const row of sheet.rows) {
      const normNum = normProjectNum(get("projectNumber", row));
      if (!normNum) continue;
      const stageNum = parseInt(get("term", row), 10);
      if (!Number.isFinite(stageNum) || stageNum <= 0) continue;
      const startDateStr = toDateStr(get("stageStartDateAnnual", row));
      const endDateStr = toDateStr(get("stageEndDateAnnual", row));
      if (!startDateStr || !endDateStr) continue;

      let info = stageAggregates.get(normNum);
      if (!info) { info = { ranges: new Map(), dateRanges: new Map(), hasMissing: false, skipReasons: [] }; stageAggregates.set(normNum, info); }

      const existingDate = info.dateRanges.get(stageNum);
      if (!existingDate) info.dateRanges.set(stageNum, { start: startDateStr, end: endDateStr });
      else info.dateRanges.set(stageNum, {
        start: startDateStr < existingDate.start ? startDateStr : existingDate.start,
        end: endDateStr > existingDate.end ? endDateStr : existingDate.end,
      });
    }
  }
}

// "단계기관별" 시트의 정산대상시작/종료연차는 그 단계 안에서 1부터 다시 세는 상대값으로 적히는
// 경우가 대부분이다(예: 2단계도 "1~2연차"로 표기). 이를 과제 전체 기준 절대연차로 바꾸려면 이전
// 단계들의 길이를 누적한 오프셋이 필요하다 — offset(단계번호) + 상대값 = 절대값.
// 이미 등록된 과제의 stages(기존에 확정된 절대 길이)를 우선 반영하고, 이번 파일에서 더 넓은 범위가
// 관측되면 그걸로 갱신한다(실적 데이터가 더 최신·정확하므로).
function computeStageOffsets(
  info: ProjectStageInfo | undefined,
  existingStages: Project["stages"] | undefined
): Map<number, number> {
  const lengthByStage = new Map<number, number>();
  for (const s of existingStages ?? []) {
    lengthByStage.set(s.stageNumber, s.endTermNumber - s.startTermNumber + 1);
  }
  if (info) {
    for (const [n, r] of info.ranges) {
      if (n === 0) continue; // 0단계(일괄협약 표기)는 단계 오프셋 체계와 무관
      const observedLength = r.end - r.start + 1;
      lengthByStage.set(n, Math.max(observedLength, lengthByStage.get(n) ?? 0));
    }
  }
  const stageNumbers = [...lengthByStage.keys()].sort((a, b) => a - b);
  const offsets = new Map<number, number>();
  let cumulative = 0;
  for (const n of stageNumbers) {
    offsets.set(n, cumulative);
    cumulative += lengthByStage.get(n)!;
  }
  return offsets;
}

// ProjectStageInfo(+기존 stages) → Project.agreementType/stages. 이번 파일에 단계 정보가 전혀
// 없으면(일괄협약이거나 단계기관별 시트가 없으면) 기존 stages를 그대로 보존해서 반환한다.
// batchEndTerm: 단계=0(일괄협약)으로 관측된 종료연차 — STAGED 여부와 무관하게 총연차 추정에 쓴다.
// (전에는 stages가 undefined인 일괄협약 과제의 경우 이 값이 통째로 버려져서, 여러 해짜리 과제를
// "연차_기관_총사업비" 행이 1개뿐이면 1년짜리 과제로 잘못 등록하는 원인이 됐었다.)
function resolveStageStructure(
  info: ProjectStageInfo | undefined,
  existingStages: Project["stages"] | undefined
): {
  agreementType: Project["agreementType"];
  stages: Project["stages"];
  batchEndTerm: number;
} {
  const batchEndTerm = info?.ranges.get(0)?.end ?? 0;
  const stageNumbersInFile = info ? [...info.ranges.keys()].filter((n) => n !== 0) : [];
  if (stageNumbersInFile.length === 0) {
    // 이번 파일엔 새 단계 정보가 없음 — 기존 단계 구조를 그대로 보존(잘못 지워지지 않게)
    return {
      agreementType: existingStages && existingStages.length > 0 ? "STAGED" : undefined,
      stages: existingStages,
      batchEndTerm,
    };
  }
  const offsets = computeStageOffsets(info, existingStages);
  const allStageNumbers = [...offsets.keys()].sort((a, b) => a - b);
  return {
    agreementType: "STAGED",
    stages: allStageNumbers.map((n) => {
      const r = info?.ranges.get(n);
      const existing = existingStages?.find((s) => s.stageNumber === n);
      const length = r ? r.end - r.start + 1 : existing ? existing.endTermNumber - existing.startTermNumber + 1 : 1;
      const d = info?.dateRanges.get(n);
      return {
        stageNumber: n,
        startTermNumber: offsets.get(n)! + 1,
        endTermNumber: offsets.get(n)! + length,
        stageStartDate: d?.start ?? existing?.stageStartDate,
        stageEndDate: d?.end ?? existing?.stageEndDate,
      };
    }),
    batchEndTerm,
  };
}

// 엑셀에 담긴 과제 중 이미 등록된 과제를, 진행중인 연차(currentTerm)와 비교해
// 신규/다음연차/동일연차/과거연차로 분류한다 (신규 과제는 여기서 다루지 않는다).
function computeProjectUpdates(
  projects: Project[],
  memberAggregates: MemberAggregate[],
  projectMembers: readonly Pick<ProjectMember, "projectId" | "institutionId" | "contactEmail" | "contactName">[],
  institutions: readonly Pick<Institution, "id" | "bizNumber">[],
  projectMaxTerm: Map<string, number>,
  stageAggregates: Map<string, ProjectStageInfo>,
  scalarAggregates: Map<string, ProjectScalarInfo>
): ProjectUpdateInfo[] {
  // 아래 루프는 파일에 등장한 고유 과제 수(U)만큼 도는데, 그 안에서 projects/institutions/
  // projectMembers 전체를 매번 .find()/.some()으로 훑으면 비용이 "U × 기존 누적 데이터 규모"로
  // 커진다. 이 함수는 등록 실행(doRegister) 중에도 projects/institutions/projectMembers가
  // add*/update*로 바뀔 때마다(각 서버 응답이 돌아올 때마다) useMemo 의존성 때문에 다시 호출되므로,
  // 인덱스 없이는 회계법인이 몇 년치 데이터를 쌓아둔 상태에서 대량 업로드를 등록할 때 이 재계산만으로
  // 몇 분~몇십 분씩 걸릴 수 있다. 한 번만 인덱스를 만들어 전부 O(1) 조회로 바꾼다.
  const projectByNormNum = new Map<string, Project>();
  for (const p of projects) projectByNormNum.set(normProjectNum(p.projectNumber), p);
  const institutionIdByNormBiz = new Map<string, string>();
  for (const i of institutions) institutionIdByNormBiz.set(normBiz(i.bizNumber), i.id);
  const memberAggregatesByNormNum = new Map<string, MemberAggregate[]>();
  for (const agg of memberAggregates) {
    const key = normProjectNum(agg.projectNumber);
    const list = memberAggregatesByNormNum.get(key);
    if (list) list.push(agg); else memberAggregatesByNormNum.set(key, [agg]);
  }
  const projectMemberByProjectAndInst = new Map<string, Pick<ProjectMember, "projectId" | "institutionId" | "contactEmail" | "contactName">>();
  for (const pm of projectMembers) projectMemberByProjectAndInst.set(`${pm.projectId}|${pm.institutionId}`, pm);

  const normNums = new Set(memberAggregates.map((m) => normProjectNum(m.projectNumber)));
  // 단계기관별 시트만 있고 연차별기관별 시트엔 해당 과제 행이 없는 업로드도 잡아내기 위해,
  // 단계 정보로만 알려진 과제번호도 비교 대상에 포함한다.
  for (const normNum of stageAggregates.keys()) normNums.add(normNum);
  const updates: ProjectUpdateInfo[] = [];
  for (const normNum of normNums) {
    const existing = projectByNormNum.get(normNum);
    if (!existing) continue; // 신규 과제는 별도 처리
    const currentTerm = existing.currentTerm ?? 1;
    // 엑셀에 연차 정보가 없으면(단계기관별 시트만 있는 경우 등) 동일 연차로 보수적으로 취급해
    // 사용자 확인 없이 조용히 반영되지 않게 한다. projectMaxTerm은 이미 단계 오프셋이 반영된
    // 절대연차이므로(buildMemberAggregates 참고) 그대로 비교하면 된다.
    // 주의: 여기서 그 단계의 "선언된 전체 길이"(단계기관별 시트의 정산대상시작/종료연차, 예:
    // 1단계=1~3연차)를 섞어 쓰면 안 된다 — 그 값은 그 단계가 몇 연차까지 계약돼 있는지를 나타낼
    // 뿐, 실제로 몇 연차까지 업로드됐는지와 무관해서, 이미 다 알고 있는 단계의 중간 연차(예:
    // 1단계 2연차)만 재업로드해도 곧장 그 단계의 마지막 연차로 건너뛰는 오류가 생긴다.
    const excelTerm = projectMaxTerm.get(normNum) ?? currentTerm;
    const status: ProjectUpdateStatus = excelTerm > currentTerm ? "next" : excelTerm === currentTerm ? "same" : "behind";

    const stageInfo = stageAggregates.get(normNum);
    const { agreementType: nextAgreementType, stages: nextStagesRaw } = resolveStageStructure(stageInfo, existing.stages);
    const nextStages = nextStagesRaw ?? existing.stages;
    const stageChanged =
      JSON.stringify(nextStages ?? null) !== JSON.stringify(existing.stages ?? null) ||
      (nextAgreementType ?? existing.agreementType) !== existing.agreementType;

    // 연구책임자·과제담당자·배정일(과제 레벨)/실무자 메일주소(참여기관 레벨)는 승인 체크박스와 무관하게
    // 항상 반영되는 값이라(아래 등록 단계 로직 참고), 그 값이 실제로 바뀌는지 여기서 미리 감지해 둔다.
    const scalarInfo = scalarAggregates.get(normNum);
    const researchLead = resolveScalarForTerm(scalarInfo?.researchLeadsByTerm, excelTerm, scalarInfo?.researchLeads);
    const researchLeadEmail = resolveScalarForTerm(scalarInfo?.researchLeadEmailsByTerm, excelTerm, scalarInfo?.researchLeadEmails);
    const assignedManager = scalarInfo?.assignedManagersByTerm.get(excelTerm)
      ?? (scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined);
    const assignedManagerPrimary = scalarInfo?.assignedManagersPrimaryByTerm.get(excelTerm)
      ?? (scalarInfo?.assignedManagersPrimary.size === 1 ? [...scalarInfo.assignedManagersPrimary][0] : undefined);
    const agencyAssignedAt = scalarInfo?.agencyAssignedAts.size === 1 ? [...scalarInfo.agencyAssignedAts][0] : undefined;
    const internalAssignedAt = scalarInfo?.internalAssignedAts.size === 1 ? [...scalarInfo.internalAssignedAts][0] : undefined;
    // 위 excelTerm 기준 값뿐 아니라, 파일에 담긴 다른 연차에 대한 책임자 정보 변경도 감지한다 —
    // 연차별 오버라이드(researchLeadOverrides)로 반영되는 값이라 currentTerm 하나만 봐서는 놓친다.
    const hasResearchLeadTermChange = [
      ...(scalarInfo?.researchLeadsByTerm.keys() ?? []),
      ...(scalarInfo?.researchLeadEmailsByTerm.keys() ?? []),
    ].some((t) => {
      if (scalarInfo?.researchLeadConflictTerms.has(t) || scalarInfo?.researchLeadEmailConflictTerms.has(t)) return false;
      const resolved = resolveResearchLeadForTerm(existing, t);
      const name = scalarInfo?.researchLeadsByTerm.get(t);
      const email = scalarInfo?.researchLeadEmailsByTerm.get(t);
      return (name !== undefined && name !== resolved.name) || (email !== undefined && email !== resolved.email);
    });
    const hasProjectScalarChange =
      (researchLead !== undefined && researchLead !== existing.researchLead) ||
      (researchLeadEmail !== undefined && researchLeadEmail !== existing.researchLeadEmail) ||
      hasResearchLeadTermChange ||
      (assignedManager !== undefined && assignedManager !== existing.assignedManager) ||
      (assignedManagerPrimary !== undefined && assignedManagerPrimary !== existing.assignedManagerPrimary) ||
      (agencyAssignedAt !== undefined && agencyAssignedAt !== existing.agencyAssignedAt) ||
      (internalAssignedAt !== undefined && internalAssignedAt !== existing.internalAssignedAt);

    const hasMemberContactChange = (memberAggregatesByNormNum.get(normNum) ?? []).some((agg) => {
      const institutionId = institutionIdByNormBiz.get(normBiz(agg.bizNumber));
      const existingMember = institutionId
        ? projectMemberByProjectAndInst.get(`${existing.id}|${institutionId}`)
        : undefined;
      if (agg.contactEmail && agg.contactEmail !== (existingMember?.contactEmail ?? "")) return true;
      if (agg.contactName && agg.contactName !== (existingMember?.contactName ?? "")) return true;
      if (!existingMember) return false;
      // 실무자명·실무자 메일주소도 연차별 오버라이드(recipientOverrides)로 반영되므로, 파일에 담긴
      // 다른 연차에 대한 변경도 함께 감지한다.
      for (const [termNumber, email] of agg.contactEmailsByTerm) {
        if (agg.contactEmailConflictTerms.has(termNumber)) continue;
        if (email !== resolveMemberRecipientForTerm(existingMember, termNumber).recipientEmail) return true;
      }
      for (const [termNumber, name] of agg.contactNamesByTerm) {
        if (agg.contactNameConflictTerms.has(termNumber)) continue;
        if (name !== resolveMemberRecipientForTerm(existingMember, termNumber).recipientName) return true;
      }
      return false;
    });

    updates.push({
      normNum,
      projectId: existing.id,
      projectNumber: existing.projectNumber,
      projectName: existing.projectName,
      currentTerm,
      excelTerm,
      status,
      stageChanged,
      hasSafeFieldChange: hasProjectScalarChange || hasMemberContactChange,
    });
  }
  return updates;
}

export interface TermCalendarMismatch {
  normNum: string;
  projectNumber: string;
  projectName: string;
  excelTerm: number;      // 이번 엑셀에 실제로 등록/반영될 연차 값
  calendarTerm: number;   // 총개발시작일자 기준으로 "오늘" 계산했을 때 나오는 예상 연차
}

// 엑셀에 적힌 연차(=실제로 등록되는 값)와, 총개발시작일자 기준 캘린더 역산 결과가 다른 과제를 찾는다.
// 다르다고 무조건 잘못된 건 아니다(과제가 일정보다 빠르거나 늦게 진행 중일 수 있음) — 등록을 막지는
// 않고, 엑셀 연차 값이나 총개발시작일자를 잘못 입력했을 가능성을 담당자·회계담당자가 확인할 수 있게
// 미리보기 경고 + 등록 후 이슈로만 남긴다.
function computeTermCalendarMismatches(
  projects: Project[],
  scalarAggregates: Map<string, ProjectScalarInfo>,
  projectMaxTerm: Map<string, number>,
  stageAggregates: Map<string, ProjectStageInfo>,
  today: string
): TermCalendarMismatch[] {
  const projectByNormNum = new Map<string, Project>();
  for (const p of projects) projectByNormNum.set(normProjectNum(p.projectNumber), p);

  const mismatches: TermCalendarMismatch[] = [];
  for (const [normNum, excelTerm] of projectMaxTerm) {
    const existingProject = projectByNormNum.get(normNum);
    const scalarInfo = scalarAggregates.get(normNum);
    // 신규 과제(아직 Project가 없음)는 이번 엑셀에서 시작일이 하나로 특정될 때만 계산할 수 있다.
    const startDate = existingProject?.startDate
      ?? (scalarInfo && scalarInfo.startDates.size === 1 ? [...scalarInfo.startDates][0] : undefined);
    if (!startDate) continue;

    const stageInfo = stageAggregates.get(normNum);
    const { stages, batchEndTerm } = resolveStageStructure(stageInfo, existingProject?.stages);
    const maxStageEndTerm = stages ? Math.max(...stages.map((s) => s.endTermNumber)) : batchEndTerm;
    const totalTerms = Math.max(1, excelTerm, maxStageEndTerm, existingProject?.totalTerms ?? 1);

    const calendarTerm = computeCurrentTerm(startDate, totalTerms, today);
    if (calendarTerm !== excelTerm) {
      const projectName = existingProject?.projectName
        ?? (scalarInfo && scalarInfo.projectNames.size >= 1 ? [...scalarInfo.projectNames][0] : "");
      mismatches.push({
        normNum,
        projectNumber: existingProject?.projectNumber ?? normNum,
        projectName,
        excelTerm,
        calendarTerm,
      });
    }
  }
  return mismatches;
}

// RCMS 과제번호가 재부여되어 문자열이 바뀌는 경우가 있어(같은 실제 과제인데 번호만 달라짐),
// 새 과제를 만들기 전에 "이미 등록된 같은 과제"인지 과제명+시작일+종료일이 전부 동일한지로 확인한다.
// (과제코드는 이제 엑셀에서 입력받지 않고 시스템이 자동으로 매기므로 매칭 기준에서 뺐다.)
// 후보가 2개 이상 나오면(우연한 일치 가능성) 판단하지 않고 ambiguousCandidates로 넘겨 이슈로 남긴다.
function resolveRenamedProject(
  projectName: string,
  startDate: string,
  endDate: string,
  existingProjects: Project[]
): { project: Project | null; ambiguousCandidates: Project[] } {
  const byNameDate = existingProjects.filter(
    (p) => p.projectName === projectName && p.startDate === startDate && p.endDate === endDate
  );
  if (byNameDate.length === 1) return { project: byNameDate[0], ambiguousCandidates: [] };
  if (byNameDate.length > 1) return { project: null, ambiguousCandidates: byNameDate };
  return { project: null, ambiguousCandidates: [] };
}

// autoGenerateTermFees와 동일한 방식(startDate + 연차-1년)으로 "현재 몇 연차인지" 추정
function computeCurrentTerm(startDate: string, totalTerms: number, today: string): number {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return 1;
  let current = 1;
  for (let term = 1; term <= totalTerms; term++) {
    const termStart = new Date(start);
    termStart.setFullYear(start.getFullYear() + term - 1);
    if (termStart.toISOString().slice(0, 10) <= today) current = term;
  }
  return current;
}

// autoGenerateTermFees(store.ts)와 동일한 방식으로 termYear를 계산한다 — 엑셀의 "지원연도" 값이 아니라
// 이 계산식으로 구해야 store.ts가 실제로 만든 TermFee.termYear와 정확히 일치해서 setTermOtherFirmHandled가 찾는다.
function computeTermYear(startDate: string, termNumber: number): number {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return new Date().getFullYear();
  const termStart = new Date(start);
  termStart.setFullYear(start.getFullYear() + termNumber - 1);
  return termStart.getFullYear();
}

// "삼화"라는 글자가 포함되어 있으면 삼화 자신으로 간주한다(표기가 "삼화회계법인"/"삼화" 등으로 다양할 수 있음).
// 비어있지 않고 삼화가 아니면 타회계법인으로 판단한다.
function isOtherFirmName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && !n.includes("삼화");
}

// ============================================================
// 스텝 컴포넌트들
// ============================================================

// ── 1. 파일 업로드 영역 ──────────────────────────────────────────

function UploadZone({ onFile, className = "" }: { onFile: (f: File) => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      alert("xlsx 또는 xls 파일만 업로드할 수 있습니다.");
      return;
    }
    onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-xl text-center transition-colors flex flex-col items-center justify-center ${
        dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
      } ${className}`}
    >
      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 48 48" className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M8 40h32M24 8v24m0-24-8 8m8-8 8 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm font-medium text-slate-600">RCMS 엑셀 파일을 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-slate-400">.xlsx / .xls 지원</p>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
    </div>
  );
}

// ── 2. 시트 탐색 결과 ────────────────────────────────────────────

function SheetStep({
  allSheetNames,
  matched,
  onConfirm,
  onBack,
  onManualAssign,
  onUnassign,
}: {
  allSheetNames: string[];
  matched: { sheetName: string; def: SheetDef }[];
  onConfirm: () => void;
  onBack: () => void;
  onManualAssign: (sheetName: string, defKey: SheetDef["key"]) => void;
  onUnassign: (defKey: SheetDef["key"]) => void;
}) {
  const unmatchedExpected = SHEET_DEFS.filter(
    (d) => !matched.find((m) => m.def.key === d.key)
  );

  return (
    <div className="h-full flex flex-col">
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
      <p className="text-sm font-semibold text-slate-700">시트 탐색 결과</p>
      <p className="text-xs text-slate-400 -mt-2">
        RCMS가 아닌 다른 시스템(예: 통합Ezbaro) 파일이라 시트가 자동으로 인식되지 않았다면,
        아래에서 이 파일의 시트를 어떤 용도로 쓸지 직접 지정할 수 있습니다. 컬럼은 다음 단계에서 직접 연결하면 됩니다.
      </p>
      <div className="space-y-2">
        {allSheetNames.map((name) => {
          const m = matched.find((x) => x.sheetName === name);
          return (
            <div key={name} className={`px-4 py-3 rounded-xl border space-y-2 ${m ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-3">
                {m ? (
                  <span className="text-emerald-600 font-bold text-xs bg-emerald-100 px-2 py-0.5 rounded shrink-0">인식됨</span>
                ) : (
                  <span className="text-slate-400 text-xs bg-slate-200 px-2 py-0.5 rounded shrink-0">미인식</span>
                )}
                <span className="text-sm text-slate-700 font-mono">{name}</span>
                {m && <span className="ml-auto text-xs text-emerald-600">→ {m.def.label}</span>}
                {m && (
                  <button onClick={() => onUnassign(m.def.key)} className="text-[11px] text-slate-400 hover:text-red-600 transition-colors">
                    지정 해제
                  </button>
                )}
              </div>
              {!m && (
                <div className="flex items-center gap-1.5 flex-wrap pl-1">
                  <span className="text-[11px] text-slate-400">이 시트를 —</span>
                  {SHEET_DEFS.map((d) => {
                    const occupiedBy = matched.find((x) => x.def.key === d.key);
                    return (
                      <button
                        key={d.key}
                        onClick={() => onManualAssign(name, d.key)}
                        title={occupiedBy ? `현재 "${occupiedBy.sheetName}"로 지정되어 있음 — 누르면 이 시트로 바뀝니다` : undefined}
                        className="text-[11px] font-medium px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                      >
                        {d.label}{occupiedBy ? " (교체)" : ""}로 사용
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {unmatchedExpected.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700">누락된 시트</p>
          {unmatchedExpected.map((d) => (
            <p key={d.key} className="text-xs text-amber-600">· {d.label}</p>
          ))}
        </div>
      )}
    </div>
      <div className="shrink-0 flex justify-between px-6 py-4 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={matched.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          컬럼 매핑 확인 →
        </button>
      </div>
    </div>
  );
}

// ── 3. 컬럼 매핑 확인 ───────────────────────────────────────────

function MappingStep({
  parsedSheets,
  onUpdateMapping,
  onConfirm,
  onBack,
}: {
  parsedSheets: ParsedSheet[];
  onUpdateMapping: (sheetKey: string, field: string, mappedTo: string | null) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const hasMissingRequired = parsedSheets.some((s) =>
    s.mapping.some((m) => m.required && !m.mappedTo)
  );

  return (
    <div className="h-full flex flex-col">
    <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
      {parsedSheets.map((sheet) => (
        <div key={sheet.def.key} className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">{sheet.def.label} <span className="font-mono text-xs text-slate-400">({sheet.sheetName})</span></p>

          {/* 신규 컬럼 */}
          {sheet.unknown.length > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">신규 컬럼 (시스템 미인식) — 참고용</p>
              <div className="flex flex-wrap gap-1.5">
                {sheet.unknown.map((u) => (
                  <span key={u.headerName} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{u.headerName}</span>
                ))}
              </div>
            </div>
          )}

          {/* 컬럼 매핑 테이블 */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="text-left px-4 py-2.5 w-8"></th>
                  <th className="text-left px-4 py-2.5">시스템 필드</th>
                  <th className="text-left px-4 py-2.5">파일 컬럼</th>
                  <th className="text-left px-4 py-2.5 w-24">매핑 방식</th>
                </tr>
              </thead>
              <tbody>
                {sheet.mapping.map((m) => {
                  const isMissing = !m.mappedTo;
                  const rowCls = m.required && isMissing
                    ? "bg-red-50 border-red-100"
                    : isMissing
                    ? "bg-amber-50 border-amber-100"
                    : "";
                  return (
                    <tr key={m.field} className={`border-b border-slate-100 last:border-0 ${rowCls}`}>
                      <td className="px-4 py-2.5 text-center">
                        {m.required ? (
                          <span className="text-[9px] font-bold text-red-500 bg-red-50 border border-red-200 px-1 rounded">필수</span>
                        ) : (
                          <span className="text-[9px] text-slate-400 bg-slate-100 border border-slate-200 px-1 rounded">선택</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700">{m.label}</p>
                        {m.description && <p className="text-[10px] text-slate-400 mt-0.5">{m.description}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={m.mappedTo ?? ""}
                          onChange={(e) => onUpdateMapping(sheet.def.key, m.field, e.target.value || null)}
                          className={`text-xs border rounded-lg px-2 py-1.5 w-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                            m.required && isMissing ? "border-red-300" : "border-slate-200"
                          }`}
                        >
                          <option value="">— 연결 안 함 —</option>
                          {sheet.headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        {m.suggestions.length > 0 && isMissing && (
                          <p className="text-[10px] text-blue-500 mt-0.5">추천: {m.suggestions[0].headerName} ({m.suggestions[0].score}%)</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.matchType === "exact" && <span className="text-emerald-600 font-medium">완전일치</span>}
                        {m.matchType === "alias" && <span className="text-blue-600 font-medium">별칭</span>}
                        {m.matchType === "similar" && (
                          <span className="text-amber-600 font-medium">
                            유사 {m.suggestions[0]?.score ?? ""}%
                          </span>
                        )}
                        {m.matchType === "none" && isMissing && (
                          <span className="text-red-500">미연결</span>
                        )}
                        {m.matchType === "none" && !isMissing && (
                          <span className="text-amber-600">수동</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {hasMissingRequired && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          필수 컬럼이 연결되지 않았습니다. 위에서 직접 연결하거나 파일을 확인해주세요.
        </div>
      )}
    </div>
      <div className="shrink-0 flex justify-between px-6 py-4 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={hasMissingRequired}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          중복 검사 →
        </button>
      </div>
    </div>
  );
}

// ── 4. 미리보기 + 등록 ──────────────────────────────────────────

const STATUS_BADGE: Record<ProjectUpdateStatus, { label: string; cls: string }> = {
  next: { label: "다음 연차 — 자동 반영", cls: "bg-blue-100 text-blue-700" },
  same: { label: "동일 연차 재제출 — 확인 필요", cls: "bg-amber-100 text-amber-700" },
  behind: { label: "과거 연차 데이터 — 확인 필요", cls: "bg-red-100 text-red-700" },
};

const MEMBER_ROLE_LABEL: Record<string, string> = { LEAD: "주관", PARTICIPANT: "공동", ENTRUSTED: "위탁" };

// 탭 콘텐츠 목록이 비었을 때 공통으로 보여주는 안내 문구
function EmptyTabNote({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-xs text-slate-400">{children}</div>;
}

type PreviewTabKey = "agency" | "project" | "inst" | "member" | "review";

function PreviewStep({
  previewRows,
  newMembers,
  projectUpdates,
  updateChoices,
  onToggleUpdate,
  calendarMismatches,
  stageSkipWarnings,
  memberDataWarnings,
  managerAmbiguities,
  managerNotFound,
  managerNameResolutions,
  users,
  onResolveManagerName,
  onConfirm,
  onBack,
  loading,
}: {
  previewRows: PreviewRow[];
  newMembers: MemberAggregate[];
  projectUpdates: ProjectUpdateInfo[];
  updateChoices: Record<string, boolean>;
  onToggleUpdate: (normNum: string, next: boolean) => void;
  calendarMismatches: TermCalendarMismatch[];
  stageSkipWarnings: { normNum: string; projectNumber: string; projectName: string; reasons: string[] }[];
  memberDataWarnings: { key: string; projectNumber: string; projectName: string; institutionName: string; missing: string[] }[];
  managerAmbiguities: { name: string; candidates: SystemUser[] }[];
  managerNotFound: string[];
  managerNameResolutions: Record<string, string>;
  users: SystemUser[];
  onResolveManagerName: (name: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  // 각 "신규 ○○" 탭에 실제로 무엇이 새로 등록되는지 보여주기 위해, 개수만 세던 걸 목록으로도 모은다.
  const newAgencyNames: string[] = [];
  const newProjectList: { projectNumber: string; projectName: string; agencyName: string }[] = [];
  const newInstList: { bizNumber: string; institutionName: string }[] = [];
  const agencySet = new Set<string>();
  const projectSet = new Set<string>();
  const instSet = new Set<string>();

  for (const r of previewRows) {
    if (r.agencyName && r.willRegister.agency && !agencySet.has(r.agencyName)) {
      agencySet.add(r.agencyName); newAgencyNames.push(r.agencyName);
    }
    if (r.projectNumber && r.willRegister.project && !projectSet.has(r.projectNumber)) {
      projectSet.add(r.projectNumber); newProjectList.push({ projectNumber: r.projectNumber, projectName: r.projectName, agencyName: r.agencyName });
    }
    if (r.bizNumber && r.willRegister.institution && !instSet.has(r.bizNumber)) {
      // 엑셀에 하이픈 없이 숫자만 입력해도(예: 1234567890) 실제 등록되는 값은 000-00-00000
      // 형식으로 맞춰지므로, 등록 전 미리보기도 그 최종 형식 그대로 보여준다.
      instSet.add(r.bizNumber); newInstList.push({ bizNumber: formatBizNumber(r.bizNumber), institutionName: r.institutionName });
    }
  }

  const newAgency = newAgencyNames.length;
  const newProject = newProjectList.length;
  const newInst = newInstList.length;
  const newMemberCount = newMembers.length;
  const dupRows = previewRows.filter((r) => r.duplicates.length > 0);
  // 같은 기관/과제/전담기관이 여러 행(예: 같은 기관이 여러 과제에 참여하거나, 같은 과제에 여러
  // 참여기관이 딸린 경우)에 걸쳐 반복 등장해도, 화면엔 "이미 등록됨" 메시지를 유형+key당 한 번만 보여준다.
  const dedupedDuplicates = useMemo(() => {
    const seen = new Map<string, DuplicateInfo>();
    for (const r of dupRows) {
      for (const d of r.duplicates) {
        const dedupeKey = `${d.type}|${d.key}`;
        if (!seen.has(dedupeKey)) seen.set(dedupeKey, d);
      }
    }
    return Array.from(seen.values());
  }, [dupRows]);
  const totalNew = newAgency + newProject + newInst + newMemberCount;
  // 체크박스가 꺼져 있어도(승인 안 됨) 단계 구조 변경이나 연락처·담당자 등 "안전한" 값 변경은
  // 등록 단계에서 그대로 반영되므로(위 stageChanged/hasSafeFieldChange 주석 참고), 그런 과제도
  // "반영될 갱신"으로 집계해야 "N건 등록" 버튼이 실제로 반영할 것이 있을 때 정확히 활성화된다.
  const approvedUpdateCount = projectUpdates.filter(
    (u) => (updateChoices[u.normNum] ?? defaultChoiceForStatus(u.status)) || u.stageChanged || u.hasSafeFieldChange
  ).length;
  const unresolvedManagerAmbiguities = managerAmbiguities.filter((a) => !managerNameResolutions[a.name]);
  const unresolvedManagerNotFound = managerNotFound.filter((name) => !managerNameResolutions[name]);
  const reviewCount = dupRows.length + stageSkipWarnings.length + projectUpdates.length + calendarMismatches.length + memberDataWarnings.length + managerAmbiguities.length + managerNotFound.length;

  const totalToRegister = newAgency + newProject + newInst + newMemberCount + approvedUpdateCount;

  const TABS: { key: PreviewTabKey; label: string; count: number; Icon: typeof FiFlag; warn?: boolean }[] = [
    { key: "review", label: "확인필요", count: reviewCount, Icon: FiAlertTriangle, warn: true },
    { key: "agency", label: "신규 전담기관", count: newAgency, Icon: FiFlag },
    { key: "project", label: "신규 과제", count: newProject, Icon: FiFolderPlus },
    { key: "inst", label: "신규 기관", count: newInst, Icon: FiHome },
    { key: "member", label: "신규 참여기관", count: newMemberCount, Icon: FiUsers },
  ];
  // 기존 과제 갱신 건이 있으면(재제출 등 확인이 특히 중요한 경우) "확인필요" 탭을 맨 먼저 보여준다.
  // 그 외에는 무엇이 새로 등록되는지(신규 항목)부터 먼저 보여주고 확인필요는 사용자가 직접 눌러보게 한다.
  const [activeTab, setActiveTab] = useState<PreviewTabKey>(
    projectUpdates.length > 0
      ? "review"
      : (["project", "inst", "member", "agency", "review"] as PreviewTabKey[])
          .find((key) => (TABS.find((t) => t.key === key)?.count ?? 0) > 0) ?? "project"
  );

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 탭 — 신규 항목 종류별로 실제 내역을 눌러서 확인할 수 있다 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-5 divide-x divide-slate-200 shrink-0">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              // "확인필요" 탭은 선택 여부와 무관하게 항상 노란색으로 눈에 띄게 — 나머지 탭은 기존처럼 파란색.
              const cls = t.warn
                ? {
                    wrap: active ? "bg-amber-50 border-amber-500" : "border-transparent hover:bg-amber-50/60",
                    icon: "text-amber-500",
                    count: active ? "text-amber-700" : "text-amber-600",
                    label: active ? "text-amber-600" : "text-amber-500",
                  }
                : {
                    wrap: active ? "bg-blue-50 border-blue-600" : "border-transparent hover:bg-slate-50",
                    icon: active ? "text-blue-600" : "text-slate-400",
                    count: active ? "text-blue-700" : "text-slate-800",
                    label: active ? "text-blue-600" : "text-slate-500",
                  };
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={`px-2 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${cls.wrap}`}
                >
                  <t.Icon size={16} className={cls.icon} />
                  <div className="text-left">
                    <p className={`text-base font-bold leading-none ${cls.count}`}>{t.count}</p>
                    <p className={`text-[10px] mt-1 whitespace-nowrap ${cls.label}`}>{t.label}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* 탭 콘텐츠 */}
          <div className="border-t border-slate-200 flex-1 overflow-y-auto">
            {activeTab === "agency" && (
              newAgencyNames.length === 0 ? <EmptyTabNote>새로 등록될 전담기관이 없습니다.</EmptyTabNote> : (
                <div className="divide-y divide-slate-100">
                  {newAgencyNames.map((name) => (
                    <div key={name} className="px-4 py-2.5 text-sm text-slate-700">{name}</div>
                  ))}
                </div>
              )
            )}
            {activeTab === "project" && (
              newProjectList.length === 0 ? <EmptyTabNote>새로 등록될 과제가 없습니다.</EmptyTabNote> : (
                <div className="divide-y divide-slate-100">
                  {newProjectList.map((p) => (
                    <div key={p.projectNumber} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">{p.projectNumber}</span>
                      <span className="text-sm text-slate-700 truncate">{p.projectName}</span>
                      <span className="ml-auto text-[11px] text-slate-400 shrink-0 whitespace-nowrap">{p.agencyName}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            {activeTab === "inst" && (
              newInstList.length === 0 ? <EmptyTabNote>새로 등록될 기관이 없습니다.</EmptyTabNote> : (
                <div className="divide-y divide-slate-100">
                  {newInstList.map((i) => (
                    <div key={i.bizNumber} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-sm text-slate-700">{i.institutionName}</span>
                      <span className="ml-auto font-mono text-[11px] text-slate-400 shrink-0">{i.bizNumber}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            {activeTab === "member" && (
              newMembers.length === 0 ? <EmptyTabNote>새로 등록될 참여기관이 없습니다.</EmptyTabNote> : (
                <div className="divide-y divide-slate-100">
                  {newMembers.map((m) => (
                    <div key={m.key} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="font-mono text-[11px] text-slate-400 shrink-0">{m.projectNumber}</span>
                      <span className="text-sm text-slate-700 truncate">{m.institutionName}</span>
                      <span className="ml-auto text-[11px] text-slate-500 shrink-0">{MEMBER_ROLE_LABEL[m.role] ?? m.role}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            {activeTab === "review" && (
              reviewCount === 0 ? <EmptyTabNote>확인이 필요한 항목이 없습니다.</EmptyTabNote> : (
                <div className="divide-y divide-slate-200">
                  {/* 사업비·연락처 미입력 참여기관 — 이 두 값이 없으면 수수료 계산·공문 발송이라는
                      핵심 기능이 그 기관에서 아예 안 돌아가므로, 이 탭에서 가장 먼저·가장 강하게 보여준다. */}
                  {memberDataWarnings.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-red-50 flex items-center gap-1.5">
                        <FiAlertOctagon size={13} className="text-red-500 shrink-0" />
                        <p className="text-xs font-semibold text-red-700">사업비·연락처 미입력 참여기관 ({memberDataWarnings.length}건) — 수수료 계산·공문 발송이 안 됩니다</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {memberDataWarnings.map((w) => (
                          <div key={w.key} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-red-700 truncate">{w.projectName} <span className="font-mono text-[10px] text-red-500">({w.projectNumber})</span></p>
                              <p className="text-[11px] text-slate-600 truncate">{w.institutionName}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {w.missing.map((m) => (
                                <span key={m} className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 whitespace-nowrap">{m} 없음</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-red-600 px-4 py-2 bg-red-50/60">
                        그대로 등록해도 막지는 않지만, 이 기관은 사업비가 없으면 수수료가 0으로 산정되고 연락처가 없으면 공문을 보낼 수 없습니다.
                        엑셀에서 값을 채워 다시 올리거나, 등록 후 과제 상세 화면의 참여기관 목록에서 바로 입력해주세요. 등록 후 담당자·회계담당자에게 확인 이슈로도 남습니다.
                      </p>
                    </div>
                  )}

                  {/* 과제담당자(정)/(부) 동명이인 — 이름만으로는 [권한관리]에서 어느 계정인지 특정할 수
                      없어, 공문 발송 시 연락처 자동 연동이 잘못될 수 있다. 등록 전에 반드시 선택하게 한다. */}
                  {managerAmbiguities.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-red-50 flex items-center gap-1.5">
                        <FiAlertOctagon size={13} className="text-red-500 shrink-0" />
                        <p className="text-xs font-semibold text-red-700">
                          과제담당자 동명이인 ({managerAmbiguities.length}명) — 선택해야 공문 연락처가 정확히 연동됩니다
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {managerAmbiguities.map((a) => {
                          const resolvedId = managerNameResolutions[a.name];
                          const resolvedUser = resolvedId ? a.candidates.find((c) => c.id === resolvedId) : undefined;
                          return (
                            <div key={a.name} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700">
                                  {a.name} <span className="text-[10px] text-slate-400">[권한관리]에 {a.candidates.length}명 동명이인</span>
                                </p>
                                {resolvedUser ? (
                                  <p className="text-[11px] text-emerald-600">선택됨 · {resolvedUser.email}</p>
                                ) : (
                                  <p className="text-[11px] text-red-600">누구인지 아직 선택되지 않았습니다</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onResolveManagerName(a.name)}
                                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  resolvedUser ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                              >
                                {resolvedUser ? "다시 선택" : "선택"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-red-600 px-4 py-2 bg-red-50/60">
                        선택하지 않으면 [권한관리]에 먼저 등록된 계정으로 임의 연결되어, 공문의 연락처·이메일이 다른 사람 것으로 나갈 수 있습니다.
                      </p>
                    </div>
                  )}

                  {/* 과제담당자(정)/(부) 이름이 [권한관리]에 아예 없는 경우 — 오탈자거나 아직 등록 안 된
                      직원일 수 있다. 이름만으로 등록하면 공문 발송 시 연락처를 못 찾으니, 실제 [권한관리]
                      계정을 사람이 직접 골라야 한다. */}
                  {managerNotFound.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-red-50 flex items-center gap-1.5">
                        <FiAlertOctagon size={13} className="text-red-500 shrink-0" />
                        <p className="text-xs font-semibold text-red-700">
                          [권한관리]에 없는 과제담당자 ({managerNotFound.length}명) — 실제 계정을 선택해주세요
                        </p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {managerNotFound.map((name) => {
                          const resolvedId = managerNameResolutions[name];
                          const resolvedUser = resolvedId ? users.find((u) => u.id === resolvedId) : undefined;
                          return (
                            <div key={name} className="flex items-center gap-3 px-4 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700">
                                  {name} <span className="text-[10px] text-slate-400">[권한관리]에 등록되지 않음</span>
                                </p>
                                {resolvedUser ? (
                                  <p className="text-[11px] text-emerald-600">선택됨 · {resolvedUser.name} ({resolvedUser.email})</p>
                                ) : (
                                  <p className="text-[11px] text-red-600">실제 담당자가 아직 선택되지 않았습니다</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => onResolveManagerName(name)}
                                className={`shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                  resolvedUser ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                              >
                                {resolvedUser ? "다시 선택" : "선택"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-red-600 px-4 py-2 bg-red-50/60">
                        엑셀에 적힌 이름과 [권한관리]에 등록된 이름이 정확히 일치해야 공문 발송 시 연락처가 자동으로 연동됩니다.
                        오탈자라면 실제 계정을 선택하고, 아직 [권한관리]에 등록되지 않은 직원이라면 먼저 등록한 뒤 다시 골라주세요.
                      </p>
                    </div>
                  )}

                  {/* 기존 과제 갱신 — 재제출 등 확인이 특히 중요해 이 탭 안에서도 맨 위에 보여준다 */}
                  {projectUpdates.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-slate-50 flex items-center gap-1.5">
                        <FiRefreshCw size={13} className="text-slate-400 shrink-0" />
                        <p className="text-xs font-semibold text-slate-700">기존 과제 갱신 ({projectUpdates.length}건)</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {projectUpdates.map((u) => {
                          const checked = updateChoices[u.normNum] ?? defaultChoiceForStatus(u.status);
                          const badge = STATUS_BADGE[u.status];
                          return (
                            <label key={u.normNum} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => onToggleUpdate(u.normNum, e.target.checked)}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-slate-700 truncate">{u.projectName}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{u.projectNumber}</p>
                                {u.stageChanged && !checked && (
                                  <p className="text-[10px] text-blue-500">단계 구조 변경 있음 — 연차 체크와 무관하게 자동 반영됩니다</p>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 shrink-0">{u.currentTerm}연차 → {u.excelTerm}연차</span>
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 중복/유사 경고 — 같은 기관·과제·전담기관이 여러 행에 걸쳐 나와도 유형+key당 한 번만 표시 */}
                  {dedupedDuplicates.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-amber-50 flex items-center gap-1.5">
                        <FiAlertTriangle size={13} className="text-amber-500 shrink-0" />
                        <p className="text-xs font-semibold text-amber-700">중복/유사 항목 ({dedupedDuplicates.length}건) — 등록에서 자동 제외됩니다</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {dedupedDuplicates.map((d, j) => (
                          <div key={j} className="px-4 py-2">
                            <p className="text-[11px] text-slate-600">
                              <span className="font-medium text-slate-700">{d.type === "agency" ? "전담기관" : d.type === "project" ? "과제" : "기관"}</span>
                              {" · "}{d.label ? `${d.label} (${d.key})` : d.key}
                              {d.status === "similar"
                                ? ` — 유사 ${d.score}% (기존 "${d.existing}"와 비교)`
                                : d.type === "agency"
                                  ? " — 이미 등록됨"
                                  : ` — 이미 등록됨 (기존 "${d.existing}"과 동일)`}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 단계기관별 시트 행 중 값 문제로 단계 구조 계산에서 제외된 것들 */}
                  {stageSkipWarnings.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-red-50 flex items-center gap-1.5">
                        <FiAlertOctagon size={13} className="text-red-500 shrink-0" />
                        <p className="text-xs font-semibold text-red-700">단계 구조 일부 제외됨 ({stageSkipWarnings.length}개 과제) — &quot;단계기관별&quot; 시트 값 확인 필요</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {stageSkipWarnings.map((w) => (
                          <div key={w.normNum} className="px-4 py-2.5">
                            <p className="text-xs font-medium text-red-700">{w.projectName} <span className="font-mono text-[10px] text-red-500">({w.projectNumber})</span></p>
                            {w.reasons.map((r, i) => (
                              <p key={i} className="text-[10px] text-red-600 pl-2 mt-0.5">· {r}</p>
                            ))}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-red-600 px-4 py-2 bg-red-50/60">
                        위 행은 단계 정보 없이 등록되니, 필요하면 엑셀에서 값을 고쳐 다시 업로드해주세요. 그대로 등록해도 담당자·회계담당자에게 확인 이슈가 남습니다.
                      </p>
                    </div>
                  )}

                  {/* 연차 확인 필요 — 엑셀 연차값과 총개발시작일자 기준 캘린더 계산이 다른 과제 */}
                  {calendarMismatches.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-amber-50 flex items-center gap-1.5">
                        <FiCalendar size={13} className="text-amber-500 shrink-0" />
                        <p className="text-xs font-semibold text-amber-700">연차 확인 필요 ({calendarMismatches.length}건) — 엑셀 연차와 시작일 기준 계산이 다릅니다</p>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {calendarMismatches.map((m) => (
                          <div key={m.normNum} className="flex items-center gap-2 px-4 py-2 text-[11px] text-slate-600">
                            <span className="font-mono text-[10px] text-slate-400 shrink-0">{m.projectNumber}</span>
                            <span className="truncate">{m.projectName}</span>
                            <span className="ml-auto shrink-0 whitespace-nowrap text-slate-500">엑셀 {m.excelTerm}연차 · 시작일 기준 계산 {m.calendarTerm}연차</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 px-4 py-2 bg-slate-50">
                        엑셀에 적힌 연차값 그대로 등록됩니다. 일정보다 빠르거나 늦게 진행 중이라면 문제 없지만, 연차 값이나
                        총개발시작일자가 잘못 입력됐을 수도 있습니다 — 그대로 등록하면 담당자·회계담당자에게 확인 이슈가 자동으로 남습니다.
                      </p>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 shrink-0">
          참여기관까지 등록되어야 해당 과제의 연차 수수료가 자동으로 계산됩니다.
        </p>
      </div>

      {totalNew === 0 && approvedUpdateCount === 0 && (
        <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 mt-4">
          등록하거나 반영할 항목이 없습니다.
        </div>
      )}

      {(unresolvedManagerAmbiguities.length > 0 || unresolvedManagerNotFound.length > 0) && (
        <p className="shrink-0 text-xs text-red-600 mt-2">
          과제담당자 {unresolvedManagerAmbiguities.length + unresolvedManagerNotFound.length}명을 선택해야 등록할 수 있습니다 — 위 &quot;확인필요&quot; 탭에서 선택해주세요.
        </p>
      )}
      <div className="shrink-0 flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <div className="flex items-center gap-3">
          {totalToRegister > 0 && !loading && (
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              전담기관 {newAgency} · 과제 {newProject} · 기관 {newInst} · 참여기관 {newMemberCount}
              {approvedUpdateCount > 0 ? ` · 과제갱신 ${approvedUpdateCount}` : ""}
            </span>
          )}
          <button
            onClick={onConfirm}
            disabled={loading || (totalNew === 0 && approvedUpdateCount === 0) || unresolvedManagerAmbiguities.length > 0 || unresolvedManagerNotFound.length > 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {loading ? "등록 중..." : <><FiCheckCircle size={14} /> {totalToRegister}건 등록</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 완료 ────────────────────────────────────────────────────────

interface DoneResult {
  agency: number;
  project: number;
  inst: number;
  member: number;
  memberUpdated: number;
  projectAdvanced: number;
  stageAlerts: number;
  renamed: number;
  // 낙관적으로는 등록됐지만(위 카운트에 포함됨) 실제 서버 저장이 실패한 건수 — 대량 업로드 중
  // 일부 요청이 실패해도 화면상 카운트만으로는 알 수 없어 별도로 안내한다.
  syncFailures: number;
}

function DoneStep({ result, onClose }: { result: DoneResult; onClose: () => void }) {
  return (
    <div className="h-full overflow-y-auto p-6 flex flex-col items-center justify-center gap-4">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-800">등록 완료</p>
      <div className="grid grid-cols-4 gap-3 w-full">
        {[
          { label: "전담기관", count: result.agency },
          { label: "과제", count: result.project },
          { label: "기관", count: result.inst },
          { label: "참여기관", count: result.member },
        ].map((c) => (
          <div key={c.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className="text-xl font-bold text-slate-800">{c.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
      {(result.memberUpdated > 0 || result.projectAdvanced > 0) && (
        <div className="grid grid-cols-2 gap-3 w-full">
          <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3 text-center">
            <p className="text-xl font-bold text-blue-700">{result.projectAdvanced}</p>
            <p className="text-xs text-slate-500 mt-0.5">다음 연차로 진행된 과제</p>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-100 px-4 py-3 text-center">
            <p className="text-xl font-bold text-blue-700">{result.memberUpdated}</p>
            <p className="text-xs text-slate-500 mt-0.5">갱신된 참여기관</p>
          </div>
        </div>
      )}
      {result.member > 0 && (
        <p className="text-[11px] text-slate-400 -mt-2">참여기관이 등록된 과제는 연차 수수료가 자동으로 계산되었습니다.</p>
      )}
      {result.projectAdvanced > 0 && (
        <p className="text-[11px] text-slate-400 -mt-2">연차/참여기관 변경 내역은 각 과제의 변경이력에서 확인할 수 있습니다.</p>
      )}
      {result.renamed > 0 && (
        <div className="w-full rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-700">
          <p className="font-semibold">과제번호 변경 반영 — {result.renamed}건</p>
          <p className="mt-0.5 text-blue-600">
            과제코드 또는 과제명·시작일·종료일이 같아 기존 과제로 판단해 과제번호만 새로 갱신했습니다(새 과제로 만들지 않음).
            이전 과제번호는 각 과제의 변경이력에서 확인할 수 있습니다.
          </p>
        </div>
      )}
      {result.syncFailures > 0 && (
        <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <p className="font-semibold">서버 저장 실패 — {result.syncFailures}건</p>
          <p className="mt-0.5 text-red-600">
            화면에는 반영됐지만 서버에는 저장되지 못한 항목이 있습니다(네트워크 오류 또는 서버 처리 실패).
            잠시 후 새로고침해 값이 그대로 남아있는지 확인하고, 사라진 항목이 있으면 해당 부분만 다시 업로드해주세요.
          </p>
        </div>
      )}
      {result.stageAlerts > 0 && (
        <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <p className="font-semibold">확인 필요 — {result.stageAlerts}개 과제</p>
          <p className="mt-0.5 text-amber-600">
            단계 구조 값이 비어있거나, 같은 과제인데 행마다 과제코드·과제담당자·연구책임자 등이 서로 달라 자동으로 채우지 못했거나,
            과제번호가 바뀐 것 같은데 기존 과제 후보가 여러 개라 자동으로 연결하지 못했거나, 동일/과거 연차가 재제출됐거나,
            엑셀 연차값과 총개발시작일자 기준 계산이 서로 다른 과제입니다.
            해당 과제 담당자·회계담당자에게 이슈로 등록해뒀으니, 과제 상세 페이지에서 직접 확인해주세요.
          </p>
        </div>
      )}
      <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
        닫기
      </button>
    </div>
  );
}

// ============================================================
// 양식 다운로드 — exceljs로 생성한다(xlsx 무료버전은 색상·드롭다운을 저장하지 못함).
// 업로드(읽기) 쪽은 계속 xlsx를 쓰고, 여기 "쓰기" 전용으로만 exceljs를 쓴다.
// ============================================================

// "연차별기관별_연구비 집행" 시트의 안내문구·헤더 — 빈 양식 다운로드와 "현재 데이터로 채운 양식"
// 다운로드(downloadCurrentDataAsUploadTemplate) 양쪽에서 그대로 공유한다. 둘이 각자 따로 관리하면
// 필드가 하나 추가/변경될 때 한쪽만 고치고 잊어버려서 두 파일의 컬럼이 어긋나는 사고가 나기 쉽다.
const ANNUAL_SHEET_NOTES = [
  "※필수", "※필수", "※필수",
  "선택", "선택", "선택 (\"자율성트랙\"만 인식)",
  "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
  "선택", "※필수 (이 행의 사업비가 몇 연차 것인지 — 비면 1연차로 잘못 등록됨)", "선택",
  "※필수", "※필수 (하이픈 없이 숫자만 입력해도 등록 시 000-00-00000 형식으로 자동 변환됨)",
  "선택 (주관/공동/위탁)", "선택 (최우수(S)/우수(A)/우수(B)/우수(C)/일반, 미입력시 등급 없음)", "선택 (위탁정산/자체정산)",
  "선택 (삼화가 아니면 이 연차를 타회계법인 진행으로 자동 표시)",
  "※필수 (연차상시/정산 — \"정산형태\"와는 다른 값)",
  "선택 (주관기관 행에만, 없으면 단계기관별 시트의 값을 사용)",
  "선택 (주관기관 행에만 — 여러 명이면 콤마(,)로 구분, 정산절차 안내 공문에 실무자와 함께 수신)",
  "선택 (이 행 기관의 담당자 이름 — 실무자 메일주소와 함께 입력)",
  "선택 (이 행 기관의 담당자 — 여러 명이면 콤마(,)로 구분, 정산절차 안내 공문 외 모든 공문 수신)",
  "선택 (YYYY-MM-DD)", "선택 (YYYY-MM-DD)",
  "※필수 (YYYY-MM-DD, 이 연차의 실제 시작일 — 빈칸이면 공동기관을 인식하지 못할 수 있음)",
  "※필수 (YYYY-MM-DD, 이 연차의 실제 종료일 — 빈칸이면 공동기관을 인식하지 못할 수 있음)",
  "※필수 (YYYY-MM-DD, 이 단계의 실제 시작일 — 빈칸이면 공동기관을 인식하지 못할 수 있음)", "※필수 (YYYY-MM-DD, 이 단계의 실제 종료일 — 빈칸이면 공동기관을 인식하지 못할 수 있음)",
  "※필수 (이 연차 현금사업비 — 참여기관별·연차별 사업비. 비면 이 연차엔 참여 안 함으로 처리됨)",
  "선택 (이 연차 현물사업비 — 있으면 아래 \"현물사업비총액\"보다 우선)",
  "선택 (이 연차 정부출연금 — 과제의 당해 정부출연금 합산에 사용)",
  "선택 (이 연차 민간현금 — 과제의 당해 민간현금 합산에 사용)",
  "선택 (이 연차 민간현물 — 과제의 당해 민간현물 합산에 사용)",
  "선택 (원 단위, 위 \"연차_기관_총사업비(현금)\"이 없을 때만 쓰는 대체값)", "선택 (원 단위, 위 \"연차_기관_총사업비(현물)\" 없을 때만 사용)",
];
const ANNUAL_SHEET_HEADERS = [
  "전문기관명", "과제번호", "과제명",
  "과제담당자(정)", "과제담당자(부)", "자율성트랙",
  "총개발시작일자", "총개발종료일자",
  "단계", "연차", "지원연도",
  "연구개발기관명", "기관사업자등록번호",
  "기관역할구분", "등급", "정산형태", "회계법인",
  "과제구분", "연구책임자",
  "책임자 메일주소", "실무자명", "실무자 메일주소",
  "전문기관배정일", "내부배정일",
  "연차시작일자", "연차종료일자",
  "단계시작일자", "단계종료일자",
  "연차_기관_총사업비(현금)", "연차_기관_총사업비(현물)",
  "연차_기관_정부출연금", "연차_기관_민간부담금(현금)", "연차_기관_민간부담금(현물)",
  "현금사업비총액", "현물사업비총액",
];

// 위 헤더 컬럼 순서에 맞춰 워크시트에 스타일(색상·드롭다운)까지 적용한다 — 빈 양식/데이터 채운 양식
// 양쪽에서 동일하게 쓴다.
function styleAnnualSheet(ws: ExcelJS.Worksheet) {
  ANNUAL_SHEET_HEADERS.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
  styleTemplateHeader(ws, ANNUAL_SHEET_NOTES, 2);
  styleTemplateDataRows(ws, 3, 2 + TEMPLATE_BLANK_ROWS, ANNUAL_SHEET_HEADERS.length);
  applyDropdown(ws, ANNUAL_SHEET_HEADERS.indexOf("자율성트랙") + 1, ["", "자율성트랙"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, ANNUAL_SHEET_HEADERS.indexOf("기관역할구분") + 1, ["주관", "공동", "위탁"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, ANNUAL_SHEET_HEADERS.indexOf("등급") + 1, ["최우수(S)", "우수(A)", "우수(B)", "우수(C)", "일반", ""], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, ANNUAL_SHEET_HEADERS.indexOf("정산형태") + 1, ["위탁정산", "자체정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, ANNUAL_SHEET_HEADERS.indexOf("과제구분") + 1, ["", "연차상시", "정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
}

const STAGE_SHEET_NOTES = [
  "※필수", "선택", "※필수", "※필수",
  "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
  "※필수 (0=일괄협약, 1 이상=단계협약)", "※필수 (연차 숫자)", "※필수 (시작단계와 동일해야 함)", "※필수 (연차 숫자)",
  "선택 (YYYY-MM-DD, 이 단계의 실제 시작일)", "선택 (YYYY-MM-DD, 이 단계의 실제 종료일)",
  "선택",
  "※필수", "※필수 (하이픈 없이 숫자만 입력해도 등록 시 000-00-00000 형식으로 자동 변환됨)", "※필수 (주관/공동/위탁)", "선택 (최우수(S)/우수(A)/우수(B)/우수(C)/일반)", "선택 (주관기관 행에만)",
  "※필수 (원 단위)", "선택 (원 단위)",
];
const STAGE_SHEET_HEADERS = [
  "전문기관명", "RCMS사업명", "과제번호", "과제명",
  "총개발시작일자", "총개발종료일자",
  "정산대상시작단계", "정산대상시작연차", "정산대상종료단계", "정산대상종료연차",
  "단계시작일자", "단계종료일자",
  "정산형태구분",
  "연구기관명", "기관사업자등록번호", "기관역할구분", "기관등급", "연구책임자",
  "기관_총사업비(현금)", "기관_총사업비(현물)",
];

// 위 헤더 컬럼 순서에 맞춰 워크시트에 스타일(색상·드롭다운)까지 적용한다 — 빈 양식/데이터 채운 양식
// 양쪽에서 동일하게 쓴다.
function styleStageSheet(ws: ExcelJS.Worksheet) {
  STAGE_SHEET_HEADERS.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
  styleTemplateHeader(ws, STAGE_SHEET_NOTES, 2);
  styleTemplateDataRows(ws, 3, 2 + TEMPLATE_BLANK_ROWS, STAGE_SHEET_HEADERS.length);
  applyDropdown(ws, STAGE_SHEET_HEADERS.indexOf("정산형태구분") + 1, ["위탁정산", "자체정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, STAGE_SHEET_HEADERS.indexOf("기관역할구분") + 1, ["주관", "공동", "위탁"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, STAGE_SHEET_HEADERS.indexOf("기관등급") + 1, ["최우수(S)", "우수(A)", "우수(B)", "우수(C)", "일반", ""], 3, 2 + TEMPLATE_BLANK_ROWS);
}

// 참여기관 소속 여부와 무관하게, 이 과제의 절대 연차(termNumber)가 속한 단계 번호를 구한다 —
// 일괄협약(BATCH)이면 항상 "0"(연차별기관별 시트에서 단계 없음을 나타내는 관례).
function resolveStageNumberForTerm(project: Pick<Project, "agreementType" | "stages">, termNumber: number): string {
  const isBatch = !project.agreementType || project.agreementType === "BATCH";
  if (isBatch) return "0";
  const stage = project.stages?.find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
  return stage ? String(stage.stageNumber) : "";
}

// ROLE_LABEL: ProjectMember.role → "기관역할구분" 컬럼 값(업로드 파서 buildMemberAggregates가 이미
// "주관"/"위탁"만 문자열 포함으로 구분하고 나머지는 전부 "공동"(PARTICIPANT)으로 취급하므로 그대로 맞춘다.
const ROLE_LABEL: Record<ProjectMember["role"], string> = { LEAD: "주관", ENTRUSTED: "위탁", PARTICIPANT: "공동" };

// 현재 등록된 과제·참여기관·연차별 사업비 데이터를 "연차별기관별_연구비 집행" 업로드 양식과 똑같은
// 컬럼 구조로 채워 넣는다 — 빈 양식(downloadExcelTemplate)과 헤더가 완전히 동일해서 그대로 다시
// 업로드할 수 있다. "엑셀 다운로드"(수수료청구관리 리포트, 과제 단위 요약)와는 목적이 다르다 — 리포트는
// 계산서·수금 현황을 보여주는 결과물이고, 이건 참여기관×연차 단위로 사업비·등급·정산형태 등 RCMS가
// 실제로 입력받는 원본 데이터를 그대로 다시 꺼낸 것이라 재업로드에 필요한 필수값이 전부 채워져 있다.
function buildAnnualSheetRowsFromData(
  projects: Project[],
  projectMembers: ProjectMember[],
  institutions: Institution[],
  fundingAgencies: FundingAgency[],
): string[][] {
  const rows: string[][] = [];
  for (const project of projects) {
    const members = projectMembers.filter((m) => m.projectId === project.id);
    if (members.length === 0) continue;
    const agencyName = fundingAgencies.find((a) => a.id === project.agencyId)?.name ?? project.agency ?? "";
    // 이 과제에서 실제로 사업비가 입력된 연차 전체(참여기관 아무나 하나라도 그 연차 데이터가 있으면 포함).
    const termNumbers = Array.from(new Set(members.flatMap((m) => (m.annualBudgets ?? []).map((b) => b.termNumber)))).sort((a, b) => a - b);
    for (const termNumber of termNumbers) {
      // 그 연차 안에서는 항상 주관기관 행을 먼저 — 과제담당자·연구책임자·전문기관배정일처럼 "주관기관
      // 행에만 채우는" 컬럼들을 빈 양식 예시와 동일한 방식으로 보여주기 위함(가독성 목적, 파서는
      // 행 순서를 가리지 않는다).
      const sortedMembers = [...members].sort((a, b) => (a.role === "LEAD" ? -1 : b.role === "LEAD" ? 1 : 0));
      for (const member of sortedMembers) {
        const ab = member.annualBudgets?.find((b) => b.termNumber === termNumber);
        if (!ab) continue;
        const isLead = member.role === "LEAD";
        const institution = institutions.find((i) => i.id === member.institutionId);
        const grade = resolveMemberGradeForTerm(member, termNumber);
        const settlementType = resolveMemberSettlementTypeForTerm(member, termNumber, project.autonomySettlementType ?? "자체정산");
        const recipient = resolveMemberRecipientForTerm(member, termNumber);
        const lead = isLead ? resolveResearchLeadForTerm(project, termNumber) : { name: "", email: "" };
        const termRange = resolveTermDateRange(project, termNumber);
        const stageForTerm = project.stages?.find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
        const annualFinancialsForTerm = project.annualFinancials?.find((f) => f.termNumber === termNumber);
        // annualFinancials 이력 배열은 RCMS 업로드를 거쳐야 채워진다 — currentTerm은 이력이 없어도
        // Project.govGrant 등 "당해" 스칼라 필드에 항상 값이 있으므로 그걸 대체값으로 쓴다.
        const isCurrentTerm = termNumber === project.currentTerm;
        const govGrantValue = annualFinancialsForTerm?.govGrant ?? (isCurrentTerm ? project.govGrant : undefined);
        const privateCashValue = annualFinancialsForTerm?.privateCash ?? (isCurrentTerm ? project.privateCash : undefined);
        const privateInKindValue = annualFinancialsForTerm?.privateInKind ?? (isCurrentTerm ? project.privateInKind : undefined);
        rows.push([
          agencyName,
          project.projectNumber,
          project.projectName,
          project.assignedManagerPrimary ?? "",
          project.assignedManager ?? "",
          project.projectType === "AUTONOMY_TRACK" ? "자율성트랙" : "",
          project.firstStartDate ?? project.startDate ?? "",
          project.finalEndDate ?? project.endDate ?? "",
          resolveStageNumberForTerm(project, termNumber),
          String(termNumber),
          String(ab.termYear ?? ""),
          member.institutionName,
          institution?.bizNumber ?? "",
          ROLE_LABEL[member.role],
          grade === "일반" ? "" : grade,
          settlementType,
          ab.auditFirm ?? "",
          isSettlementTerm(project, termNumber) ? "정산" : "연차상시",
          lead.name,
          lead.email,
          recipient.recipientName,
          recipient.recipientEmail,
          isLead ? (project.agencyAssignedAt ?? "") : "",
          isLead ? (project.internalAssignedAt ?? "") : "",
          ab.termStartDate ?? termRange.start ?? "",
          ab.termEndDate ?? termRange.end ?? "",
          stageForTerm?.stageStartDate ?? "",
          stageForTerm?.stageEndDate ?? "",
          String(ab.cashBudget ?? 0),
          String(ab.inKindBudget ?? 0),
          isLead ? String(govGrantValue ?? "") : "",
          isLead ? String(privateCashValue ?? "") : "",
          isLead ? String(privateInKindValue ?? "") : "",
          "",
          "",
        ]);
      }
    }
  }
  return rows;
}

// 한 단계(또는 일괄협약이면 전체 기간을 나타내는 "0단계") 안의 참여기관들을 "단계기관별" 시트
// 한 행씩으로 채운다. repTerm은 정산형태·등급·연구책임자처럼 연차별로 달라질 수 있는 값을 조회할
// 때 쓸 대표 연차(그 단계의 시작 연차) — 이 시트는 연차별 이력을 담지 않는 스냅샷이라 대표값 하나만 싣는다.
function buildStageSheetRows(
  project: Project,
  sortedMembers: ProjectMember[],
  institutions: Institution[],
  agencyName: string,
  stageNumber: number,
  relStartTerm: number,
  relEndTerm: number,
  stageStartDate: string,
  stageEndDate: string,
  repTerm: number,
): string[][] {
  return sortedMembers.map((member) => {
    const isLead = member.role === "LEAD";
    const institution = institutions.find((i) => i.id === member.institutionId);
    const grade = resolveMemberGradeForTerm(member, repTerm);
    const settlementType = resolveMemberSettlementTypeForTerm(member, repTerm, project.autonomySettlementType ?? "자체정산");
    const lead = isLead ? resolveResearchLeadForTerm(project, repTerm) : { name: "", email: "" };
    const totalCash = (member.annualBudgets ?? []).reduce((sum, b) => sum + (b.cashBudget ?? 0), 0);
    const totalInKind = (member.annualBudgets ?? []).reduce((sum, b) => sum + (b.inKindBudget ?? 0), 0);
    return [
      agencyName, "", project.projectNumber, project.projectName,
      project.firstStartDate ?? project.startDate ?? "", project.finalEndDate ?? project.endDate ?? "",
      String(stageNumber), String(relStartTerm), String(stageNumber), String(relEndTerm),
      stageStartDate, stageEndDate,
      settlementType,
      member.institutionName, institution?.bizNumber ?? "", ROLE_LABEL[member.role],
      grade === "일반" ? "" : grade,
      lead.name,
      String(totalCash), String(totalInKind),
    ];
  });
}

// 현재 등록된 과제·참여기관 데이터를 "단계기관별" 업로드 양식과 동일한 컬럼 구조로 채운다.
// 정산대상시작/종료연차는 그 단계 안에서 1부터 다시 세는 상대값으로 적어야 재업로드 시
// resolveStageStructure가 같은 절대연차 범위로 복원한다(컬럼 정의 참고: computeStageOffsets).
// 단계협약(Project.stages)이 없는 과제(일괄협약)는 "0단계" 행 하나로 전체 연차(1~totalTerms)를 나타낸다.
function buildStageSheetRowsFromData(
  projects: Project[],
  projectMembers: ProjectMember[],
  institutions: Institution[],
  fundingAgencies: FundingAgency[],
): string[][] {
  const rows: string[][] = [];
  for (const project of projects) {
    const members = projectMembers.filter((m) => m.projectId === project.id);
    if (members.length === 0) continue;
    const agencyName = fundingAgencies.find((a) => a.id === project.agencyId)?.name ?? project.agency ?? "";
    const sortedMembers = [...members].sort((a, b) => (a.role === "LEAD" ? -1 : b.role === "LEAD" ? 1 : 0));

    if (project.stages && project.stages.length > 0) {
      const sortedStages = [...project.stages].sort((a, b) => a.stageNumber - b.stageNumber);
      let offset = 0;
      for (const stage of sortedStages) {
        const relStart = stage.startTermNumber - offset;
        const relEnd = stage.endTermNumber - offset;
        offset += stage.endTermNumber - stage.startTermNumber + 1;
        rows.push(...buildStageSheetRows(
          project, sortedMembers, institutions, agencyName,
          stage.stageNumber, relStart, relEnd, stage.stageStartDate ?? "", stage.stageEndDate ?? "", stage.startTermNumber,
        ));
      }
    } else {
      rows.push(...buildStageSheetRows(
        project, sortedMembers, institutions, agencyName,
        0, 1, project.totalTerms, "", "", 1,
      ));
    }
  }
  return rows;
}

// [수수료 청구 관리] "엑셀 다운로드" 버튼이 쓰는 함수 — 현재 등록된 참여기관×연차(+단계) 데이터를
// RCMS 업로드 양식 그대로의 컬럼으로 채워서 내려받는다. 이 파일은 수정 후 그대로(또는 일부만 고쳐서)
// 다시 "RCMS 엑셀 업로드"에 올릴 수 있다.
export async function downloadCurrentDataAsUploadTemplate(
  projects: Project[],
  projectMembers: ProjectMember[],
  institutions: Institution[],
  fundingAgencies: FundingAgency[],
) {
  const rows = buildAnnualSheetRowsFromData(projects, projectMembers, institutions, fundingAgencies);
  const stageRows = buildStageSheetRowsFromData(projects, projectMembers, institutions, fundingAgencies);
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("연차별기관별_연구비 집행", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow(ANNUAL_SHEET_NOTES);
  ws.addRow(ANNUAL_SHEET_HEADERS);
  rows.forEach((r) => ws.addRow(r));
  styleAnnualSheet(ws);

  const stageWs = wb.addWorksheet("단계기관별", { views: [{ state: "frozen", ySplit: 2 }] });
  stageWs.addRow(STAGE_SHEET_NOTES);
  stageWs.addRow(STAGE_SHEET_HEADERS);
  stageRows.forEach((r) => stageWs.addRow(r));
  styleStageSheet(stageWs);

  await downloadWorkbook(wb, `RCMS_업로드_양식_현재데이터_${todayKST()}.xlsx`);
}

export async function downloadExcelTemplate() {
  const notes = ANNUAL_SHEET_NOTES;
  const headers = ANNUAL_SHEET_HEADERS;
  const rows = [
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "정담당", "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "삼화기술경영(주)", "123-45-67890",
      "주관", "우수(A)", "위탁정산", "",
      "연차상시", "박연구",
      "park.lead@samhwa-tech.co.kr", "김실무", "kim.staff@samhwa-tech.co.kr,lee.staff@samhwa-tech.co.kr",
      "2024-01-15", "2024-02-01",
      "2024-03-01", "2025-02-28",
      "2024-03-01", "2027-02-28",
      "500000000", "0",
      "400000000", "100000000", "0",
      "500000000", "0",
    ],
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "정담당", "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "참여기업(주)", "234-56-78901",
      "공동", "", "위탁정산", "",
      "연차상시", "",
      "", "박실무", "staff@participant.co.kr",
      "", "",
      "2024-03-01", "2025-02-28",
      "2024-03-01", "2027-02-28",
      "200000000", "0",
      "150000000", "50000000", "0",
      "200000000", "0",
    ],
    [
      "한국에너지기술평가원", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "박정담", "김담당", "자율성트랙",
      "2024-06-01", "2026-05-31", "0", "1", "2024",
      "에너지연구소", "345-67-89012",
      "주관", "최우수(S)", "자체정산", "",
      "연차상시", "이연구",
      "lee.lead@energylab.re.kr", "정실무", "jung.staff@energylab.re.kr",
      "2024-04-20", "2024-05-10",
      "2024-06-01", "2025-05-31",
      "", "",
      "800000000", "0",
      "700000000", "100000000", "0",
      "800000000", "0",
    ],
  ];

  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("연차별기관별_연구비 집행", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow(notes);
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  styleAnnualSheet(ws);

  const stageRows = [
    [
      "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "2024-03-01", "2027-02-28", "위탁정산",
      "삼화기술경영(주)", "123-45-67890", "주관", "일반", "홍길동", "500000000", "0",
    ],
    [
      "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "2024-03-01", "2027-02-28", "위탁정산",
      "참여기업(주)", "234-56-78901", "공동", "우수(B)", "", "200000000", "0",
    ],
    [
      "한국에너지기술평가원", "신재생에너지핵심기술개발", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "2024-06-01", "2026-05-31", "0", "1", "0", "4", "2024-06-01", "2026-05-31", "위탁정산",
      "에너지연구소", "345-67-89012", "주관", "최우수(S)", "박연구", "800000000", "50000000",
    ],
  ];

  const stageWs = wb.addWorksheet("단계기관별", { views: [{ state: "frozen", ySplit: 2 }] });
  stageWs.addRow(STAGE_SHEET_NOTES);
  stageWs.addRow(STAGE_SHEET_HEADERS);
  stageRows.forEach((r) => stageWs.addRow(r));
  styleStageSheet(stageWs);

  await downloadWorkbook(wb, "RCMS_업로드_양식.xlsx");
}

// 워크북에서 특정 시트 하나를 골라 헤더 행을 찾고 컬럼을 매핑한다 — 시트명으로 자동 인식됐을 때든,
// (RCMS가 아닌 다른 시스템 파일이라) 사람이 직접 "이 시트를 OO로 쓰겠다"고 지정했을 때든 동일하게 쓴다.
function parseSheetToParsedSheet(wb: XLSX.WorkBook, sheetName: string, def: SheetDef): ParsedSheet {
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  // 양식 다운로드 파일의 1행(※필수/선택 안내)을 자동 건너뜀
  const firstRow = (raw[0] as unknown[] ?? []).map((c) => String(c ?? "").trim());
  const headerRowIdx = firstRow.some((c) => c.includes("필수") || c.includes("선택")) ? 1 : 0;
  const headerRow = (raw[headerRowIdx] as unknown[] ?? []).map((c) => String(c ?? "").trim());
  const dataRows = raw.slice(headerRowIdx + 1).map((r) => {
    const row: Record<string, string> = {};
    headerRow.forEach((h, i) => { row[h] = String((r as unknown[])[i] ?? "").trim(); });
    return row;
  }).filter((r) => Object.values(r).some((v) => v !== ""));
  const { mapping, unknown } = buildColumnMapping(def, headerRow);
  return { sheetName, def, headers: headerRow, rows: dataRows, mapping, unknown };
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function ExcelUploadModal({ onClose }: { onClose: () => void }) {
  const { fundingAgencies, institutions, projects, projectMembers, users, termFees } = useStore();
  const [step, setStep] = useState<Step>("upload");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [matchedSheets, setMatchedSheets] = useState<{ sheetName: string; def: SheetDef }[]>([]);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [doneResult, setDoneResult] = useState<DoneResult>({ agency: 0, project: 0, inst: 0, member: 0, memberUpdated: 0, projectAdvanced: 0, stageAlerts: 0, renamed: 0, syncFailures: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBackStep, setPreviewBackStep] = useState<Step>("mapping");
  const [projectUpdateChoices, setProjectUpdateChoices] = useState<Record<string, boolean>>({});
  // 엑셀에 적힌 과제담당자(정)/(부) 이름이 [권한관리]에 동명이인으로 등록돼 있으면, 이름만으로는
  // 어느 계정인지 특정할 수 없다 — 등록 전 미리보기에서 사람이 직접 골라 이름별로 해소한다
  // (한 이름이 여러 과제에 걸쳐 나와도 같은 사람일 가능성이 높으므로 이름 단위로 한 번만 고르면 된다).
  const [managerNameResolutions, setManagerNameResolutions] = useState<Record<string, string>>({});
  const [managerPickerName, setManagerPickerName] = useState<string | null>(null);

  // "단계기관별" 시트의 정산대상시작/종료단계·연차 값으로 과제별 단계 구조(Project.stages)를 추정
  // — 아래 buildMemberAggregates가 "연차별기관별" 시트의 상대연차를 절대연차로 바꾸는 데 이 결과가 필요하므로 먼저 계산한다.
  const stageAggregates = useMemo(() => {
    const map = buildStageAggregates(parsedSheets);
    supplementStageDatesFromAnnual(parsedSheets, map);
    return map;
  }, [parsedSheets]);

  // "연차별기관별" + "단계기관별" 시트를 과제+기관 단위로 합산 — 참여기관(ProjectMember) 등록에 사용
  const { members: memberAggregates, projectMaxTerm } = useMemo(
    () => buildMemberAggregates(parsedSheets, institutions),
    [parsedSheets, institutions]
  );

  // 과제담당자·자율성트랙·과제코드·연구책임자 등 과제 레벨 단일값 — 여러 행에 값이 갈리면 등록하지 않고 이슈로 남긴다
  const scalarAggregates = useMemo(() => buildProjectScalarAggregates(parsedSheets), [parsedSheets]);

  // 엑셀에 등장하는 과제담당자(정)/(부) 이름을 [권한관리] 목록과 대조 — 동명이인(2명 이상 일치)이거나
  // 아예 등록되지 않은 이름(0명 일치, 오탈자거나 신규 입사자 등)이면 이름만으로는 실제 어느 계정인지
  // 또는 존재하는지조차 알 수 없다. 등록 전 미리보기에서 사람이 직접 골라야 공문 발송 시 연락처
  // 자동 연동이 정확해진다.
  const { managerAmbiguities, managerNotFound } = useMemo(() => {
    const names = new Set<string>();
    for (const info of scalarAggregates.values()) {
      for (const n of info.assignedManagers) names.add(n);
      for (const n of info.assignedManagersByTerm.values()) names.add(n);
      for (const n of info.assignedManagersPrimary) names.add(n);
      for (const n of info.assignedManagersPrimaryByTerm.values()) names.add(n);
    }
    const ambiguities: { name: string; candidates: SystemUser[] }[] = [];
    const notFound: string[] = [];
    for (const name of names) {
      const candidates = users.filter((u) => u.name === name);
      if (candidates.length >= 2) ambiguities.push({ name, candidates });
      else if (candidates.length === 0) notFound.push(name);
    }
    return {
      managerAmbiguities: ambiguities.sort((a, b) => a.name.localeCompare(b.name)),
      managerNotFound: notFound.sort((a, b) => a.localeCompare(b)),
    };
  }, [scalarAggregates, users]);
  const unresolvedManagerAmbiguities = managerAmbiguities.filter((a) => !managerNameResolutions[a.name]);
  const unresolvedManagerNotFound = managerNotFound.filter((name) => !managerNameResolutions[name]);

  // 이미 등록된 과제 중 이번 엑셀이 다음/동일/과거 연차 중 무엇에 해당하는지 판단
  const projectUpdates = useMemo(
    () => computeProjectUpdates(projects, memberAggregates, projectMembers, institutions, projectMaxTerm, stageAggregates, scalarAggregates),
    [projects, memberAggregates, projectMembers, institutions, projectMaxTerm, stageAggregates, scalarAggregates]
  );

  // 엑셀 연차값과 총개발시작일자 기준 캘린더 계산값이 다른 과제 — 등록 자체는 막지 않고 미리보기에서
  // 경고로 보여준 뒤, 등록 후 담당자·회계담당자에게 확인 이슈를 남긴다.
  const calendarMismatches = useMemo(
    () => computeTermCalendarMismatches(projects, scalarAggregates, projectMaxTerm, stageAggregates, todayKST()),
    [projects, scalarAggregates, projectMaxTerm, stageAggregates]
  );

  // "단계기관별" 시트에서 일부 행이 값 문제로 통째로 걸러진 과제 — 등록 전 미리보기에서 바로 알려준다.
  // (예: 정산대상시작단계가 비어있거나, 시작단계≠종료단계인 행은 그 단계 정보 없이 조용히 진행된다.)
  const stageSkipWarnings = useMemo(() => {
    // projects 전체를 매번 .find()로 훑지 않고 한 번만 인덱싱 — 아래 memberDataWarnings/newMembers와
    // 동일한 이유(등록 실행 중 재계산 시 누적 데이터 규모만큼 매번 느려지는 것을 방지).
    const projectByNormNum = new Map<string, Project>();
    for (const p of projects) projectByNormNum.set(normProjectNum(p.projectNumber), p);

    const warnings: { normNum: string; projectNumber: string; projectName: string; reasons: string[] }[] = [];
    for (const [normNum, info] of stageAggregates) {
      if (!info.hasMissing || info.skipReasons.length === 0) continue;
      const existing = projectByNormNum.get(normNum);
      const scalarInfo = scalarAggregates.get(normNum);
      warnings.push({
        normNum,
        projectNumber: existing?.projectNumber ?? normNum,
        projectName: existing?.projectName ?? (scalarInfo && scalarInfo.projectNames.size >= 1 ? [...scalarInfo.projectNames][0] : ""),
        reasons: info.skipReasons,
      });
    }
    return warnings;
  }, [projects, scalarAggregates, stageAggregates]);

  // 사업비(수수료 산정용)나 연락처(공문 발송용)가 하나도 없는 채로 등록·갱신될 참여기관 — 이 두 값이
  // 없으면 이 시스템의 핵심 기능(1. 수수료 계산 2. 공문 발송)이 그 기관에서 조용히 안 돌아가므로,
  // 등록 자체를 막진 않되(뒤늦게 다른 경로로 채워질 수도 있어서) "확인필요" 탭 맨 위에서 가장 강하게
  // 경고한다. 이미 기존 참여기관에 그 값이 있고 이번 파일이 그걸 지우는 게 아니라면(단순 갱신) 대상에서
  // 뺀다 — 매번 같은 값을 반복 경고하면 정작 새로 비게 된 경우를 놓치기 쉬워진다.
  const memberDataWarnings = useMemo(() => {
    // 아래 루프는 파일에 등장한 고유 참여기관 수만큼 도는데, 그 안에서 projects/institutions/
    // projectMembers 전체를 매번 .find()로 훑으면 기존 누적 데이터 규모만큼 느려진다(등록 실행 중
    // 서버 응답이 돌아올 때마다 이 useMemo가 재계산되므로 특히 문제). 한 번만 인덱싱한다.
    const projectByNormNum = new Map<string, Project>();
    for (const p of projects) projectByNormNum.set(normProjectNum(p.projectNumber), p);
    const institutionByNormBiz = new Map<string, Institution>();
    for (const i of institutions) institutionByNormBiz.set(normBiz(i.bizNumber), i);
    const memberByProjectAndInst = new Map<string, ProjectMember>();
    for (const pm of projectMembers) memberByProjectAndInst.set(`${pm.projectId}|${pm.institutionId}`, pm);

    const warnings: { key: string; projectNumber: string; projectName: string; institutionName: string; missing: string[] }[] = [];
    for (const agg of memberAggregates) {
      const normNum = normProjectNum(agg.projectNumber);
      const existingProject = projectByNormNum.get(normNum);
      const existingInst = institutionByNormBiz.get(normBiz(agg.bizNumber));
      const existingMember = existingProject && existingInst
        ? memberByProjectAndInst.get(`${existingProject.id}|${existingInst.id}`)
        : undefined;

      const hasContact = !!agg.contactEmail || !!existingMember?.contactEmail;
      const hasBudget = memberAggregateHasAnyBudget(agg)
        || (existingMember?.annualBudgets ?? []).some((b) => b.cashBudget > 0 || b.inKindBudget > 0);

      const missing: string[] = [];
      if (!hasBudget) missing.push("사업비");
      if (!hasContact) missing.push("연락처(실무자 메일)");
      if (missing.length === 0) continue;

      const scalarInfo = scalarAggregates.get(normNum);
      warnings.push({
        key: agg.key,
        projectNumber: existingProject?.projectNumber ?? agg.projectNumber,
        projectName: existingProject?.projectName ?? (scalarInfo && scalarInfo.projectNames.size >= 1 ? [...scalarInfo.projectNames][0] : ""),
        institutionName: agg.institutionName,
        missing,
      });
    }
    return warnings;
  }, [memberAggregates, projects, institutions, projectMembers, scalarAggregates]);

  function toggleProjectUpdate(normNum: string, next: boolean) {
    setProjectUpdateChoices((prev) => ({ ...prev, [normNum]: next }));
  }

  // 이미 참여기관으로 연결된 (과제, 기관) 쌍은 제외하고 새로 등록될 참여기관 목록을 계산.
  // projectMembers는 파일 내용과 무관하게 시스템에 누적된 전체 참여기관 레코드라, 이 루프 안에서
  // projects/institutions를 매번 .find()로 훑으면(기존엔 그랬음) 파일 크기와 상관없이 "누적
  // 참여기관 수 × 누적 과제·기관 수"로 느려진다 — 몇 년치 데이터가 쌓이면 이게 가장 무거운
  // 재계산이 될 수 있어(등록 실행 중에도 반복 재계산됨) id 인덱스로 O(1) 조회로 바꾼다.
  const newMembers = useMemo(() => {
    const projectById = new Map<string, Project>();
    for (const p of projects) projectById.set(p.id, p);
    const institutionById = new Map<string, Institution>();
    for (const i of institutions) institutionById.set(i.id, i);

    const existingKeys = new Set<string>();
    for (const pm of projectMembers) {
      const proj = projectById.get(pm.projectId);
      const inst = institutionById.get(pm.institutionId);
      if (proj && inst) existingKeys.add(`${normProjectNum(proj.projectNumber)}|${normBiz(inst.bizNumber)}`);
    }
    return memberAggregates.filter((m) => !existingKeys.has(m.key));
  }, [memberAggregates, projectMembers, projects, institutions]);

  // ── 파일 파싱 ───────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const names = wb.SheetNames;
        setAllSheetNames(names);
        setWorkbook(wb);

        const matched: { sheetName: string; def: SheetDef }[] = [];
        for (const name of names) {
          const def = matchSheet(name);
          if (def && !matched.find((m) => m.def.key === def.key)) {
            matched.push({ sheetName: name, def });
          }
        }

        setMatchedSheets(matched);
        setParsedSheets(matched.map(({ sheetName, def }) => parseSheetToParsedSheet(wb, sheetName, def)));
        setStep("sheet");
      } catch {
        setError("파일을 읽는 중 오류가 발생했습니다. xlsx/xls 파일인지 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // 시트명이 자동 인식되지 않은 파일(RCMS가 아닌 다른 시스템 파일 등)에서, 사람이 "이 시트를
  // 연차별기관별/단계기관별로 쓰겠다"고 직접 지정한다. 같은 역할이 이미 다른 시트로 지정돼 있으면
  // 그 시트를 대체한다 — 컬럼은 어차피 다음 단계에서 직접 연결하므로 자동 인식 여부와 무관하게 동작한다.
  function assignSheetManually(sheetName: string, defKey: SheetDef["key"]) {
    if (!workbook) return;
    const def = SHEET_DEFS.find((d) => d.key === defKey);
    if (!def) return;
    const parsed = parseSheetToParsedSheet(workbook, sheetName, def);
    setMatchedSheets((prev) => [...prev.filter((m) => m.def.key !== defKey), { sheetName, def }]);
    setParsedSheets((prev) => [...prev.filter((s) => s.def.key !== defKey), parsed]);
  }

  function unassignSheet(defKey: SheetDef["key"]) {
    setMatchedSheets((prev) => prev.filter((m) => m.def.key !== defKey));
    setParsedSheets((prev) => prev.filter((s) => s.def.key !== defKey));
  }

  // ── 매핑 업데이트 ───────────────────────────────────────────

  function updateMapping(sheetKey: string, field: string, mappedTo: string | null) {
    setParsedSheets((prev) =>
      prev.map((s) =>
        s.def.key !== sheetKey ? s : {
          ...s,
          mapping: s.mapping.map((m) =>
            m.field !== field ? m : { ...m, mappedTo, matchType: mappedTo ? "none" : "none" }
          ),
        }
      )
    );
  }

  // ── 중복 검사 + 미리보기 생성 ───────────────────────────────

  function buildPreview() {
    setError(null);
    const rowMap = new Map<string, ExtractedRow>();

    for (const sheet of parsedSheets) {
      const get = (field: string, row: Record<string, string>) => {
        const m = sheet.mapping.find((x) => x.field === field);
        return getCellVal(row, m?.mappedTo ?? null);
      };

      for (const row of sheet.rows) {
        const projectNumber = get("projectNumber", row);
        if (!projectNumber) continue;
        const key = normProjectNum(projectNumber) + "|" + (get("bizNumber", row) || "");
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            agencyName: get("agencyName", row),
            projectNumber,
            projectName: get("projectName", row),
            startDate: toDateStr(get("startDate", row)),
            endDate: toDateStr(get("endDate", row)),
            institutionName: get("institutionName", row),
            bizNumber: get("bizNumber", row),
            institutionRole: get("institutionRole", row),
            sheetKey: sheet.def.key,
          });
        }
      }
    }

    const extracted = Array.from(rowMap.values());

    // ── 중복 검사 사전 인덱스 ────────────────────────────────────
    // 정확일치는 Map으로 O(1) 조회. 기존엔 행마다 fundingAgencies/projects/institutions 전체를
    // 순회했는데(과제는 유사도까지 계산), 기존 과제가 수천 건만 쌓여도 "엑셀 신규 항목 수 × 기존
    // 과제 수"로 비교 횟수가 폭발해 미리보기 단계에서 브라우저가 몇 분씩 멈췄다. 과제 "유사" 후보는
    // 정규화된 과제번호의 앞 8자리(형식상 보통 기관코드+연도까지 해당)로 버킷을 나눠, 레벤슈타인
    // 비교를 그 버킷 안에서만 수행한다 — 실무에서 흔한 오타(뒷자리 숫자 하나 틀림)는 그대로 잡히고,
    // 앞자리까지 다른 우연한 유사 후보와의 비교는 건너뛴다. 전담기관은 보통 수십 개 이하라 버킷 없이
    // 그대로 돈다.
    const agencyExactMap = new Map<string, FundingAgency>();
    for (const a of fundingAgencies) {
      agencyExactMap.set(a.name, a);
      if (a.shortName) agencyExactMap.set(a.shortName, a);
      if (a.code) agencyExactMap.set(a.code, a);
    }

    const PROJECT_BUCKET_LEN = 8;
    const projectExactMap = new Map<string, Project>();
    const projectBuckets = new Map<string, Project[]>();
    for (const p of projects) {
      const norm = normProjectNum(p.projectNumber);
      projectExactMap.set(norm, p);
      const bucketKey = norm.slice(0, PROJECT_BUCKET_LEN);
      const bucket = projectBuckets.get(bucketKey);
      if (bucket) bucket.push(p);
      else projectBuckets.set(bucketKey, [p]);
    }

    const institutionExactMap = new Map<string, Institution>();
    for (const i of institutions) institutionExactMap.set(normBiz(i.bizNumber), i);

    // 앞자리 버킷 하나가 비정상적으로 커도(같은 형식의 과제가 아주 많은 경우) 행 하나당 유사도
    // 비교 횟수에 상한을 둬 최악의 경우에도 미리보기가 오래 걸리지 않게 한다.
    const MAX_SIMILARITY_COMPARISONS = 150;

    // 중복 검사
    const preview: PreviewRow[] = extracted.map((row) => {
      const duplicates: DuplicateInfo[] = [];

      // 전담기관 중복 — 엑셀엔 정식명("농촌진흥청") 대신 약칭/코드("RDA1")가 적혀 있는 경우도 있어,
      // 이름뿐 아니라 shortName·code까지 정확히 일치하면 같은 기관으로 본다(RDA1/RDA2처럼 이름이
      // 겹치는 전담기관을 약칭으로 정확히 지목한 경우, "RDA1"이라는 이름의 가짜 기관이 새로 생기는 걸 막는다).
      const existingAgency = agencyExactMap.get(row.agencyName);
      if (existingAgency) {
        duplicates.push({ type: "agency", key: row.agencyName, existing: existingAgency.name, status: "exact" });
      } else {
        for (const a of fundingAgencies) {
          const sc = strSimilarity(row.agencyName, a.name);
          if (sc >= 80) {
            duplicates.push({ type: "agency", key: row.agencyName, existing: a.name, status: "similar", score: sc });
            break;
          }
        }
      }

      // 과제 중복 — 정확일치는 Map 조회, "유사"는 같은 앞자리 버킷 안에서만 비교.
      const normNum = normProjectNum(row.projectNumber);
      const existingProj = projectExactMap.get(normNum);
      if (existingProj) {
        duplicates.push({ type: "project", key: row.projectNumber, label: row.projectName, existing: existingProj.projectName, status: "exact" });
      } else {
        const bucket = projectBuckets.get(normNum.slice(0, PROJECT_BUCKET_LEN));
        if (bucket) {
          for (let i = 0; i < bucket.length && i < MAX_SIMILARITY_COMPARISONS; i++) {
            const sc = strSimilarity(normNum, normProjectNum(bucket[i].projectNumber));
            if (sc >= 85) {
              duplicates.push({ type: "project", key: row.projectNumber, label: row.projectName, existing: bucket[i].projectNumber, status: "similar", score: sc });
              break;
            }
          }
        }
      }

      // 기관 중복
      const normBizNum = normBiz(row.bizNumber);
      const existingInst = normBizNum ? institutionExactMap.get(normBizNum) : undefined;
      if (existingInst) {
        duplicates.push({ type: "institution", key: row.bizNumber, label: row.institutionName, existing: existingInst.name, status: "exact" });
      }

      // 등록 여부(willRegister)는 "정확일치"에서만 막는다 — "유사"(오타로 의심되는 근접 후보)는
      // 화면에 경고만 띄운다. 과제번호가 우연히 다른 과제와 비슷해 보인다는 이유만으로 신규 과제
      // 등록이나 개명 인식(resolveRenamedProject, 과제명+기간 기준이라 이 유사도 판정과는 무관하게
      // 별도로 동작함)까지 조용히 건너뛰면 안 된다 — 실제로 그렇게 막고 있던 게 이전 동작이었다.
      return {
        ...row,
        duplicates,
        willRegister: {
          agency: !existingAgency,
          project: !existingProj,
          institution: !existingInst && !!normBizNum,
        },
      };
    });

    setPreviewRows(preview);
    setStep("preview");
  }

  // 시트 확인 후 필수 컬럼이 모두 자동 인식되면 매핑 단계 건너뜀
  function handleSheetConfirm(sheets: ParsedSheet[]) {
    const allMapped = sheets.every((s) =>
      s.mapping.filter((m) => m.required).every((m) => m.mappedTo !== null)
    );
    if (allMapped) {
      setPreviewBackStep("sheet");
      buildPreview();
    } else {
      setPreviewBackStep("mapping");
      setStep("mapping");
    }
  }

  // ── 등록 실행 ───────────────────────────────────────────────

  async function doRegister() {
    // 미리보기의 "등록" 버튼이 이미 막아주지만, 방어적으로 한 번 더 확인한다 — 동명이인이나
    // [권한관리]에 없는 담당자를 해소하지 않은 채로 등록하면 공문 발송 시 연락처가 엉뚱한 사람
    // 것으로 나가거나 아예 연동되지 않을 수 있다.
    if (unresolvedManagerAmbiguities.length > 0 || unresolvedManagerNotFound.length > 0) return;
    setLoading(true);
    // 대량 업로드(행 수천 건)로 아래 loop가 add*/update*를 수백~수천 번 호출할 수 있어, 그 서버
    // 동기화가 실제로 몇 건 실패했는지 이 구간에서 집계해 완료 화면에 안내한다(lib/store.ts의
    // throttledFetch가 동시 요청 수도 함께 제한한다).
    beginSyncBatch();
    const today = todayKST();

    const registeredAgencies = new Map<string, string>(); // name → id
    const registeredProjects = new Map<string, string>(); // normProjectNum → id
    const registeredInst = new Map<string, string>();      // normBiz → id
    // 이번 실행에서 새로 만든 과제의 agencyId — useStore()의 projects는 이 함수 실행 중엔 갱신되지
    // 않는(stale) 스냅샷이라, 방금 만든 과제를 projects.find(...)로 다시 찾으면 항상 못 찾는다.
    // 주관기관 보정 단계에서 농촌진흥청(RDA1/RDA2) agencyId를 다시 판별할 때 이 값을 쓴다.
    const newProjectAgencyId = new Map<string, string>(); // normProjectNum → agencyId
    // 위와 같은 이유(신규 과제는 projects 스냅샷에서 못 찾음)로 startDate도 별도 추적한다 — 회계법인
    // 자동판별 단계에서 연차별 termYear를 계산하려면 과제 시작일이 필요하다.
    const newProjectStartDate = new Map<string, string>(); // normProjectNum → startDate
    // setTermOtherFirmHandled는 projectNumber "원문"으로 TermFee를 찾으므로, 신규/기존/이름변경 과제
    // 구분 없이 파일에 처음 등장한 원문 과제번호를 normNum마다 하나씩 기록해둔다.
    const projectNumberByNormNum = new Map<string, string>();
    for (const row of previewRows) {
      const n = normProjectNum(row.projectNumber);
      if (n && !projectNumberByNormNum.has(n)) projectNumberByNormNum.set(n, row.projectNumber);
    }
    let agencyCount = 0, projectCount = 0, instCount = 0, memberCount = 0, renamedCount = 0;
    // 과제코드/이름+기간으로는 기존 과제 후보가 2개 이상 나와 자동으로 판단할 수 없는 경우 — 등록하지 않고 이슈로 남긴다.
    const renameAmbiguities: { normNum: string; rawProjectNumber: string; projectName: string; candidates: Project[] }[] = [];
    // "단계기관별" 시트가 과제번호+정산대상단계·연차만 채워진 행으로 완전히 새 과제를 만들게 되는 경우 —
    // 과제명·총개발시작일자가 비어 있으면 "미입력"/오늘 날짜 같은 임시값으로 조용히 등록되는데, 아무 표시도
    // 없으면 이렇게 등록된 걸 아무도 못 알아챈다. 등록 자체는 막지 않고(단계 정보는 그대로 반영하고)
    // 이슈로 남겨서 담당자가 반드시 확인·정정하게 한다.
    const newProjectMissingInfo: { projectId: string; projectNumber: string; missingFields: string[] }[] = [];
    // 새로 만든 과제 중 "주관기관 정보 보정"(아래) 단계에서 실제로 role="LEAD" 행을 찾아 주관기관을
    // 채운 과제만 추적한다 — 파일에 "기관역할구분=주관"으로 표시된 행이 하나도 없으면 과제가 주관기관
    // 없이(빈 값으로) 그대로 등록되는데, 지금까진 아무 표시 없이 조용히 넘어가 아무도 눈치채지 못했다.
    const newProjectIdsForLeadCheck = new Map<string, string>(); // projectId → projectNumber
    const leadResolvedProjectIds = new Set<string>();

    // 기존 전담기관·과제·기관 미리 채워두기 (참여기관 연결에 필요)
    for (const a of fundingAgencies) registeredAgencies.set(a.name, a.id);
    for (const p of projects) registeredProjects.set(normProjectNum(p.projectNumber), p.id);
    for (const i of institutions) registeredInst.set(normBiz(i.bizNumber), i.id);

    // 신규 기관 일괄 등록 — 아래 본 루프에서 기관 하나당 건별로 addInstitution을 부르면(과거 방식)
    // 대량 업로드 시 요청이 수천 건까지 쌓여 서버에 부담을 준다(여러 사용자가 동시에 올리면 더욱).
    // previewRows만으로 신규 기관 목록을 미리 뽑을 수 있으므로(사업자번호 중복은 이 파일 안에서도
    // 걸러야 함), 본 루프를 돌기 전에 한 번에 만들어 registeredInst를 먼저 채운다 — 본 루프의 과제·
    // 참여기관 등록은 이 값을 그대로 참조하기만 하고 새로 만들지 않으므로 순서를 바꿔도 안전하다.
    const newInstitutionPayloads: { normBizNum: string; data: Omit<Institution, "id"> }[] = [];
    for (const row of previewRows) {
      const normBizNum = normBiz(row.bizNumber);
      if (!row.willRegister.institution || !normBizNum || registeredInst.has(normBizNum)) continue;
      registeredInst.set(normBizNum, ""); // 이 파일 안에서 같은 사업자번호가 또 나와도 중복 수집 안 되게 임시 표시
      newInstitutionPayloads.push({
        normBizNum,
        data: {
          name: row.institutionName || "미입력",
          type: "중소기업",
          // 엑셀에 하이픈 없이 숫자만 입력했어도 등록 시 000-00-00000 형식으로 자동 변환한다 —
          // 하이픈을 직접 입력하지 않아도 되게 하되, 저장되는 값은 항상 같은 형식으로 맞춘다.
          bizNumber: formatBizNumber(row.bizNumber),
          representativeName: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          registeredAt: today,
          status: "ACTIVE",
        },
      });
    }
    if (newInstitutionPayloads.length > 0) {
      const createdInstitutions = await addInstitutionsBulk(newInstitutionPayloads.map((p) => p.data));
      // 실패한 항목은 addInstitutionsBulk가 로컬 상태에서 이미 롤백했고 syncFailures로도 집계된다 —
      // 여기선 registeredInst의 임시 표시를 지워 "이미 등록됨"으로 오인해 참여기관 연결이 조용히
      // 스킵되지 않게 한다(생성 실패한 기관은 이번 실행에서 등록되지 않은 것으로 남는다).
      const createdByBiz = new Map(createdInstitutions.map((inst) => [normBiz(inst.bizNumber), inst]));
      for (const { normBizNum } of newInstitutionPayloads) {
        const created = createdByBiz.get(normBizNum);
        if (created) {
          registeredInst.set(normBizNum, created.id);
          instCount++;
        } else {
          registeredInst.delete(normBizNum);
        }
      }
    }

    for (const row of previewRows) {
      // 전담기관 — registeredAgencies는 name으로만 미리 채워져 있어, 엑셀에 약칭/코드("RDA1")가
      // 적힌 행은 여기서 안 걸린다. 새로 만들기 전에 shortName·code까지 한 번 더 대조해서, RDA1/RDA2처럼
      // name이 겹치는 전담기관을 약칭으로 정확히 지목한 경우 가짜 "RDA1" 기관이 새로 생기지 않게 한다.
      if (row.willRegister.agency && row.agencyName && !registeredAgencies.has(row.agencyName)) {
        const matchedExisting = fundingAgencies.find(
          (a) => a.shortName === row.agencyName || a.code === row.agencyName
        );
        if (matchedExisting) {
          registeredAgencies.set(row.agencyName, matchedExisting.id);
        } else {
          const created = addFundingAgency({
            name: row.agencyName,
            shortName: row.agencyName.slice(0, 4),
            code: row.agencyName.slice(0, 4),
            contactName: "",
            contactEmail: "",
            contactPhone: "",
            status: "ACTIVE",
            registeredAt: today,
            noticeRecipientScope: "LEAD_ONLY",
          });
          registeredAgencies.set(row.agencyName, created.id);
          agencyCount++;
        }
      }

      // 기관은 본 루프 진입 전에 이미 일괄 등록해 registeredInst에 채워뒀다(위 참고).

      // 과제
      const normNum = normProjectNum(row.projectNumber);
      if (row.willRegister.project && normNum && !registeredProjects.has(normNum)) {
        const agencyId = registeredAgencies.get(row.agencyName) ?? "";
        const startDateStr = row.startDate || today;

        // 과제담당자·연구책임자·자율성트랙 — 같은 과제의 여러 행에서 값이 하나로 모아질 때만 채택.
        // 값이 갈리면 여기서 비워두고, 아래에서 이슈로 남겨 확인을 요청한다. 과제담당자(정)/(부)는
        // 연차별 이력이 있어(아래 resolvedAssignedManagerPrimary/resolvedAssignedManager) 이 스칼라
        // 값은 termYear가 없는 행(예: 단계기관별 시트)을 위한 폴백으로만 쓰인다.
        const scalarInfo = scalarAggregates.get(normNum);
        const assignedManager = scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined;
        const assignedManagerPrimaryFallback = scalarInfo?.assignedManagersPrimary.size === 1 ? [...scalarInfo.assignedManagersPrimary][0] : undefined;
        const agencyAssignedAt = scalarInfo?.agencyAssignedAts.size === 1 ? [...scalarInfo.agencyAssignedAts][0] : undefined;
        const internalAssignedAt = scalarInfo?.internalAssignedAts.size === 1 ? [...scalarInfo.internalAssignedAts][0] : undefined;
        const explicitProjectCategory = scalarInfo?.projectCategories.size === 1 ? [...scalarInfo.projectCategories][0] : undefined;

        // 새로 만들기 전에 "과제번호만 바뀐 기존 과제"인지 먼저 확인한다 — RCMS에서 과제번호가
        // 재부여되는 경우가 있어, 문자열이 달라도 (과제명+기간)이 같으면 같은 과제로 본다.
        // 아래 단계 구조를 상대연차→절대연차로 바꿀 때 "이 과제가 이미 어디까지 진행됐는지"가
        // 기준이 되므로, 단계 계산보다 먼저 판단해야 한다.
        const { project: renamedFrom, ambiguousCandidates } = resolveRenamedProject(
          row.projectName || "미입력", startDateStr, row.endDate || today, projects
        );

        const stageInfo = stageAggregates.get(normNum);
        const { agreementType, stages, batchEndTerm } = resolveStageStructure(stageInfo, renamedFrom?.stages);
        const maxStageEndTerm = stages ? Math.max(...stages.map((s) => s.endTermNumber)) : batchEndTerm;
        const totalTerms = Math.max(1, projectMaxTerm.get(normNum) ?? 1, maxStageEndTerm);
        // 진행 연차는 캘린더 역산이 아니라 엑셀에 적힌 값을 그대로 신뢰한다 — "연차별기관별_연구비집행"
        // 시트는 항상 현재 진행 중인 연차 하나만 담아 업로드하는 것이 실무 규칙이기 때문. 캘린더 계산은
        // (이 과제의 연차별 행이 파일에 아예 없어 값을 모를 때의) 폴백이자, calendarMismatches 경고·이슈용 참고값이다.
        const currentTerm = projectMaxTerm.get(normNum) ?? computeCurrentTerm(startDateStr, totalTerms, today);
        // 연구책임자 이름·메일주소 — 연차별로 값이 다를 수 있어(인사이동 등) 진행 연차(currentTerm)
        // 기준 값을 우선 채택한다. 파일에 담긴 다른 연차의 값은 아래 researchLeadOverrides로 따로 반영된다.
        const researchLead = resolveScalarForTerm(scalarInfo?.researchLeadsByTerm, currentTerm, scalarInfo?.researchLeads);
        const researchLeadEmail = resolveScalarForTerm(scalarInfo?.researchLeadEmailsByTerm, currentTerm, scalarInfo?.researchLeadEmails);

        // 당해(현재 연차) 정부출연금/민간현금/민간현물 — 참여기관 전체 합산
        const { govGrant, privateCash, privateInKind } = sumTermFinancials(memberAggregates, normNum, currentTerm);
        // 파일에 담긴 연차 전체의 정부출연금/민간현금/민간현물 — Project.annualFinancials에 연차별로 쌓는다.
        const allTermFinancials = sumAllTermFinancials(memberAggregates, normNum);
        // 담당자도 연차별 이력이 있으면(연차마다 다른 사람이 찍혀 있으면) 진행연차 값을 우선 채택하고,
        // 파일에 담긴 연차 전체 이력은 Project.assignedManagerHistory에 그대로 쌓는다.
        const assignedManagerHistory = buildAssignedManagerHistory(scalarInfo, managerNameResolutions, users);
        const resolvedAssignedManager = scalarInfo?.assignedManagersByTerm.get(currentTerm) ?? assignedManager;
        // 과제담당자(정)도 (부)와 동일하게 연차별 이력을 우선 채택한다.
        const assignedManagerPrimaryHistory = buildAssignedManagerPrimaryHistory(scalarInfo, managerNameResolutions, users);
        const resolvedAssignedManagerPrimary = scalarInfo?.assignedManagersPrimaryByTerm.get(currentTerm) ?? assignedManagerPrimaryFallback;

        // 현재 연차가 속한 단계의 실제 날짜 범위(있으면) → 단계시작일/단계종료일
        const currentStage = stages?.find((s) => currentTerm >= s.startTermNumber && currentTerm <= s.endTermNumber);
        const stageDateRange = currentStage ? stageInfo?.dateRanges.get(currentStage.stageNumber) : undefined;

        // 최초시작일/최종종료일 — 관측된 모든 단계(일괄협약이면 0단계 하나)의 날짜 범위를 합쳐
        // 가장 이른 시작일·가장 늦은 종료일을 과제 전체 기간으로 잡는다. 이 값은 excel 재업로드 때마다
        // 갱신되므로, 개별 단계 날짜가 나중에 정정되면 여기도 같이 정정된다.
        const allStageDateRanges = stageInfo ? [...stageInfo.dateRanges.values()] : [];
        const overallStartDate = allStageDateRanges.length
          ? allStageDateRanges.reduce((min, d) => (d.start < min ? d.start : min), allStageDateRanges[0].start)
          : undefined;
        const overallEndDate = allStageDateRanges.length
          ? allStageDateRanges.reduce((max, d) => (d.end > max ? d.end : max), allStageDateRanges[0].end)
          : undefined;

        // 연차상시/정산 — 엑셀에 명시적으로 있으면(과제구분 컬럼) 그 값을 쓰고, 없으면 방금 계산한
        // 단계 구조·총연차 기준으로 판정(다른 화면과 동일 기준)한다.
        const autoProjectCategory = isSettlementTerm({ agreementType, stages, totalTerms }, currentTerm) ? "정산" : "연차상시";
        const projectCategory = explicitProjectCategory ?? autoProjectCategory;

        if (ambiguousCandidates.length > 0) {
          // 후보가 여러 개라 자동으로 판단할 수 없음 — 등록하지 않고 아래에서 이슈로 남긴다
          // (registeredProjects에 안 넣으므로 이 과제군의 참여기관·단계 정보도 함께 건너뛴다).
          renameAmbiguities.push({ normNum, rawProjectNumber: row.projectNumber, projectName: row.projectName, candidates: ambiguousCandidates });
        } else if (renamedFrom) {
          // 과제번호 변경으로 판단 — 새로 만들지 않고 기존 과제를 그대로 갱신한다. updateProject의
          // 변경이력 기록이 "이전 과제번호 → 새 과제번호"를 감사로그에 자동으로 남긴다.
          // 과제코드는 시스템이 최초 등록 시 자동으로 매긴 값이라 여기서는 건드리지 않는다.
          // 책임자 이름·이메일이 이번 엑셀 값으로 바뀌는 경우, 그 값이 반영되는 연차(currentTerm)
          // 이전 연차는 옛 값으로 고정해 소급 변경을 막는다.
          const leadChanged =
            (researchLead !== undefined && researchLead !== renamedFrom.researchLead) ||
            (researchLeadEmail !== undefined && researchLeadEmail !== renamedFrom.researchLeadEmail);
          // 1) 기본값(researchLead/researchLeadEmail) 변경 시 이미 있는 연차를 옛 값으로 고정(소급 방지) —
          // 2) 그 위에 파일이 실제로 담고 있는 연차별 값을 buildResearchLeadOverridesFromExcel로 정확히 얹는다
          //    (같은 연차 안에서 서로 다른 값이 동시에 관측된 연차는 건너뛰고 이슈로 안내한다).
          const backfilledResearchLeadOverrides = leadChanged
            ? backfillExistingTermOverrides(
                renamedFrom.researchLeadOverrides,
                new Set([
                  ...termFees.filter((f) => f.projectNumber === renamedFrom.projectNumber).map((f) => f.termNumber),
                  ...memberAggregates.filter((a) => normProjectNum(a.projectNumber) === normNum).flatMap((a) => [...a.budgetsByTerm.keys()]),
                ]),
                currentTerm,
                (termNumber) => ({
                  termNumber,
                  name: renamedFrom.researchLead ?? "",
                  email: renamedFrom.researchLeadEmail ?? "",
                }),
              )
            : renamedFrom.researchLeadOverrides;
          updateProject(renamedFrom.id, {
            projectNumber: row.projectNumber,
            projectName: row.projectName || renamedFrom.projectName,
            agencyId: agencyId || renamedFrom.agencyId,
            agency: row.agencyName || renamedFrom.agency,
            startDate: startDateStr,
            endDate: row.endDate || today,
            totalTerms: Math.max(renamedFrom.totalTerms, totalTerms),
            currentTerm,
            agreementType: agreementType ?? renamedFrom.agreementType,
            stages: stages ?? renamedFrom.stages,
            projectCategory,
            projectType: scalarInfo?.isAutonomyTrack ? "AUTONOMY_TRACK" : renamedFrom.projectType,
            govGrant: govGrant > 0 ? govGrant : renamedFrom.govGrant,
            privateCash: privateCash > 0 ? privateCash : renamedFrom.privateCash,
            privateInKind: privateInKind > 0 ? privateInKind : renamedFrom.privateInKind,
            annualFinancials: mergeAnnualFinancials(renamedFrom.annualFinancials, allTermFinancials),
            stageStartDate: stageDateRange?.start ?? renamedFrom.stageStartDate,
            stageEndDate: stageDateRange?.end ?? renamedFrom.stageEndDate,
            firstStartDate: overallStartDate ?? renamedFrom.firstStartDate,
            finalEndDate: overallEndDate ?? renamedFrom.finalEndDate,
            assignedManager: resolvedAssignedManager ? applyManagerNameResolution(resolvedAssignedManager, managerNameResolutions, users) : renamedFrom.assignedManager,
            assignedManagerUserId: resolveManagerUserId(resolvedAssignedManager, renamedFrom.assignedManager, renamedFrom.assignedManagerUserId, managerNameResolutions),
            assignedManagerHistory: mergeTermHistory(renamedFrom.assignedManagerHistory, assignedManagerHistory),
            assignedManagerPrimary: resolvedAssignedManagerPrimary ? applyManagerNameResolution(resolvedAssignedManagerPrimary, managerNameResolutions, users) : renamedFrom.assignedManagerPrimary,
            assignedManagerPrimaryUserId: resolveManagerUserId(resolvedAssignedManagerPrimary, renamedFrom.assignedManagerPrimary, renamedFrom.assignedManagerPrimaryUserId, managerNameResolutions),
            assignedManagerPrimaryHistory: mergeTermHistory(renamedFrom.assignedManagerPrimaryHistory, assignedManagerPrimaryHistory),
            researchLead: researchLead ?? renamedFrom.researchLead,
            researchLeadEmail: researchLeadEmail ?? renamedFrom.researchLeadEmail,
            // ??로 undefined일 때만 ""로 채운다 — 그대로 두면 resolveResearchLeadForTerm의 override?.email ??
            // researchLeadEmail 폴백이 "값 없음"으로 착각해 방금 바뀐 새 기본값으로 새어 들어가 버린다.
            // "이전 연차"가 아니라 "이미 TermFee가 있는 연차"를 기준으로 고정한다 — 다년치 사업비를
            // 미리 입력해둬서 진행 연차보다 나중 연차가 이미 만들어져 있는 경우도 소급되면 안 된다.
            // termFees는 이 컴포넌트 마운트 시점 스냅샷이라 이번 업로드가 처음 만드는 연차는 아직 없다 —
            // 이번 파일이 실제로 값을 담은 연차(참여기관들의 budgetsByTerm)도 함께 합쳐야 빠지지 않는다.
            researchLeadOverrides: buildResearchLeadOverridesFromExcel(
              scalarInfo,
              researchLead ?? renamedFrom.researchLead,
              researchLeadEmail ?? renamedFrom.researchLeadEmail,
              backfilledResearchLeadOverrides,
            ),
            agencyAssignedAt: agencyAssignedAt ?? renamedFrom.agencyAssignedAt,
            internalAssignedAt: internalAssignedAt ?? renamedFrom.internalAssignedAt,
          });
          registeredProjects.set(normNum, renamedFrom.id);
          newProjectAgencyId.set(normNum, agencyId || renamedFrom.agencyId);
          newProjectStartDate.set(normNum, renamedFrom.startDate);
          renamedCount++;
        } else {
          const created = addProject({
            projectNumber: row.projectNumber,
            projectName: row.projectName || "미입력",
            agencyId,
            agency: row.agencyName,
            // 주관기관은 이 시점엔 특정할 수 없음 — 참여기관 등록 후 role="LEAD" 행으로 보정한다.
            leadInstitutionId: "",
            leadInstitutionName: "",
            totalBudget: 0,
            startDate: startDateStr,
            endDate: row.endDate || today,
            totalTerms,
            currentTerm,
            status: "ACTIVE",
            agreementType,
            stages,
            projectCategory,
            projectType: scalarInfo?.isAutonomyTrack ? "AUTONOMY_TRACK" : undefined,
            govGrant: govGrant > 0 ? govGrant : undefined,
            privateCash: privateCash > 0 ? privateCash : undefined,
            privateInKind: privateInKind > 0 ? privateInKind : undefined,
            annualFinancials: allTermFinancials.length > 0 ? allTermFinancials : undefined,
            stageStartDate: stageDateRange?.start,
            stageEndDate: stageDateRange?.end,
            firstStartDate: overallStartDate,
            finalEndDate: overallEndDate,
            assignedManager: resolvedAssignedManager ? applyManagerNameResolution(resolvedAssignedManager, managerNameResolutions, users) : resolvedAssignedManager,
            assignedManagerUserId: resolvedAssignedManager ? managerNameResolutions[resolvedAssignedManager] : undefined,
            assignedManagerHistory: assignedManagerHistory.length > 0 ? assignedManagerHistory : undefined,
            assignedManagerPrimary: resolvedAssignedManagerPrimary ? applyManagerNameResolution(resolvedAssignedManagerPrimary, managerNameResolutions, users) : resolvedAssignedManagerPrimary,
            assignedManagerPrimaryUserId: resolvedAssignedManagerPrimary ? managerNameResolutions[resolvedAssignedManagerPrimary] : undefined,
            assignedManagerPrimaryHistory: assignedManagerPrimaryHistory.length > 0 ? assignedManagerPrimaryHistory : undefined,
            researchLead,
            researchLeadEmail,
            // 신규 과제도 한 파일에 여러 연차를 한 번에 담아 올릴 수 있어(예: 1~5연차 일괄 등록),
            // 그 사이 책임자가 바뀐 연차가 있으면 여기서 바로 연차별 오버라이드로 반영한다.
            researchLeadOverrides: buildResearchLeadOverridesFromExcel(scalarInfo, researchLead, researchLeadEmail, undefined),
            agencyAssignedAt,
            internalAssignedAt,
          });
          registeredProjects.set(normNum, created.id);
          newProjectAgencyId.set(normNum, agencyId);
          newProjectStartDate.set(normNum, startDateStr);
          newProjectIdsForLeadCheck.set(created.id, row.projectNumber);
          projectCount++;

          // 과제명·총개발시작일자가 비어 있어 임시값("미입력"/오늘 날짜)으로 채워진 채 새로 등록됐다면,
          // 아무 표시 없이 조용히 넘어가지 않도록 이슈로 남긴다(아래에서 addProjectIssue로 변환).
          const missingFields: string[] = [];
          if (!row.projectName) missingFields.push("과제명");
          if (!row.startDate) missingFields.push("총개발시작일자");
          if (missingFields.length > 0) {
            newProjectMissingInfo.push({ projectId: created.id, projectNumber: row.projectNumber, missingFields });
          }
        }
      }
    }

    // 기존 과제(이미 등록됨) 중, 이번 회차에 반영하기로 승인된 것만 True
    function isApprovedUpdate(normNum: string): boolean {
      const info = projectUpdates.find((u) => u.normNum === normNum);
      if (!info) return true; // 비교 대상 정보가 없으면 신규 과제 — 항상 진행
      return projectUpdateChoices[normNum] ?? defaultChoiceForStatus(info.status);
    }

    let memberUpdatedCount = 0;
    const touchedProjectIds = new Set<string>();
    const now = nowKST();
    const authorName = getCurrentUser()?.name ?? "시스템";
    let stageAlertCount = 0;

    // 참여기관 등록/갱신 — 이게 등록돼야 연차 수수료가 자동으로 계산된다 (autoGenerateTermFees 트리거)
    for (const agg of memberAggregates) {
      const normNum = normProjectNum(agg.projectNumber);
      const projectId = registeredProjects.get(normNum);
      const institutionId = registeredInst.get(normBiz(agg.bizNumber));
      if (!projectId || !institutionId) continue;

      // 이 실행 이전부터 있던(=신규로 만든 게 아닌) 과제인지 — 연차·사업비(annualBudgets/역할/정산형태
      // ·등급) 반영은 이 승인 여부를 따르지만, 실무자 메일주소처럼 연차 진행과 무관한 정정 값은
      // 아래에서 승인 여부와 무관하게 항상 반영한다. 그래야 "동일 연차 재제출"(승인 체크박스 기본
      // 꺼짐)로 다시 올려도 메일주소 등 단순 정정이 묻히지 않는다.
      const isPreexistingProject = projects.some((p) => p.id === projectId);
      const approved = !isPreexistingProject || isApprovedUpdate(normNum);

      const institution = institutions.find((i) => i.id === institutionId);
      // ProjectMember.annualBudgets엔 예산 4개 필드 + 연차 시작/종료일·담당 회계법인(있으면)만 저장 —
      // govGrant/privateCash/privateInKind는 과제 레벨 "당해 사업비" 필드를 채우기 위한
      // 집계용 임시값이라 여기엔 남기지 않는다.
      const annualBudgets: AnnualBudget[] = Array.from(agg.budgetsByTerm.values())
        .sort((a, b) => a.termNumber - b.termNumber)
        .map(({ termYear, termNumber, cashBudget, inKindBudget, termStartDate, termEndDate, auditFirm }) => ({ termYear, termNumber, cashBudget, inKindBudget, termStartDate, termEndDate, auditFirm }));
      const existingMember = projectMembers.find(
        (m) => m.projectId === projectId && m.institutionId === institutionId
      );
      const targetTerm = projectMaxTerm.get(normNum) ?? 1;
      const contactEmailForTargetTerm = resolveContactEmailForTerm(agg, targetTerm);
      const contactNameForTargetTerm = resolveContactNameForTerm(agg, targetTerm);

      if (!existingMember) {
        if (!approved) continue; // 아직 승인되지 않은 연차의 신규 참여기관은 만들지 않는다
        touchedProjectIds.add(projectId);
        // 신규 참여기관
        const totalCash = annualBudgets.length > 0
          ? annualBudgets.reduce((s, b) => s + b.cashBudget, 0)
          : agg.totalCashBudgetFallback;
        const totalInKind = annualBudgets.length > 0
          ? annualBudgets.reduce((s, b) => s + b.inKindBudget, 0)
          : agg.totalInKindBudgetFallback;
        addProjectMember({
          projectId,
          projectNumber: agg.projectNumber,
          institutionId,
          institutionName: agg.institutionName,
          institutionType: institution?.type ?? "중소기업",
          role: agg.role,
          budget: totalCash + totalInKind,
          feeRate: 0,
          calculatedFee: 0,
          institutionGrade: agg.institutionGrade ?? "일반",
          settlementType: agg.settlementType,
          // 신규 참여기관이라도 "연차별기관별" 시트가 연차마다 다른 값을 담고 있으면(예: 3연차부터
          // 위탁정산 전환) 오버라이드로 정확히 반영한다 — 단일값(agg.settlementType/institutionGrade)은
          // 마지막으로 읽은 연차의 값이라 몇 연차부터 바뀌었는지 알 수 없다.
          settlementTypeOverrides: buildSettlementTypeOverridesFromExcel(agg, undefined),
          gradeOverrides: buildGradeOverridesFromExcel(agg, undefined),
          cashBudget: totalCash,
          inKindBudget: totalInKind,
          annualBudgets: annualBudgets.length > 0 ? annualBudgets : undefined,
          // "실무자명"·"실무자 메일주소" 컬럼 값을 우선 쓰고, 없으면 이미 등록된 기관의 대표 연락처를
          // 기본값으로 채운다 — 그래야 참여기관마다 연락처를 일일이 다시 입력할 필요가 없다.
          contactName: contactNameForTargetTerm || institution?.contactName || undefined,
          contactEmail: contactEmailForTargetTerm || institution?.contactEmail || undefined,
          contactPhone: institution?.contactPhone || undefined,
          recipientOverrides: buildRecipientOverridesFromExcel(
            agg,
            { contactName: institution?.contactName, contactEmail: institution?.contactEmail, contactPhone: institution?.contactPhone },
            undefined,
          ),
        });
        memberCount++;
      } else {
        // 기존 참여기관 갱신. 실무자 메일주소는 연차 진행과 무관한 정정 값이라 승인 여부와 무관하게
        // 항상 반영하고, 사업비·역할·정산형태·등급처럼 연차 진행에 얽힌 값은 승인된 경우에만 반영한다.
        const updates: Partial<ProjectMember> = {};

        // "실무자명"·"실무자 메일주소" 컬럼에 값이 있을 때만 덮어쓴다 — 비어 있으면 화면에서 직접
        // 입력해둔 기존 값을 그대로 보존한다. 값이 실제로 달라지면, 이번 엑셀이 반영하는 연차(targetTerm)
        // 이전 연차는 옛 연락처로 고정해 소급 변경을 막는다.
        if (contactEmailForTargetTerm || contactNameForTargetTerm || agg.contactEmailsByTerm.size > 0 || agg.contactNamesByTerm.size > 0) {
          let recipientOverrides = cleanRecipientOverridesForExcelMerge(existingMember.recipientOverrides);
          const emailChanged = !!(existingMember.contactEmail && contactEmailForTargetTerm && contactEmailForTargetTerm !== existingMember.contactEmail);
          const nameChanged = !!(existingMember.contactName && contactNameForTargetTerm && contactNameForTargetTerm !== existingMember.contactName);
          if (emailChanged || nameChanged) {
            // "이전 연차"가 아니라 "이미 TermFee가 있는 연차"를 기준으로 고정한다 — 다년치 사업비를
            // 미리 입력해둬서 진행 연차보다 나중 연차가 이미 만들어져 있는 경우도 소급되면 안 된다.
            // termFees는 이 컴포넌트가 마운트될 때 찍힌 스냅샷이라, 이번 업로드가 "처음으로" 만드는
            // 연차(예: 그동안 2연차까지만 있었는데 이번에 1·2·3연차를 한꺼번에 올림)는 아직 여기 없다 —
            // 그런 연차를 빠뜨리면 "이미 지난 연차"인데도 방금 바뀐 새 값이 새어 들어간다. 그래서 이번
            // 엑셀이 실제로 값을 담고 있는 연차(agg.budgetsByTerm의 키)도 함께 합쳐서 대상에 넣는다.
            const existingTermNumbers = new Set([
              ...termFees.filter((f) => f.projectNumber === agg.projectNumber).map((f) => f.termNumber),
              ...agg.budgetsByTerm.keys(),
            ]);
            recipientOverrides = backfillExistingTermOverrides(
              existingMember.recipientOverrides,
              existingTermNumbers,
              targetTerm,
              // ??로 undefined일 때만 ""로 채운다 — 여기서 undefined를 그대로 두면 resolveMemberRecipientForTerm의
              // override?.recipientEmail ?? member.contactEmail 폴백이 "값 없음"으로 착각해 방금 바뀐
              // 새 기본값으로 새어 들어가 버린다(과거 연차가 옛 값이 아니라 새 값을 보여주는 버그).
              (termNumber) => ({
                termNumber,
                recipientName: existingMember.contactName ?? "",
                recipientEmail: existingMember.contactEmail ?? "",
                recipientPhone: existingMember.contactPhone ?? "",
              }),
            );
          }
          updates.recipientOverrides = buildRecipientOverridesFromExcel(agg, existingMember, recipientOverrides);
          if (contactEmailForTargetTerm) updates.contactEmail = contactEmailForTargetTerm;
          if (contactNameForTargetTerm) updates.contactName = contactNameForTargetTerm;
        }

        if (approved) {
          // 다른 연차 데이터는 보존하고, 이번 엑셀에 담긴 연차만 추가/교체한다.
          const newTermNumbers = new Set(annualBudgets.map((b) => b.termNumber));
          const mergedBudgets = [
            ...(existingMember.annualBudgets ?? []).filter((b) => !newTermNumbers.has(b.termNumber)),
            ...annualBudgets,
          ].sort((a, b) => a.termNumber - b.termNumber);
          const totalCash = mergedBudgets.reduce((s, b) => s + b.cashBudget, 0);
          const totalInKind = mergedBudgets.reduce((s, b) => s + b.inKindBudget, 0);

          // "연차별기관별" 시트에 연차마다 값이 있으면(예: 1~2연차 자체정산, 3연차부터 위탁정산)
          // 연차별 오버라이드로 정확히 반영한다 — 과제×기관당 단일값만 쓰면 마지막으로 읽은 연차의
          // 값이 통째로 덮어써서 "몇 연차부터 바뀌었는지"가 사라진다. 연차별 값이 아예 없으면(예:
          // "단계기관별" 시트만 업로드된 경우) 기존처럼 단일값으로 반영한다.
          const perTermBudgets = Array.from(agg.budgetsByTerm.values());
          const hasPerTermSettlement = perTermBudgets.some((b) => b.settlementType !== undefined);
          const hasPerTermGrade = perTermBudgets.some((b) => b.institutionGrade !== undefined);

          Object.assign(updates, {
            annualBudgets: mergedBudgets,
            budget: totalCash + totalInKind,
            cashBudget: totalCash,
            inKindBudget: totalInKind,
            role: agg.role,
          });
          if (hasPerTermSettlement) {
            updates.settlementTypeOverrides = buildSettlementTypeOverridesFromExcel(agg, existingMember.settlementTypeOverrides);
          } else {
            updates.settlementType = agg.settlementType;
          }
          if (hasPerTermGrade) {
            updates.gradeOverrides = buildGradeOverridesFromExcel(agg, existingMember.gradeOverrides);
          } else if (agg.institutionGrade) {
            // 셀에 "우수"라고만 적혀 있었다면(A/B/C 미지정) parseGrade가 우수(A)로 임의 확정한 값이다 —
            // 기존에 이미 더 구체적인 등급(우수(B)/우수(C))이 등록돼 있으면 이 모호한 값으로 깎지 않고 보존한다.
            const ambiguous = agg.institutionGradeRaw !== undefined && isAmbiguousGoodGrade(agg.institutionGradeRaw);
            const existingIsMoreSpecific = existingMember.institutionGrade === "우수(B)" || existingMember.institutionGrade === "우수(C)";
            if (!(ambiguous && existingIsMoreSpecific)) {
              updates.institutionGrade = agg.institutionGrade;
            }
          }
        }

        // 실제로 달라진 게 있을 때만 갱신 — 동일한 파일을 다시 올려도 변경이력에 빈 UPDATE가 쌓이지 않게 한다.
        const changed = (Object.keys(updates) as (keyof ProjectMember)[]).some(
          (k) => JSON.stringify(updates[k] ?? null) !== JSON.stringify(existingMember[k] ?? null)
        );

        if (changed) {
          touchedProjectIds.add(projectId);
          updateProjectMember(existingMember.id, updates);
          memberUpdatedCount++;
        }
      }
    }

    // 승인된 과제 갱신 — 진행연차/총연차뿐 아니라 단계 구조(stages)·단계일자·과제구분까지 함께
    // 갱신한다. (예전엔 "다음 연차"로 판정된 것만, 그마저 currentTerm/totalTerms만 갱신해서, 단계협약
    // 과제를 단계·연차별로 개별 재업로드하면 새 단계 구조가 반영될 방법이 없었다. 승인 대상도
    // "next" 상태로 한정하지 않는다 — "과거 연차" 등으로 표시돼도 사용자가 체크박스로 명시 승인하면
    // 그 판단을 신뢰해서 반영한다.)
    //
    // 단계 구조(stages)는 예외다 — "동일 연차 재제출"/"과거 연차"라서 연차·사업비 반영이 보류(체크박스
    // 꺼짐)돼도, resolveStageStructure는 기존 단계를 지우지 않고 새 단계를 추가하거나 기존 단계 길이를
    // 늘리기만 하는 안전한(추가적) 병합이라 그대로 반영한다. 그렇지 않으면 "단계기관별" 시트에 새 단계
    // (예: 2단계)를 추가해 올려도, 연차 값이 그대로라는 이유만으로 그 단계 정보까지 통째로 묻혀버린다.
    for (const info of projectUpdates) {
      const existingProject = projects.find((p) => p.id === info.projectId);
      if (!existingProject) continue;

      const stageInfo = stageAggregates.get(info.normNum);
      const { agreementType, stages, batchEndTerm } = resolveStageStructure(stageInfo, existingProject.stages);
      const maxStageEndTerm = stages ? Math.max(...stages.map((s) => s.endTermNumber)) : batchEndTerm;
      const nextAgreementType = agreementType ?? existingProject.agreementType;
      const nextStages = stages ?? existingProject.stages;
      const stageChanged =
        JSON.stringify(nextStages ?? null) !== JSON.stringify(existingProject.stages ?? null) ||
        nextAgreementType !== existingProject.agreementType;

      const approved = isApprovedUpdate(info.normNum);

      // 연차 반영이 보류된 경우(승인 안 됨) 단계 날짜·연차상시/정산 재계산은 "현재 등록된 연차" 기준으로 —
      // 승인된 경우에만 엑셀의 새 연차 기준으로 계산한다.
      const effectiveCurrentTerm = approved ? info.excelTerm : existingProject.currentTerm;

      // 책임자·과제담당자 이름/메일주소, 배정일 — 신규/이름변경 과제(위쪽 분기)와 달리 이 "기존 과제
      // 연차 갱신" 분기는 지금까지 이 필드들을 전혀 건드리지 않아서, 최초 등록 때 값이 갈려(row마다
      // 값이 달라) 비어 있었으면 이후 아무리 재업로드해도 영영 채워지지 않는 문제가 있었다. 이 값들은
      // 연차 진행과 무관한 정정 값이라, "동일 연차 재제출/과거 연차"라서 연차·사업비 반영이 보류돼도
      // (승인 체크박스 기본 꺼짐) 승인 여부와 무관하게 항상 반영한다 — 그래야 담당자가 메일주소 등을
      // 고치려고 재업로드했는데 체크박스를 놓쳐 정정이 통째로 묻히는 일이 없다.
      // scalarInfo가 이번 파일에서 값을 하나로 특정하지 못하면(비어 있거나 여전히 갈리면) 기존 값을 유지한다.
      const scalarInfo = scalarAggregates.get(info.normNum);
      const assignedManager = scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined;
      const assignedManagerPrimaryFallback = scalarInfo?.assignedManagersPrimary.size === 1 ? [...scalarInfo.assignedManagersPrimary][0] : undefined;
      const researchLead = resolveScalarForTerm(scalarInfo?.researchLeadsByTerm, effectiveCurrentTerm, scalarInfo?.researchLeads);
      const researchLeadEmail = resolveScalarForTerm(scalarInfo?.researchLeadEmailsByTerm, effectiveCurrentTerm, scalarInfo?.researchLeadEmails);
      const agencyAssignedAt = scalarInfo?.agencyAssignedAts.size === 1 ? [...scalarInfo.agencyAssignedAts][0] : undefined;
      const internalAssignedAt = scalarInfo?.internalAssignedAts.size === 1 ? [...scalarInfo.internalAssignedAts][0] : undefined;
      // 담당자는 연차별 이력이 있으면(연차마다 다른 사람) 이번에 반영되는 연차(effectiveCurrentTerm) 값을
      // 우선 채택한다. 과제담당자(정)/(부) 모두 이름은 동일한 규칙을 따른다(연락처·이메일은 더 이상 여기서 다루지 않음).
      const assignedManagerHistory = buildAssignedManagerHistory(scalarInfo, managerNameResolutions, users);
      const resolvedAssignedManager = scalarInfo?.assignedManagersByTerm.get(effectiveCurrentTerm) ?? assignedManager;
      const assignedManagerPrimaryHistory = buildAssignedManagerPrimaryHistory(scalarInfo, managerNameResolutions, users);
      const resolvedAssignedManagerPrimary = scalarInfo?.assignedManagersPrimaryByTerm.get(effectiveCurrentTerm) ?? assignedManagerPrimaryFallback;

      // 책임자 이름·이메일이 이번 엑셀 값으로 바뀌는 경우, 그 값이 반영되는 연차(effectiveCurrentTerm)
      // 이전 연차는 옛 값으로 고정해 소급 변경을 막는다(위 신규/이름변경 과제 분기와 동일한 원칙).
      const leadChanged =
        (researchLead !== undefined && researchLead !== existingProject.researchLead) ||
        (researchLeadEmail !== undefined && researchLeadEmail !== existingProject.researchLeadEmail);

      const safeUpdates: Partial<Project> = {
        assignedManager: resolvedAssignedManager ? applyManagerNameResolution(resolvedAssignedManager, managerNameResolutions, users) : existingProject.assignedManager,
        assignedManagerUserId: resolveManagerUserId(resolvedAssignedManager, existingProject.assignedManager, existingProject.assignedManagerUserId, managerNameResolutions),
        assignedManagerHistory: mergeTermHistory(existingProject.assignedManagerHistory, assignedManagerHistory),
        assignedManagerPrimary: resolvedAssignedManagerPrimary ? applyManagerNameResolution(resolvedAssignedManagerPrimary, managerNameResolutions, users) : existingProject.assignedManagerPrimary,
        assignedManagerPrimaryUserId: resolveManagerUserId(resolvedAssignedManagerPrimary, existingProject.assignedManagerPrimary, existingProject.assignedManagerPrimaryUserId, managerNameResolutions),
        assignedManagerPrimaryHistory: mergeTermHistory(existingProject.assignedManagerPrimaryHistory, assignedManagerPrimaryHistory),
        researchLead: researchLead ?? existingProject.researchLead,
        researchLeadEmail: researchLeadEmail ?? existingProject.researchLeadEmail,
        // ??로 undefined일 때만 ""로 채운다 — 그대로 두면 resolveResearchLeadForTerm의 override?.email ??
        // researchLeadEmail 폴백이 "값 없음"으로 착각해 방금 바뀐 새 기본값으로 새어 들어가 버린다.
        // "이전 연차"가 아니라 "이미 TermFee가 있는 연차"를 기준으로 고정한다 — 다년치 사업비를
        // 미리 입력해둬서 진행 연차보다 나중 연차가 이미 만들어져 있는 경우도 소급되면 안 된다.
        // termFees는 이 컴포넌트 마운트 시점 스냅샷이라 이번 업로드가 처음 만드는 연차는 아직 없다 —
        // 이번 파일이 실제로 값을 담은 연차(참여기관들의 budgetsByTerm)도 함께 합쳐야 빠지지 않는다.
        // 1) 기본값 변경 시 이미 있는 연차를 옛 값으로 고정(소급 방지) — 2) 그 위에 파일이 실제로
        // 담고 있는 연차별 값을 buildResearchLeadOverridesFromExcel로 정확히 얹는다(같은 연차 안에서
        // 서로 다른 값이 동시에 관측된 연차는 건너뛰고 이슈로 안내한다).
        researchLeadOverrides: buildResearchLeadOverridesFromExcel(
          scalarInfo,
          researchLead ?? existingProject.researchLead,
          researchLeadEmail ?? existingProject.researchLeadEmail,
          leadChanged
            ? backfillExistingTermOverrides(
                existingProject.researchLeadOverrides,
                new Set([
                  ...termFees.filter((f) => f.projectNumber === existingProject.projectNumber).map((f) => f.termNumber),
                  ...memberAggregates.filter((a) => normProjectNum(a.projectNumber) === info.normNum).flatMap((a) => [...a.budgetsByTerm.keys()]),
                ]),
                effectiveCurrentTerm,
                (termNumber) => ({
                  termNumber,
                  name: existingProject.researchLead ?? "",
                  email: existingProject.researchLeadEmail ?? "",
                }),
              )
            : existingProject.researchLeadOverrides,
        ),
        agencyAssignedAt: agencyAssignedAt ?? existingProject.agencyAssignedAt,
        internalAssignedAt: internalAssignedAt ?? existingProject.internalAssignedAt,
      };
      const hasSafeFieldChange = (Object.keys(safeUpdates) as (keyof Project)[]).some(
        (k) => JSON.stringify(safeUpdates[k] ?? null) !== JSON.stringify(existingProject[k] ?? null)
      );

      if (!approved && !stageChanged && !hasSafeFieldChange) continue; // 반영할 것이 아무것도 없음

      touchedProjectIds.add(info.projectId);

      const nextTotalTerms = Math.max(existingProject.totalTerms, approved ? info.excelTerm : 0, maxStageEndTerm);
      const currentStage = nextStages?.find((s) => effectiveCurrentTerm >= s.startTermNumber && effectiveCurrentTerm <= s.endTermNumber);
      const stageDateRange = currentStage ? stageInfo?.dateRanges.get(currentStage.stageNumber) : undefined;

      const updates: Partial<Project> = {
        agreementType: nextAgreementType,
        stages: nextStages,
        totalTerms: nextTotalTerms,
        stageStartDate: stageDateRange?.start ?? existingProject.stageStartDate,
        stageEndDate: stageDateRange?.end ?? existingProject.stageEndDate,
        ...safeUpdates,
      };

      if (approved) {
        const nextCurrentTerm = info.excelTerm;
        const projectCategory = isSettlementTerm(
          { agreementType: nextAgreementType, stages: nextStages, totalTerms: nextTotalTerms },
          nextCurrentTerm
        ) ? "정산" : "연차상시";

        // 당해(이번에 반영되는 연차) 정부출연금/민간현금/민간현물 — 신규/이름변경 과제와 동일하게
        // 참여기관 전체 합산해 갱신한다. 이 값들은 매년 바뀌는데 지금까지는 여기서 빠져 있어
        // 재업로드로 연차만 넘어가고 당해 사업비는 예전 값 그대로 남는 문제가 있었다.
        const { govGrant, privateCash, privateInKind } = sumTermFinancials(memberAggregates, info.normNum, nextCurrentTerm);
        const allTermFinancials = sumAllTermFinancials(memberAggregates, info.normNum);

        Object.assign(updates, {
          currentTerm: nextCurrentTerm,
          projectCategory,
          govGrant: govGrant > 0 ? govGrant : existingProject.govGrant,
          privateCash: privateCash > 0 ? privateCash : existingProject.privateCash,
          privateInKind: privateInKind > 0 ? privateInKind : existingProject.privateInKind,
          annualFinancials: mergeAnnualFinancials(existingProject.annualFinancials, allTermFinancials),
        });
      }

      updateProject(info.projectId, updates);
      // 단계 구조 예외 반영 여부는 아래 "동일 연차 재제출/과거 연차" 이슈 생성 루프에서 info.stageChanged로
      // 함께 안내한다 — 프로젝트당 이슈를 하나로 합쳐 담당자가 헷갈리지 않게 한다.
    }

    // 주관기관 정보 보정 — 과제 생성 시점엔 어느 행이 주관기관인지 알 수 없어 비워뒀으므로,
    // 참여기관 등록이 끝난 뒤 role="LEAD"로 판별된 기관으로 채워 넣는다.
    // 소속기관 자동판별이 켜진 전담기관(예: RDA1="fa-005"/RDA2="fa-006" — 둘 다 표시 이름이 "농촌진흥청")이
    // 있으면, 엑셀의 "전문기관명"만으론 어느 쪽인지 이름으로 구분이 안 된다 — 지금까지야 registeredAgencies가
    // 이름 하나에 id 하나만 담을 수 있어 항상 같은 쪽으로 쏠렸다. 여기서 주관기관명이 확정된 시점에
    // resolveAutoDetectedAgencyId로 실제 전담기관을 다시 판별해 agencyId/agency를 바로잡는다.
    for (const agg of memberAggregates) {
      if (agg.role !== "LEAD") continue;
      const projectId = registeredProjects.get(normProjectNum(agg.projectNumber));
      const institutionId = registeredInst.get(normBiz(agg.bizNumber));
      if (!projectId || !institutionId) continue;

      const existingProject = projects.find((p) => p.id === projectId);
      if (existingProject?.leadInstitutionId) continue; // 기존 과제에 이미 지정된 주관기관은 건드리지 않음

      // projects(useStore 스냅샷)는 이번에 새로 만든 과제를 못 찾으므로(stale), 생성 시점에 기록해둔
      // newProjectAgencyId를 우선 쓰고, 그래도 없으면(기존 과제 경로 등) existingProject로 보완한다.
      const currentAgencyId = newProjectAgencyId.get(normProjectNum(agg.projectNumber)) ?? existingProject?.agencyId;
      const resolvedAgencyId = currentAgencyId
        ? resolveAutoDetectedAgencyId(currentAgencyId, agg.institutionName, fundingAgencies)
        : undefined;
      const resolvedAgency = resolvedAgencyId && resolvedAgencyId !== currentAgencyId
        ? fundingAgencies.find((a) => a.id === resolvedAgencyId)?.name
        : undefined;

      updateProject(projectId, {
        leadInstitutionId: institutionId,
        leadInstitutionName: agg.institutionName,
        ...(resolvedAgencyId && resolvedAgencyId !== currentAgencyId
          ? { agencyId: resolvedAgencyId, agency: resolvedAgency }
          : {}),
      });
      leadResolvedProjectIds.add(projectId);
    }

    // 회계법인 자동 반영 — "연차별기관별" 시트의 "회계법인" 값이 삼화가 아니면, 그 연차를 타회계법인
    // 진행으로 자동 표시한다. 삼화가 정산연차만 새로 배정받고 이전 연차상시는 다른 회계법인이 진행한
    // 과제를 엑셀 한 번에 등록 + 표시까지 마칠 수 있게 하기 위함(수동으로 과제 상세에서 연차마다 체크할
    // 필요가 없어짐). 예전엔 "단계기관별" 시트 값을 썼는데, 그 시트는 재업로드해도 값이 갱신되지 않는
    // 고정 스냅샷이라 실제 그 해 담당 회계법인과 어긋날 수 있어 연차별로 갱신되는 이 시트 값으로 바꿨다.
    // TermFee는 위 참여기관 등록 단계에서 이미 자동 생성되어 있어야 찾을 수 있다.
    for (const agg of memberAggregates) {
      const normNum = normProjectNum(agg.projectNumber);
      const projectId = registeredProjects.get(normNum);
      if (!projectId) continue;
      const projectNumber = projectNumberByNormNum.get(normNum);
      if (!projectNumber) continue;
      const startDate = newProjectStartDate.get(normNum) ?? projects.find((p) => p.id === projectId)?.startDate;
      if (!startDate) continue;

      for (const b of agg.budgetsByTerm.values()) {
        if (!b.auditFirm || !isOtherFirmName(b.auditFirm)) continue;
        const termYear = computeTermYear(startDate, b.termNumber);
        setTermOtherFirmHandled(projectNumber, termYear, b.termNumber, true);
      }
    }

    // 총사업비 재계산 — 이번에 새로 만들었거나 갱신한 과제만 대상으로, 참여기관 사업비 합계로 맞춘다.
    touchedProjectIds.forEach((pid) => recalcProjectTotalBudget(pid));

    const advancedProjectCount = projectUpdates.filter(
      (u) => u.status === "next" && isApprovedUpdate(u.normNum)
    ).length;

    // 자동으로 채우지 못했거나(단계 구조), 같은 과제인데 행마다 값이 갈려서(과제담당자·과제코드·
    // 연구책임자·과제명) 어느 값이 맞는지 판단할 수 없는 경우는 조용히 추정해서 반영하지 않고,
    // 과제 담당자·회계담당자에게 이슈로 남겨서 직접 확인하도록 한다.
    const reviewNormNums = new Set([...stageAggregates.keys(), ...scalarAggregates.keys()]);
    for (const normNum of reviewNormNums) {
      const projectId = registeredProjects.get(normNum);
      if (!projectId) continue;

      const reasons: string[] = [];
      const stageInfo = stageAggregates.get(normNum);
      if (stageInfo?.hasMissing) {
        const detail = stageInfo.skipReasons.length > 0
          ? "\n" + stageInfo.skipReasons.map((r) => `  - ${r}`).join("\n")
          : "";
        reasons.push(`"단계기관별" 시트에서 일부 행이 단계 구조(협약구조) 계산에서 제외됐습니다 — 그 행의 단계는 등록되지 않으니 값을 고쳐 다시 올려주세요.${detail}`);
      }
      const scalarInfo = scalarAggregates.get(normNum);
      if (scalarInfo) {
        if (scalarInfo.projectNames.size > 1) {
          reasons.push(`같은 과제번호인데 과제명이 서로 다릅니다: ${[...scalarInfo.projectNames].join(" / ")}`);
        }
        // 과제담당자(정)/(부) 모두 연차마다 바뀔 수 있어(인사이동 등) ...ByTerm으로 연차별 이력을
        // 그대로 반영하므로, 값이 여러 개라고 해서 확인 이슈로 남기지 않는다.
        if (scalarInfo.researchLeads.size > 1) {
          reasons.push(`주관기관 기관책임자(연구책임자)가 서로 달라 등록하지 않았습니다: ${[...scalarInfo.researchLeads].join(" / ")}`);
        }
        if (scalarInfo.researchLeadEmails.size > 1) {
          reasons.push(`주관기관 책임자 메일주소가 서로 달라 등록하지 않았습니다: ${[...scalarInfo.researchLeadEmails].join(" / ")}`);
        }
      }
      if (reasons.length === 0) continue;

      const project = projects.find((p) => p.id === projectId);
      addProjectIssue({
        projectId,
        projectNumber: project?.projectNumber ?? normNum,
        content: `RCMS 엑셀 업로드 — 아래 항목을 자동으로 채우지 못해 확인이 필요합니다.\n${reasons.map((r) => `· ${r}`).join("\n")}\n과제 상세 페이지에서 직접 확인·입력해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "MEDIUM",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 과제코드/이름+기간 매칭 후보가 여러 개라 자동으로 어느 과제인지 판단 못 한 경우 — 첫 번째
    // 후보 과제에 이슈를 남겨서(그 과제의 이슈 목록에서 확인 가능) 담당자·회계담당자에게 알린다.
    for (const amb of renameAmbiguities) {
      const anchor = amb.candidates[0];
      const candidateList = amb.candidates.map((c) => `${c.projectName} (${c.projectNumber})`).join(" / ");
      addProjectIssue({
        projectId: anchor.id,
        projectNumber: anchor.projectNumber,
        content: `RCMS 엑셀 업로드 — 과제번호 "${amb.rawProjectNumber}"(과제명: ${amb.projectName})가 기존 과제 중 어느 것과 같은 과제인지 자동으로 판단할 수 없어 등록하지 않았습니다.\n후보: ${candidateList}\n과제코드 또는 과제명·시작일·종료일을 확인해 직접 연결해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "HIGH",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 새 과제가 과제명/총개발시작일자 없이 임시값으로 등록된 경우 — 실제 값으로 정정하도록 알린다.
    for (const info of newProjectMissingInfo) {
      addProjectIssue({
        projectId: info.projectId,
        projectNumber: info.projectNumber,
        content: `RCMS 엑셀 업로드 — 이 과제가 새로 등록될 때 ${info.missingFields.join("·")} 정보가 파일에 없어 임시값으로 채워졌습니다(과제명 "미입력" 및/또는 시작일 "오늘 날짜").\n과제 상세 페이지에서 실제 값으로 정정해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "HIGH",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 새로 등록된 과제 중 참여기관 어디에도 "기관역할구분=주관"으로 표시된 행이 없어 주관기관을
    // 끝내 못 채운 경우 — 조용히 빈 값으로 남기지 않고 이슈로 알린다. 이 상태로 두면 화면에
    // 주관기관이 빈칸으로 보일 뿐 아니라, 표시 이름이 같은 전담기관이 둘 이상(RDA1/RDA2 등) 등록돼
    // 있을 때 처음에 임의로 배정된 쪽(대개 배열의 나중 항목)이 그대로 굳어버린다.
    for (const [projectId, projectNumber] of newProjectIdsForLeadCheck) {
      if (leadResolvedProjectIds.has(projectId)) continue;
      addProjectIssue({
        projectId,
        projectNumber,
        content:
          `RCMS 엑셀 업로드 — 이 과제가 새로 등록됐지만 참여기관 중 "기관역할구분"을 "주관"으로 표시한 행이 없어 주관기관이 비어 있습니다.\n` +
          `전담기관도 정확히 판별되지 않았을 수 있습니다(같은 이름의 전담기관이 여러 개 등록된 경우 특히). 과제 상세 페이지에서 주관기관·전담기관을 확인해 직접 지정해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "HIGH",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 동일 연차 재제출/과거 연차 데이터 — 체크박스로 반영 여부는 이미 결정됐지만(위 참여기관·과제 갱신
    // 루프), 사용자가 그 순간 놓칠 수 있으니 무엇으로 결정됐는지 담당자·회계담당자에게도 남겨둔다.
    for (const info of projectUpdates) {
      const applied = isApprovedUpdate(info.normNum);
      // 정상적으로 다음 연차로 진행되고(체크박스 그대로 승인) 단계 구조도 안 바뀐 경우만 알림 불필요.
      // 사용자가 "다음 연차"를 일부러 반려했거나, 단계 구조가 바뀐 경우엔 next여도 알려준다.
      if (info.status === "next" && applied && !info.stageChanged) continue;
      const stageNote = info.stageChanged
        ? (applied
          ? " 단계 구조(새 단계 추가 등) 변경도 함께 반영됐습니다."
          : " 다만 단계 구조(새 단계 추가 등) 변경은 안전한 추가 정보라 연차와 무관하게 예외적으로 반영됐습니다.")
        : "";
      const statusLabel = info.status === "same" ? "동일 연차 재제출" : info.status === "behind" ? "과거 연차 데이터" : "다음 연차 반영 보류";
      addProjectIssue({
        projectId: info.projectId,
        projectNumber: info.projectNumber,
        content: `RCMS 엑셀 업로드 — ${statusLabel} (기존 ${info.currentTerm}연차 → 엑셀 ${info.excelTerm}연차).\n이번 업로드에서 연차·사업비는 ${applied ? "반영했습니다" : "반영하지 않았습니다"}.${stageNote} 의도한 결과가 맞는지 확인해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "MEDIUM",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 엑셀 연차값과 총개발시작일자 기준 캘린더 계산이 다른 과제 — 이번에 실제로 등록/갱신된 과제만.
    for (const m of calendarMismatches) {
      const projectId = registeredProjects.get(m.normNum);
      if (!projectId || !touchedProjectIds.has(projectId)) continue;
      addProjectIssue({
        projectId,
        projectNumber: m.projectNumber,
        content: `RCMS 엑셀 업로드 — 엑셀에는 ${m.excelTerm}연차로 등록됐지만, 총개발시작일자 기준으로 계산하면 ${m.calendarTerm}연차일 것으로 예상됩니다.\n일정보다 빠르거나 늦게 진행 중이라면 문제 없지만, 연차 값이나 총개발시작일자가 잘못 입력됐을 수도 있으니 확인해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "MEDIUM",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    // 사업비·연락처 미입력 참여기관 — 등록/갱신 자체는 막지 않았지만, 수수료 계산·공문 발송이라는
    // 핵심 기능이 그 기관에서 안 돌아가는 상태로 남으므로 과제별로 묶어 이슈를 남긴다(이번에 실제로
    // 등록/갱신된 과제만 — 이미 등록된 다른 과제까지 매번 다시 이슈로 남기지 않기 위함).
    const memberWarningsByProject = new Map<string, typeof memberDataWarnings>();
    for (const w of memberDataWarnings) {
      const projectId = registeredProjects.get(normProjectNum(w.projectNumber));
      if (!projectId || !touchedProjectIds.has(projectId)) continue;
      if (!memberWarningsByProject.has(projectId)) memberWarningsByProject.set(projectId, []);
      memberWarningsByProject.get(projectId)!.push(w);
    }
    for (const [projectId, ws] of memberWarningsByProject) {
      const project = projects.find((p) => p.id === projectId);
      addProjectIssue({
        projectId,
        projectNumber: project?.projectNumber ?? ws[0].projectNumber,
        content: `RCMS 엑셀 업로드 — 아래 참여기관은 사업비 또는 연락처(실무자 메일)가 없어 수수료 계산·공문 발송이 되지 않습니다.\n${ws.map((w) => `· ${w.institutionName}: ${w.missing.join(", ")} 없음`).join("\n")}\n과제 상세 페이지 참여기관 목록에서 값을 채워주세요.`,
        author: authorName,
        createdAt: now,
        priority: "HIGH",
        status: "OPEN",
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    const syncFailures = await endSyncBatchAndWait();
    setDoneResult({
      agency: agencyCount,
      project: projectCount,
      inst: instCount,
      member: memberCount,
      memberUpdated: memberUpdatedCount,
      projectAdvanced: advancedProjectCount,
      stageAlerts: stageAlertCount,
      renamed: renamedCount,
      syncFailures,
    });
    setLoading(false);
    setStep("done");
  }

  // ── 스텝 제목 ────────────────────────────────────────────────

  const TITLES: Record<Step, string> = {
    upload: "RCMS 엑셀 업로드",
    sheet: "시트 탐색",
    mapping: "컬럼 매핑 확인",
    duplicate: "중복 검사",
    preview: "미리보기 및 등록",
    done: "등록 완료",
  };

  const STEPS: Step[] = ["upload", "sheet", "mapping", "preview", "done"];
  const stepIdx = STEPS.indexOf(step);

  return (
    <>
    <Modal title={TITLES[step]} onClose={onClose} size="xl" fixedHeight>
      {/* 진행 표시 */}
      {step !== "done" && (
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center gap-1.5">
            {["파일 선택", "시트 탐색", "컬럼 매핑", "미리보기"].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  i < stepIdx ? "bg-blue-600 text-white" : i === stepIdx ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-slate-200 text-slate-500"
                }`}>{i + 1}</div>
                <span className={`text-[10px] whitespace-nowrap ${i === stepIdx ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{label}</span>
                {i < 3 && <div className={`w-8 h-px shrink-0 ${i < stepIdx ? "bg-blue-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 shrink-0">
          {error}
        </div>
      )}

      {/* 스텝 콘텐츠 — 진행 표시/오류 배너와 분리된 영역에서 자체적으로 높이·스크롤을 관리한다.
          (Modal 본문 전체가 스크롤되면, 내용이 길어질 때 하단 버튼이 스크롤해야만 보이는 문제가 있었다.) */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {step === "upload" && (
          <div className="p-6 h-full flex flex-col">
            <UploadZone onFile={handleFile} className="flex-1" />
          </div>
        )}

        {step === "sheet" && (
          <SheetStep
            allSheetNames={allSheetNames}
            matched={matchedSheets}
            onConfirm={() => handleSheetConfirm(parsedSheets)}
            onBack={() => setStep("upload")}
            onManualAssign={assignSheetManually}
            onUnassign={unassignSheet}
          />
        )}

        {step === "mapping" && (
          <MappingStep
            parsedSheets={parsedSheets}
            onUpdateMapping={updateMapping}
            onConfirm={buildPreview}
            onBack={() => setStep("sheet")}
          />
        )}

        {step === "preview" && (
          <PreviewStep
            previewRows={previewRows}
            newMembers={newMembers}
            projectUpdates={projectUpdates}
            updateChoices={projectUpdateChoices}
            onToggleUpdate={toggleProjectUpdate}
            calendarMismatches={calendarMismatches}
            stageSkipWarnings={stageSkipWarnings}
            memberDataWarnings={memberDataWarnings}
            managerAmbiguities={managerAmbiguities}
            managerNotFound={managerNotFound}
            managerNameResolutions={managerNameResolutions}
            users={users}
            onResolveManagerName={setManagerPickerName}
            onConfirm={doRegister}
            onBack={() => setStep(previewBackStep)}
            loading={loading}
          />
        )}

        {step === "done" && (
          <DoneStep result={doneResult} onClose={onClose} />
        )}
      </div>
    </Modal>
    {managerPickerName && (
      <ManagerPickerModal
        title={
          managerAmbiguities.some((a) => a.name === managerPickerName)
            ? `"${managerPickerName}" 중 어느 계정인가요?`
            : `"${managerPickerName}"은(는) [권한관리]에 없습니다 — 실제 계정을 선택해주세요`
        }
        users={managerAmbiguities.find((a) => a.name === managerPickerName)?.candidates ?? users.filter((u) => u.status === "ACTIVE")}
        onSelect={(user) => setManagerNameResolutions((prev) => ({ ...prev, [managerPickerName]: user.id }))}
        onClose={() => setManagerPickerName(null)}
      />
    )}
    </>
  );
}
