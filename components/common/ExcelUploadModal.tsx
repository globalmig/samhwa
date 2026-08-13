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
  addInstitution,
  addProject,
  addProjectMember,
  addProjectIssue,
  updateProject,
  updateProjectMember,
  recalcProjectTotalBudget,
  setTermOtherFirmHandled,
} from "@/lib/store";
import type { Project, ProjectMember, AnnualBudget, AnnualFinancials } from "@/lib/mock";
import { getCurrentUser } from "@/lib/auth";
import { isSettlementTerm, resolveRdaAgencyId } from "@/lib/fee-calculator";

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
  key: string;
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

// ============================================================
// 유틸
// ============================================================

function normBiz(s: string): string {
  return s.replace(/[^0-9]/g, "");
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
  sheets: ParsedSheet[]
): {
  members: MemberAggregate[];
  projectMaxTerm: Map<string, number>;
} {
  const memberMap = new Map<string, MemberAggregate>();
  const projectMaxTerm = new Map<string, number>();

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

      if (sheet.def.key === "annual") {
        if (roleStr.includes("주관")) agg.role = "LEAD";
        else if (roleStr.includes("위탁")) agg.role = "ENTRUSTED";
        if (roleStr) agg.roleFromAnnual = true;

        if (settlementStr) {
          agg.settlementType = settlementStr.includes("자체") ? "자체정산" : "위탁정산";
          agg.settlementFromAnnual = true;
        }

        if (parsedGrade) {
          agg.institutionGrade = parsedGrade;
          agg.gradeFromAnnual = true;
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
        if (!agg.gradeFromAnnual && parsedGrade) {
          agg.institutionGrade = parsedGrade;
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
        agg.budgetsByTerm.set(termNumber, { termYear: supportYear, termNumber, cashBudget, inKindBudget, govGrant, privateCash, privateInKind, termStartDate, termEndDate, auditFirm });
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
  researchLeads: Set<string>;     // 주관기관 기관책임자
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
        projectNames: new Set(), assignedManagers: new Set(), researchLeads: new Set(),
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
      if (manager) info.assignedManagers.add(manager);

      if (get("autonomyTrack", row) === "자율성트랙") info.isAutonomyTrack = true;

      // 연구책임자는 "주관"기관 행의 기관책임자만 채택 — 공동기관 책임자는 과제 전체의
      // 연구책임자가 아니므로 섞이면 안 된다.
      const roleStr = get("institutionRole", row);
      const lead = get("institutionLead", row);
      if (lead && roleStr.includes("주관")) info.researchLeads.add(lead);

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
  projectMaxTerm: Map<string, number>,
  stageAggregates: Map<string, ProjectStageInfo>
): ProjectUpdateInfo[] {
  const normNums = new Set(memberAggregates.map((m) => normProjectNum(m.projectNumber)));
  // 단계기관별 시트만 있고 연차별기관별 시트엔 해당 과제 행이 없는 업로드도 잡아내기 위해,
  // 단계 정보로만 알려진 과제번호도 비교 대상에 포함한다.
  for (const normNum of stageAggregates.keys()) normNums.add(normNum);
  const updates: ProjectUpdateInfo[] = [];
  for (const normNum of normNums) {
    const existing = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
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

    updates.push({
      normNum,
      projectId: existing.id,
      projectNumber: existing.projectNumber,
      projectName: existing.projectName,
      currentTerm,
      excelTerm,
      status,
      stageChanged,
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
  const mismatches: TermCalendarMismatch[] = [];
  for (const [normNum, excelTerm] of projectMaxTerm) {
    const existingProject = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
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
      instSet.add(r.bizNumber); newInstList.push({ bizNumber: r.bizNumber, institutionName: r.institutionName });
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
  const approvedUpdateCount = projectUpdates.filter(
    (u) => updateChoices[u.normNum] ?? defaultChoiceForStatus(u.status)
  ).length;
  const reviewCount = dupRows.length + stageSkipWarnings.length + projectUpdates.length + calendarMismatches.length;

  const totalToRegister = newAgency + newProject + newInst + newMemberCount + approvedUpdateCount;

  const TABS: { key: PreviewTabKey; label: string; count: number; Icon: typeof FiFlag; warn?: boolean }[] = [
    { key: "review", label: "확인필요", count: reviewCount, Icon: FiAlertTriangle, warn: true },
    { key: "agency", label: "신규 전담기관", count: newAgency, Icon: FiFlag },
    { key: "project", label: "신규 과제", count: newProject, Icon: FiFolderPlus },
    { key: "inst", label: "신규 기관", count: newInst, Icon: FiHome },
    { key: "member", label: "신규 참여기관", count: newMemberCount, Icon: FiUsers },
  ];
  // 처음 열렸을 때는 "확인필요"가 탭 맨 앞이어도 곧바로 경고창부터 보여주기보다,
  // 무엇이 새로 등록되는지(신규 항목)부터 먼저 보여주고 확인필요는 사용자가 직접 눌러보게 한다.
  const [activeTab, setActiveTab] = useState<PreviewTabKey>(
    (["project", "inst", "member", "agency", "review"] as PreviewTabKey[])
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
                              {" · "}{d.key}
                              {d.status === "similar" ? ` — 유사 ${d.score}% ("${d.existing}"와 비교)` : " — 이미 등록됨"}
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

                  {/* 기존 과제 갱신 */}
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
            disabled={loading || (totalNew === 0 && approvedUpdateCount === 0)}
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

export async function downloadExcelTemplate() {
  const notes = [
    "※필수", "※필수", "※필수",
    "선택", "선택 (\"자율성트랙\"만 인식)",
    "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
    "선택", "※필수 (이 행의 사업비가 몇 연차 것인지 — 비면 1연차로 잘못 등록됨)", "선택",
    "※필수", "※필수 (000-00-00000)",
    "선택 (주관/공동/위탁)", "선택 (최우수/우수/일반, 미입력시 등급 없음)", "선택 (위탁정산/자체정산)",
    "선택 (삼화가 아니면 이 연차를 타회계법인 진행으로 자동 표시)",
    "선택 (연차상시/정산, 미입력시 협약구조로 자동판정 — \"정산형태\"와는 다른 값)",
    "선택 (주관기관 행에만, 없으면 단계기관별 시트의 값을 사용)",
    "선택 (YYYY-MM-DD)", "선택 (YYYY-MM-DD)",
    "선택 (YYYY-MM-DD, 이 연차의 실제 시작일 — 있으면 자동계산 대신 사용)",
    "선택 (YYYY-MM-DD, 이 연차의 실제 종료일 — 있으면 자동계산 대신 사용)",
    "선택 (YYYY-MM-DD, 단계기관별 시트가 없을 때의 보조 수단)", "선택 (YYYY-MM-DD, 단계기관별 시트가 없을 때의 보조 수단)",
    "※필수 (이 연차 현금사업비 — 참여기관별·연차별 사업비. 비면 이 연차엔 참여 안 함으로 처리됨)",
    "선택 (이 연차 현물사업비 — 있으면 아래 \"현물사업비총액\"보다 우선)",
    "선택 (이 연차 정부출연금 — 과제의 당해 정부출연금 합산에 사용)",
    "선택 (이 연차 민간현금 — 과제의 당해 민간현금 합산에 사용)",
    "선택 (이 연차 민간현물 — 과제의 당해 민간현물 합산에 사용)",
    "선택 (원 단위, 위 \"연차_기관_총사업비(현금)\"이 없을 때만 쓰는 대체값)", "선택 (원 단위, 위 \"연차_기관_총사업비(현물)\" 없을 때만 사용)",
  ];
  const headers = [
    "전문기관명", "과제번호", "과제명",
    "과제담당자", "자율성트랙",
    "총개발시작일자", "총개발종료일자",
    "단계", "연차", "지원연도",
    "연구개발기관명", "기관사업자등록번호",
    "기관역할구분", "등급", "정산형태", "회계법인",
    "과제구분", "연구책임자",
    "전문기관배정일", "내부배정일",
    "연차시작일자", "연차종료일자",
    "단계시작일자", "단계종료일자",
    "연차_기관_총사업비(현금)", "연차_기관_총사업비(현물)",
    "연차_기관_정부출연금", "연차_기관_민간부담금(현금)", "연차_기관_민간부담금(현물)",
    "현금사업비총액", "현물사업비총액",
  ];
  const rows = [
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "삼화기술경영(주)", "123-45-67890",
      "주관", "우수", "위탁정산", "",
      "연차상시", "박연구",
      "2024-01-15", "2024-02-01",
      "2024-03-01", "2025-02-28",
      "2024-03-01", "2027-02-28",
      "500000000", "0",
      "400000000", "100000000", "0",
      "500000000", "0",
    ],
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "참여기업(주)", "234-56-78901",
      "공동", "", "위탁정산", "",
      "연차상시", "",
      "", "",
      "2024-03-01", "2025-02-28",
      "2024-03-01", "2027-02-28",
      "200000000", "0",
      "150000000", "50000000", "0",
      "200000000", "0",
    ],
    [
      "한국에너지기술평가원", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "김담당", "자율성트랙",
      "2024-06-01", "2026-05-31", "0", "1", "2024",
      "에너지연구소", "345-67-89012",
      "주관", "최우수", "자체정산", "",
      "연차상시", "이연구",
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
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = 22; });
  styleTemplateHeader(ws, notes, 2);
  styleTemplateDataRows(ws, 3, 2 + TEMPLATE_BLANK_ROWS, headers.length);
  applyDropdown(ws, headers.indexOf("자율성트랙") + 1, ["", "자율성트랙"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("기관역할구분") + 1, ["주관", "공동", "위탁"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("등급") + 1, ["최우수", "우수", "일반", ""], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("정산형태") + 1, ["위탁정산", "자체정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("과제구분") + 1, ["", "연차상시", "정산"], 3, 2 + TEMPLATE_BLANK_ROWS);

  const stageNotes = [
    "※필수", "선택", "※필수", "※필수",
    "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
    "선택 (0=일괄협약, 1 이상=단계협약)", "선택 (연차 숫자)", "선택 (시작단계와 동일해야 함)", "선택 (연차 숫자)",
    "선택 (YYYY-MM-DD, 이 단계의 실제 시작일)", "선택 (YYYY-MM-DD, 이 단계의 실제 종료일)",
    "선택",
    "※필수", "※필수 (000-00-00000)", "선택 (주관/공동/위탁)", "선택 (최우수/우수/일반)", "선택 (주관기관 행에만)",
    "※필수 (원 단위)", "선택 (원 단위)",
  ];
  const stageHeaders = [
    "전문기관명", "RCMS사업명", "과제번호", "과제명",
    "총개발시작일자", "총개발종료일자",
    "정산대상시작단계", "정산대상시작연차", "정산대상종료단계", "정산대상종료연차",
    "단계시작일자", "단계종료일자",
    "정산형태구분",
    "연구기관명", "기관사업자등록번호", "기관역할구분", "기관등급", "연구책임자",
    "기관_총사업비(현금)", "기관_총사업비(현물)",
  ];
  const stageRows = [
    [
      "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "2024-03-01", "2027-02-28", "위탁정산",
      "삼화기술경영(주)", "123-45-67890", "주관", "일반", "홍길동", "500000000", "0",
    ],
    [
      "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "2024-03-01", "2027-02-28", "위탁정산",
      "참여기업(주)", "234-56-78901", "공동", "우수", "", "200000000", "0",
    ],
    [
      "한국에너지기술평가원", "신재생에너지핵심기술개발", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "2024-06-01", "2026-05-31", "0", "1", "0", "4", "2024-06-01", "2026-05-31", "위탁정산",
      "에너지연구소", "345-67-89012", "주관", "최우수", "박연구", "800000000", "50000000",
    ],
  ];

  const stageWs = wb.addWorksheet("단계기관별", { views: [{ state: "frozen", ySplit: 2 }] });
  stageWs.addRow(stageNotes);
  stageWs.addRow(stageHeaders);
  stageRows.forEach((r) => stageWs.addRow(r));
  stageHeaders.forEach((_, i) => { stageWs.getColumn(i + 1).width = 22; });
  styleTemplateHeader(stageWs, stageNotes, 2);
  styleTemplateDataRows(stageWs, 3, 2 + TEMPLATE_BLANK_ROWS, stageHeaders.length);
  applyDropdown(stageWs, stageHeaders.indexOf("정산형태구분") + 1, ["위탁정산", "자체정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(stageWs, stageHeaders.indexOf("기관역할구분") + 1, ["주관", "공동", "위탁"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(stageWs, stageHeaders.indexOf("기관등급") + 1, ["최우수", "우수", "일반"], 3, 2 + TEMPLATE_BLANK_ROWS);

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
  const { fundingAgencies, institutions, projects, projectMembers } = useStore();
  const [step, setStep] = useState<Step>("upload");
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [matchedSheets, setMatchedSheets] = useState<{ sheetName: string; def: SheetDef }[]>([]);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [doneResult, setDoneResult] = useState<DoneResult>({ agency: 0, project: 0, inst: 0, member: 0, memberUpdated: 0, projectAdvanced: 0, stageAlerts: 0, renamed: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBackStep, setPreviewBackStep] = useState<Step>("mapping");
  const [projectUpdateChoices, setProjectUpdateChoices] = useState<Record<string, boolean>>({});

  // "단계기관별" 시트의 정산대상시작/종료단계·연차 값으로 과제별 단계 구조(Project.stages)를 추정
  // — 아래 buildMemberAggregates가 "연차별기관별" 시트의 상대연차를 절대연차로 바꾸는 데 이 결과가 필요하므로 먼저 계산한다.
  const stageAggregates = useMemo(() => {
    const map = buildStageAggregates(parsedSheets);
    supplementStageDatesFromAnnual(parsedSheets, map);
    return map;
  }, [parsedSheets]);

  // "연차별기관별" + "단계기관별" 시트를 과제+기관 단위로 합산 — 참여기관(ProjectMember) 등록에 사용
  const { members: memberAggregates, projectMaxTerm } = useMemo(
    () => buildMemberAggregates(parsedSheets),
    [parsedSheets]
  );

  // 과제담당자·자율성트랙·과제코드·연구책임자 등 과제 레벨 단일값 — 여러 행에 값이 갈리면 등록하지 않고 이슈로 남긴다
  const scalarAggregates = useMemo(() => buildProjectScalarAggregates(parsedSheets), [parsedSheets]);

  // 이미 등록된 과제 중 이번 엑셀이 다음/동일/과거 연차 중 무엇에 해당하는지 판단
  const projectUpdates = useMemo(
    () => computeProjectUpdates(projects, memberAggregates, projectMaxTerm, stageAggregates),
    [projects, memberAggregates, projectMaxTerm, stageAggregates]
  );

  // 엑셀 연차값과 총개발시작일자 기준 캘린더 계산값이 다른 과제 — 등록 자체는 막지 않고 미리보기에서
  // 경고로 보여준 뒤, 등록 후 담당자·회계담당자에게 확인 이슈를 남긴다.
  const calendarMismatches = useMemo(
    () => computeTermCalendarMismatches(projects, scalarAggregates, projectMaxTerm, stageAggregates, new Date().toISOString().slice(0, 10)),
    [projects, scalarAggregates, projectMaxTerm, stageAggregates]
  );

  // "단계기관별" 시트에서 일부 행이 값 문제로 통째로 걸러진 과제 — 등록 전 미리보기에서 바로 알려준다.
  // (예: 정산대상시작단계가 비어있거나, 시작단계≠종료단계인 행은 그 단계 정보 없이 조용히 진행된다.)
  const stageSkipWarnings = useMemo(() => {
    const warnings: { normNum: string; projectNumber: string; projectName: string; reasons: string[] }[] = [];
    for (const [normNum, info] of stageAggregates) {
      if (!info.hasMissing || info.skipReasons.length === 0) continue;
      const existing = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
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

  function toggleProjectUpdate(normNum: string, next: boolean) {
    setProjectUpdateChoices((prev) => ({ ...prev, [normNum]: next }));
  }

  // 이미 참여기관으로 연결된 (과제, 기관) 쌍은 제외하고 새로 등록될 참여기관 목록을 계산
  const newMembers = useMemo(() => {
    const existingKeys = new Set<string>();
    for (const pm of projectMembers) {
      const proj = projects.find((p) => p.id === pm.projectId);
      const inst = institutions.find((i) => i.id === pm.institutionId);
      if (proj && inst) existingKeys.add(`${normProjectNum(proj.projectNumber)}|${normBiz(inst.bizNumber)}`);
    }
    return memberAggregates.filter((m) => !existingKeys.has(m.key));
  }, [memberAggregates, projectMembers, projects, institutions]);
  const newMemberCount = newMembers.length;

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

    // 중복 검사
    const preview: PreviewRow[] = extracted.map((row) => {
      const duplicates: DuplicateInfo[] = [];

      // 전담기관 중복
      const existingAgency = fundingAgencies.find((a) => a.name === row.agencyName);
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

      // 과제 중복
      const normNum = normProjectNum(row.projectNumber);
      const existingProj = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
      if (existingProj) {
        duplicates.push({ type: "project", key: row.projectNumber, existing: existingProj.projectNumber, status: "exact" });
      } else {
        for (const p of projects) {
          const sc = strSimilarity(normNum, normProjectNum(p.projectNumber));
          if (sc >= 85) {
            duplicates.push({ type: "project", key: row.projectNumber, existing: p.projectNumber, status: "similar", score: sc });
            break;
          }
        }
      }

      // 기관 중복
      const normBizNum = normBiz(row.bizNumber);
      if (normBizNum) {
        const existingInst = institutions.find((i) => normBiz(i.bizNumber) === normBizNum);
        if (existingInst) {
          duplicates.push({ type: "institution", key: row.bizNumber, existing: existingInst.name, status: "exact" });
        }
      }

      const agencyDup = duplicates.some((d) => d.type === "agency");
      const projectDup = duplicates.some((d) => d.type === "project");
      const instDup = duplicates.some((d) => d.type === "institution");

      return {
        ...row,
        duplicates,
        willRegister: {
          agency: !agencyDup,
          project: !projectDup,
          institution: !instDup && !!normBizNum,
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

  function doRegister() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

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

    // 기존 전담기관·과제·기관 미리 채워두기 (참여기관 연결에 필요)
    for (const a of fundingAgencies) registeredAgencies.set(a.name, a.id);
    for (const p of projects) registeredProjects.set(normProjectNum(p.projectNumber), p.id);
    for (const i of institutions) registeredInst.set(normBiz(i.bizNumber), i.id);

    for (const row of previewRows) {
      // 전담기관
      if (row.willRegister.agency && row.agencyName && !registeredAgencies.has(row.agencyName)) {
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

      // 기관
      const normBizNum = normBiz(row.bizNumber);
      if (row.willRegister.institution && normBizNum && !registeredInst.has(normBizNum)) {
        const created = addInstitution({
          name: row.institutionName || "미입력",
          type: "중소기업",
          bizNumber: row.bizNumber,
          representativeName: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          registeredAt: today,
          status: "ACTIVE",
        });
        registeredInst.set(normBizNum, created.id);
        instCount++;
      }

      // 과제
      const normNum = normProjectNum(row.projectNumber);
      if (row.willRegister.project && normNum && !registeredProjects.has(normNum)) {
        const agencyId = registeredAgencies.get(row.agencyName) ?? "";
        const startDateStr = row.startDate || today;

        // 과제담당자·연구책임자·자율성트랙 — 같은 과제의 여러 행에서 값이 하나로 모아질 때만 채택.
        // 값이 갈리면 여기서 비워두고, 아래에서 이슈로 남겨 확인을 요청한다.
        const scalarInfo = scalarAggregates.get(normNum);
        const assignedManager = scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined;
        const researchLead = scalarInfo?.researchLeads.size === 1 ? [...scalarInfo.researchLeads][0] : undefined;
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

        // 당해(현재 연차) 정부출연금/민간현금/민간현물 — 참여기관 전체 합산
        const { govGrant, privateCash, privateInKind } = sumTermFinancials(memberAggregates, normNum, currentTerm);
        // 파일에 담긴 연차 전체의 정부출연금/민간현금/민간현물 — Project.annualFinancials에 연차별로 쌓는다.
        const allTermFinancials = sumAllTermFinancials(memberAggregates, normNum);

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
            assignedManager: assignedManager ?? renamedFrom.assignedManager,
            researchLead: researchLead ?? renamedFrom.researchLead,
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
            assignedManager,
            researchLead,
            agencyAssignedAt,
            internalAssignedAt,
          });
          registeredProjects.set(normNum, created.id);
          newProjectAgencyId.set(normNum, agencyId);
          newProjectStartDate.set(normNum, startDateStr);
          projectCount++;
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
    const now = new Date().toISOString().replace("T", " ").slice(0, 16);
    const authorName = getCurrentUser()?.name ?? "시스템";
    let stageAlertCount = 0;

    // 참여기관 등록/갱신 — 이게 등록돼야 연차 수수료가 자동으로 계산된다 (autoGenerateTermFees 트리거)
    for (const agg of memberAggregates) {
      const normNum = normProjectNum(agg.projectNumber);
      const projectId = registeredProjects.get(normNum);
      const institutionId = registeredInst.get(normBiz(agg.bizNumber));
      if (!projectId || !institutionId) continue;

      // 이 실행 이전부터 있던(=신규로 만든 게 아닌) 과제인지 — 승인 안 됐으면 통째로 건너뛴다
      const isPreexistingProject = projects.some((p) => p.id === projectId);
      if (isPreexistingProject && !isApprovedUpdate(normNum)) continue;

      touchedProjectIds.add(projectId);
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

      if (!existingMember) {
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
          cashBudget: totalCash,
          inKindBudget: totalInKind,
          annualBudgets: annualBudgets.length > 0 ? annualBudgets : undefined,
          // 엑셀엔 담당자 연락처가 없으므로, 이미 등록된 기관이면 그 기관의 대표 연락처를 기본값으로 채운다
          // — 그래야 참여기관마다 연락처를 일일이 다시 입력할 필요가 없다.
          contactName: institution?.contactName || undefined,
          contactEmail: institution?.contactEmail || undefined,
          contactPhone: institution?.contactPhone || undefined,
        });
        memberCount++;
      } else if (isPreexistingProject) {
        // 기존 참여기관 갱신 — 다른 연차 데이터는 보존하고, 이번 엑셀에 담긴 연차만 추가/교체한다.
        const newTermNumbers = new Set(annualBudgets.map((b) => b.termNumber));
        const mergedBudgets = [
          ...(existingMember.annualBudgets ?? []).filter((b) => !newTermNumbers.has(b.termNumber)),
          ...annualBudgets,
        ].sort((a, b) => a.termNumber - b.termNumber);
        const totalCash = mergedBudgets.reduce((s, b) => s + b.cashBudget, 0);
        const totalInKind = mergedBudgets.reduce((s, b) => s + b.inKindBudget, 0);

        const updates: Partial<ProjectMember> = {
          annualBudgets: mergedBudgets,
          budget: totalCash + totalInKind,
          cashBudget: totalCash,
          inKindBudget: totalInKind,
          role: agg.role,
          settlementType: agg.settlementType,
        };
        if (agg.institutionGrade) updates.institutionGrade = agg.institutionGrade;

        // 실제로 달라진 게 있을 때만 갱신 — 동일한 파일을 다시 올려도 변경이력에 빈 UPDATE가 쌓이지 않게 한다.
        const changed =
          JSON.stringify(mergedBudgets) !== JSON.stringify(existingMember.annualBudgets ?? []) ||
          updates.role !== existingMember.role ||
          updates.settlementType !== existingMember.settlementType ||
          (updates.institutionGrade !== undefined && updates.institutionGrade !== existingMember.institutionGrade);

        if (changed) {
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
      if (!approved && !stageChanged) continue; // 반영할 것이 아무것도 없음

      touchedProjectIds.add(info.projectId);

      // 연차 반영이 보류된 경우(승인 안 됨) 단계 날짜·연차상시/정산 재계산은 "현재 등록된 연차" 기준으로 —
      // 승인된 경우에만 엑셀의 새 연차 기준으로 계산한다.
      const effectiveCurrentTerm = approved ? info.excelTerm : existingProject.currentTerm;
      const nextTotalTerms = Math.max(existingProject.totalTerms, approved ? info.excelTerm : 0, maxStageEndTerm);
      const currentStage = nextStages?.find((s) => effectiveCurrentTerm >= s.startTermNumber && effectiveCurrentTerm <= s.endTermNumber);
      const stageDateRange = currentStage ? stageInfo?.dateRanges.get(currentStage.stageNumber) : undefined;

      const updates: Partial<Project> = {
        agreementType: nextAgreementType,
        stages: nextStages,
        totalTerms: nextTotalTerms,
        stageStartDate: stageDateRange?.start ?? existingProject.stageStartDate,
        stageEndDate: stageDateRange?.end ?? existingProject.stageEndDate,
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

        // 과제담당자·연구책임자·배정일 — 신규/이름변경 과제(위쪽 분기)와 달리 이 "기존 과제
        // 연차 갱신" 분기는 지금까지 이 필드들을 전혀 건드리지 않아서, 최초 등록 때 값이 갈려(row마다
        // 값이 달라) 비어 있었으면 이후 아무리 재업로드해도 영영 채워지지 않는 문제가 있었다.
        // scalarInfo가 이번 파일에서 값을 하나로 특정하지 못하면(비어 있거나 여전히 갈리면) 기존 값을 유지한다.
        const scalarInfo = scalarAggregates.get(info.normNum);
        const assignedManager = scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined;
        const researchLead = scalarInfo?.researchLeads.size === 1 ? [...scalarInfo.researchLeads][0] : undefined;
        const agencyAssignedAt = scalarInfo?.agencyAssignedAts.size === 1 ? [...scalarInfo.agencyAssignedAts][0] : undefined;
        const internalAssignedAt = scalarInfo?.internalAssignedAts.size === 1 ? [...scalarInfo.internalAssignedAts][0] : undefined;

        Object.assign(updates, {
          currentTerm: nextCurrentTerm,
          projectCategory,
          govGrant: govGrant > 0 ? govGrant : existingProject.govGrant,
          privateCash: privateCash > 0 ? privateCash : existingProject.privateCash,
          privateInKind: privateInKind > 0 ? privateInKind : existingProject.privateInKind,
          annualFinancials: mergeAnnualFinancials(existingProject.annualFinancials, allTermFinancials),
          assignedManager: assignedManager ?? existingProject.assignedManager,
          researchLead: researchLead ?? existingProject.researchLead,
          agencyAssignedAt: agencyAssignedAt ?? existingProject.agencyAssignedAt,
          internalAssignedAt: internalAssignedAt ?? existingProject.internalAssignedAt,
        });
      }

      updateProject(info.projectId, updates);
      // 단계 구조 예외 반영 여부는 아래 "동일 연차 재제출/과거 연차" 이슈 생성 루프에서 info.stageChanged로
      // 함께 안내한다 — 프로젝트당 이슈를 하나로 합쳐 담당자가 헷갈리지 않게 한다.
    }

    // 주관기관 정보 보정 — 과제 생성 시점엔 어느 행이 주관기관인지 알 수 없어 비워뒀으므로,
    // 참여기관 등록이 끝난 뒤 role="LEAD"로 판별된 기관으로 채워 넣는다.
    // 전담기관이 농촌진흥청 계열(RDA1="fa-005"/RDA2="fa-006")인 경우, 엑셀의 "전문기관명"은 두 정책이
    // 똑같이 "농촌진흥청"이라 어느 쪽인지 이름만으론 구분이 안 된다 — 지금까지야 registeredAgencies가
    // 이름 하나에 id 하나만 담을 수 있어 항상 같은 쪽으로 쏠렸다. 여기서 주관기관명이 확정된 시점에
    // resolveRdaAgencyId로 실제 트랙을 다시 판별해 agencyId/agency를 바로잡는다.
    const rda2AffiliatedNames = fundingAgencies.find((a) => a.id === "fa-006")?.rda2AffiliatedInstitutionNames;
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
        ? resolveRdaAgencyId(currentAgencyId, agg.institutionName, rda2AffiliatedNames)
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
        if (scalarInfo.assignedManagers.size > 1) {
          reasons.push(`같은 과제인데 과제담당자가 서로 달라 등록하지 않았습니다: ${[...scalarInfo.assignedManagers].join(" / ")}`);
        }
        if (scalarInfo.researchLeads.size > 1) {
          reasons.push(`주관기관 기관책임자(연구책임자)가 서로 달라 등록하지 않았습니다: ${[...scalarInfo.researchLeads].join(" / ")}`);
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
        recipientGroups: ["MANAGER", "ACCOUNTANT"],
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
        recipientGroups: ["MANAGER", "ACCOUNTANT"],
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
        recipientGroups: ["MANAGER", "ACCOUNTANT"],
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
        recipientGroups: ["MANAGER", "ACCOUNTANT"],
        noInstitution: true,
      });
      stageAlertCount++;
    }

    setDoneResult({
      agency: agencyCount,
      project: projectCount,
      inst: instCount,
      member: memberCount,
      memberUpdated: memberUpdatedCount,
      projectAdvanced: advancedProjectCount,
      stageAlerts: stageAlertCount,
      renamed: renamedCount,
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
  );
}
