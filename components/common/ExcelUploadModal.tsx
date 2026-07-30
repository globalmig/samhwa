"use client";

import { useState, useCallback, useMemo, useRef } from "react";
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
} from "@/lib/store";
import type { Project, ProjectMember, AnnualBudget } from "@/lib/mock";
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
  billingType: string;
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
  budgetsByTerm: Map<number, AggregatedBudget>;
  totalCashBudgetFallback: number;
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

// 발행구분 원문 텍스트 → project.billingType 값으로 변환. 인식 안 되면 undefined
// (undefined면 등록 시 필드를 비워두고, 기존 기본 동작대로 세금계산서 유무로 자동 판별된다).
function parseBillingType(raw: string): Project["billingType"] | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  if (s.includes("역발행") && s.includes("요청")) return "역발행요청";
  if (s.includes("역발행")) return "역발행";
  if (s.includes("대상") && s.includes("아님")) return "대상아님";
  if (s.includes("면제")) return "면제";
  if (s.includes("정발행")) return "정발행";
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
  return Number.isFinite(n) ? n : 0;
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
function buildMemberAggregates(sheets: ParsedSheet[]): {
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
          budgetsByTerm: new Map(),
          totalCashBudgetFallback: 0,
        };
        memberMap.set(key, agg);
      }

      const roleStr = get("institutionRole", row);
      if (roleStr.includes("주관")) agg.role = "LEAD";
      else if (roleStr.includes("위탁")) agg.role = "ENTRUSTED";

      const settlementStr = get("settlementType", row);
      if (settlementStr) agg.settlementType = settlementStr.includes("자체") ? "자체정산" : "위탁정산";

      const gradeStr = get("institutionGrade", row);
      const parsedGrade = parseGrade(gradeStr);
      if (parsedGrade) agg.institutionGrade = parsedGrade;

      if (sheet.def.key === "annual") {
        // rcms-columns.ts 상 field명은 "termYear"지만 실제로는 "연차"(회차) 값이고,
        // 달력상 실제 연도는 "supportYear"(지원연도) 컬럼이 담당한다.
        const termNumber = parseInt(get("termYear", row), 10) || 1;
        const supportYear = parseInt(get("supportYear", row), 10) || new Date().getFullYear();
        // "연차_기관_총사업비(현금/현물)"처럼 이 연차 전용 컬럼이 있으면 그쪽을 우선한다 —
        // 일부 RCMS 파일엔 과제 전체 누적 총액 컬럼("현금사업비 총액")도 같이 있어서 그걸 그대로
        // 쓰면 매 연차에 똑같은 값이 반복 등록되는 문제가 있다.
        const cashBudget = parseAmount(get("cashBudgetTerm", row) || get("cashBudget", row));
        const inKindBudget = parseAmount(get("inKindBudgetTerm", row) || get("inKindBudget", row));
        const govGrant = parseAmount(get("govGrant", row));
        const privateCash = parseAmount(get("privateCashTerm", row));
        const privateInKind = parseAmount(get("privateInKindTerm", row));
        agg.budgetsByTerm.set(termNumber, { termYear: supportYear, termNumber, cashBudget, inKindBudget, govGrant, privateCash, privateInKind });
        projectMaxTerm.set(normNum, Math.max(projectMaxTerm.get(normNum) ?? 0, termNumber));
      } else {
        const totalCash = parseAmount(get("totalCashBudget", row));
        if (totalCash > 0) agg.totalCashBudgetFallback = totalCash;
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
  projectCodes: Set<string>;      // 과제번호(숫자)
  researchLeads: Set<string>;     // 주관기관 기관책임자
  isAutonomyTrack: boolean;
}

function buildProjectScalarAggregates(sheets: ParsedSheet[]): Map<string, ProjectScalarInfo> {
  const map = new Map<string, ProjectScalarInfo>();

  function ensure(normNum: string): ProjectScalarInfo {
    let info = map.get(normNum);
    if (!info) {
      info = { projectNames: new Set(), assignedManagers: new Set(), projectCodes: new Set(), researchLeads: new Set(), isAutonomyTrack: false };
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

      const manager = get("assignedManager", row);
      if (manager) info.assignedManagers.add(manager);

      if (get("autonomyTrack", row) === "자율성트랙") info.isAutonomyTrack = true;

      const codeNumeric = get("projectNumberNumeric", row);
      if (codeNumeric) info.projectCodes.add(codeNumeric);

      // 연구책임자는 "주관"기관 행의 기관책임자만 채택 — 공동기관 책임자는 과제 전체의
      // 연구책임자가 아니므로 섞이면 안 된다.
      const roleStr = get("institutionRole", row);
      const lead = get("institutionLead", row);
      if (lead && roleStr.includes("주관")) info.researchLeads.add(lead);
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
      if (!info) { info = { ranges: new Map(), dateRanges: new Map(), hasMissing: false }; map.set(normNum, info); }

      const rawStartStage = get("stageStartNumber", row);
      const rawStartTerm = get("stageStartTerm", row);
      const rawEndStage = get("stageEndNumber", row);
      const rawEndTerm = get("stageEndTerm", row);
      if (!rawStartStage || !rawStartTerm || !rawEndStage || !rawEndTerm) { info.hasMissing = true; continue; }

      const startStage = parseInt(rawStartStage, 10);
      const startTerm = parseInt(rawStartTerm, 10);
      const endStage = parseInt(rawEndStage, 10);
      const endTerm = parseInt(rawEndTerm, 10);
      if (![startStage, startTerm, endStage, endTerm].every(Number.isFinite)) { info.hasMissing = true; continue; }
      // 한 행이 여러 단계를 걸치는 경우는 이 파일 구조상 나타나지 않고 해석도 애매하므로 건너뛰고 표시만 한다.
      if (startStage !== endStage) { info.hasMissing = true; continue; }

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

// ProjectStageInfo → Project.agreementType/stages. 단계번호가 0만 관측되면(일괄협약 표기) undefined 반환.
// batchEndTerm: 단계=0(일괄협약)으로 관측된 종료연차 — STAGED 여부와 무관하게 총연차 추정에 쓴다.
// (전에는 stages가 undefined인 일괄협약 과제의 경우 이 값이 통째로 버려져서, 여러 해짜리 과제를
// "연차_기관_총사업비" 행이 1개뿐이면 1년짜리 과제로 잘못 등록하는 원인이 됐었다.)
function resolveStageStructure(info: ProjectStageInfo | undefined): {
  agreementType: Project["agreementType"];
  stages: Project["stages"];
  batchEndTerm: number;
} {
  if (!info) return { agreementType: undefined, stages: undefined, batchEndTerm: 0 };
  const batchEndTerm = info.ranges.get(0)?.end ?? 0;
  const stageNumbers = [...info.ranges.keys()].filter((n) => n !== 0).sort((a, b) => a - b);
  if (stageNumbers.length === 0) return { agreementType: undefined, stages: undefined, batchEndTerm };
  return {
    agreementType: "STAGED",
    stages: stageNumbers.map((n) => {
      const r = info.ranges.get(n)!;
      return { stageNumber: n, startTermNumber: r.start, endTermNumber: r.end };
    }),
    batchEndTerm,
  };
}

// 엑셀에 담긴 과제 중 이미 등록된 과제를, 진행중인 연차(currentTerm)와 비교해
// 신규/다음연차/동일연차/과거연차로 분류한다 (신규 과제는 여기서 다루지 않는다).
function computeProjectUpdates(
  projects: Project[],
  memberAggregates: MemberAggregate[],
  projectMaxTerm: Map<string, number>
): ProjectUpdateInfo[] {
  const normNums = new Set(memberAggregates.map((m) => normProjectNum(m.projectNumber)));
  const updates: ProjectUpdateInfo[] = [];
  for (const normNum of normNums) {
    const existing = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
    if (!existing) continue; // 신규 과제는 별도 처리
    const currentTerm = existing.currentTerm ?? 1;
    // 엑셀에 연차 정보가 없으면(단계기관별 시트만 있는 경우 등) 동일 연차로 보수적으로 취급해
    // 사용자 확인 없이 조용히 반영되지 않게 한다.
    const excelTerm = projectMaxTerm.get(normNum) ?? currentTerm;
    const status: ProjectUpdateStatus = excelTerm > currentTerm ? "next" : excelTerm === currentTerm ? "same" : "behind";
    updates.push({
      normNum,
      projectId: existing.id,
      projectNumber: existing.projectNumber,
      projectName: existing.projectName,
      currentTerm,
      excelTerm,
      status,
    });
  }
  return updates;
}

// RCMS 과제번호가 재부여되어 문자열이 바뀌는 경우가 있어(같은 실제 과제인데 번호만 달라짐),
// 새 과제를 만들기 전에 "이미 등록된 같은 과제"인지 먼저 확인한다.
// 1순위: 과제코드(전담기관 과제코드) 일치. 2순위: 과제명+시작일+종료일이 전부 동일.
// 후보가 2개 이상 나오면(우연한 일치 가능성) 판단하지 않고 ambiguousCandidates로 넘겨 이슈로 남긴다.
function resolveRenamedProject(
  projectName: string,
  startDate: string,
  endDate: string,
  projectCode: string | undefined,
  existingProjects: Project[]
): { project: Project | null; ambiguousCandidates: Project[] } {
  if (projectCode) {
    // 현재 과제코드든, 예전에 쓰였던 과제코드(이력)든 일치하면 같은 과제로 본다 — 과제코드가
    // 재부여된 뒤에도 누군가 예전 코드가 적힌 파일을 다시 올리는 경우가 있어서다.
    const byCode = existingProjects.filter(
      (p) => (p.projectCode && p.projectCode === projectCode) || (p.previousProjectCodes?.includes(projectCode) ?? false)
    );
    if (byCode.length === 1) return { project: byCode[0], ambiguousCandidates: [] };
    if (byCode.length > 1) return { project: null, ambiguousCandidates: byCode };
    // byCode.length === 0 → 이 과제코드로 등록된(과거 이력 포함) 기존 과제가 없음 → 이름+기간으로 폴백
  }
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

// ============================================================
// 스텝 컴포넌트들
// ============================================================

// ── 1. 파일 업로드 영역 ──────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
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
      className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
      }`}
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
    <div className="p-6 space-y-4">
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

      <div className="flex justify-between pt-2 border-t border-slate-100">
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
    <div className="p-6 space-y-6">
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

      <div className="flex justify-between pt-2 border-t border-slate-100">
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

function PreviewStep({
  previewRows,
  newMemberCount,
  projectUpdates,
  updateChoices,
  onToggleUpdate,
  onConfirm,
  onBack,
  loading,
}: {
  previewRows: PreviewRow[];
  newMemberCount: number;
  projectUpdates: ProjectUpdateInfo[];
  updateChoices: Record<string, boolean>;
  onToggleUpdate: (normNum: string, next: boolean) => void;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const agencySet = new Set<string>();
  const projectSet = new Set<string>();
  const instSet = new Set<string>();
  let newAgency = 0, newProject = 0, newInst = 0;

  for (const r of previewRows) {
    if (r.agencyName && r.willRegister.agency && !agencySet.has(r.agencyName)) {
      agencySet.add(r.agencyName); newAgency++;
    }
    if (r.projectNumber && r.willRegister.project && !projectSet.has(r.projectNumber)) {
      projectSet.add(r.projectNumber); newProject++;
    }
    if (r.bizNumber && r.willRegister.institution && !instSet.has(r.bizNumber)) {
      instSet.add(r.bizNumber); newInst++;
    }
  }

  const dupRows = previewRows.filter((r) => r.duplicates.length > 0);
  const totalNew = newAgency + newProject + newInst + newMemberCount;
  const approvedUpdateCount = projectUpdates.filter(
    (u) => updateChoices[u.normNum] ?? defaultChoiceForStatus(u.status)
  ).length;

  return (
    <div className="p-6 space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "신규 전담기관", count: newAgency, color: "blue" },
          { label: "신규 과제", count: newProject, color: "emerald" },
          { label: "신규 기관", count: newInst, color: "purple" },
          { label: "신규 참여기관", count: newMemberCount, color: "amber" },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border border-${c.color}-100 bg-${c.color}-50 px-4 py-3 text-center`}>
            <p className={`text-2xl font-bold text-${c.color}-700`}>{c.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400">
        참여기관까지 등록되어야 해당 과제의 연차 수수료가 자동으로 계산됩니다.
      </p>

      {/* 중복/유사 경고 */}
      {dupRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700">중복/유사 항목 ({dupRows.length}건) — 등록에서 자동 제외됩니다</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {dupRows.map((r, i) => (
              <div key={i} className="text-[10px] text-amber-700">
                {r.duplicates.map((d, j) => (
                  <span key={j} className="block">
                    {d.type === "agency" ? "전담기관" : d.type === "project" ? "과제" : "기관"}: {d.key}
                    {d.status === "similar" ? ` (유사 ${d.score}% — "${d.existing}")` : " — 이미 등록됨"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 기존 과제 갱신 */}
      {projectUpdates.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
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
                  </div>
                  <span className="text-[10px] text-slate-500 shrink-0">{u.currentTerm}연차 → {u.excelTerm}연차</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded shrink-0 ${badge.cls}`}>{badge.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {totalNew === 0 && approvedUpdateCount === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          등록하거나 반영할 항목이 없습니다.
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={loading || (totalNew === 0 && approvedUpdateCount === 0)}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
        >
          {loading ? "등록 중..." : `등록 (전담기관 ${newAgency} · 과제 ${newProject} · 기관 ${newInst} · 참여기관 ${newMemberCount}${approvedUpdateCount > 0 ? ` · 과제갱신 ${approvedUpdateCount}` : ""})`}
        </button>
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
    <div className="p-6 flex flex-col items-center gap-4">
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
            과제번호가 바뀐 것 같은데 기존 과제 후보가 여러 개라 자동으로 연결하지 못한 과제입니다.
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
    "선택", "선택", "선택",
    "※필수", "※필수 (000-00-00000)",
    "선택 (주관/공동/위탁)", "선택 (S/A/B/C, 미입력시 등급 없음)", "선택 (위탁정산/자체정산)",
    "선택 (이 연차 현금사업비 — 있으면 아래 \"현금사업비총액\"보다 우선)",
    "선택 (이 연차 현물사업비 — 있으면 아래 \"현물사업비총액\"보다 우선)",
    "선택 (이 연차 정부출연금 — 과제의 당해 정부출연금 합산에 사용)",
    "선택 (이 연차 민간현금 — 과제의 당해 민간현금 합산에 사용)",
    "선택 (이 연차 민간현물 — 과제의 당해 민간현물 합산에 사용)",
    "※필수 (원 단위, 위 \"연차_기관_총사업비(현금)\" 없을 때만 사용)", "선택 (원 단위, 위 \"연차_기관_총사업비(현물)\" 없을 때만 사용)",
    "선택 (Y/N)",
  ];
  const headers = [
    "전문기관명", "과제번호", "과제명",
    "과제담당자", "자율성트랙",
    "총개발시작일자", "총개발종료일자",
    "단계", "연차", "지원연도",
    "연구개발기관명", "기관사업자등록번호",
    "기관역할구분", "등급", "정산형태",
    "연차_기관_총사업비(현금)", "연차_기관_총사업비(현물)",
    "연차_기관_정부출연금", "연차_기관_민간부담금(현금)", "연차_기관_민간부담금(현물)",
    "현금사업비총액", "현물사업비총액", "배정대상",
  ];
  const rows = [
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "삼화기술경영(주)", "123-45-67890",
      "주관", "A", "위탁정산",
      "500000000", "0",
      "400000000", "100000000", "0",
      "500000000", "0", "Y",
    ],
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "홍길동", "",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "참여기업(주)", "234-56-78901",
      "공동", "", "위탁정산",
      "200000000", "0",
      "150000000", "50000000", "0",
      "200000000", "0", "Y",
    ],
    [
      "한국에너지기술평가원", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "김담당", "자율성트랙",
      "2024-06-01", "2026-05-31", "0", "1", "2024",
      "에너지연구소", "345-67-89012",
      "주관", "S", "자체정산",
      "800000000", "0",
      "700000000", "100000000", "0",
      "800000000", "0", "Y",
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
  applyDropdown(ws, headers.indexOf("등급") + 1, ["S", "A", "B", "C", "D", "E", "F", ""], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("정산형태") + 1, ["위탁정산", "자체정산"], 3, 2 + TEMPLATE_BLANK_ROWS);
  applyDropdown(ws, headers.indexOf("배정대상") + 1, ["Y", "N"], 3, 2 + TEMPLATE_BLANK_ROWS);

  const stageNotes = [
    "선택", "※필수", "선택", "※필수", "※필수",
    "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
    "선택 (0=일괄협약, 1 이상=단계협약)", "선택 (연차 숫자)", "선택 (시작단계와 동일해야 함)", "선택 (연차 숫자)",
    "선택",
    "선택 (정발행/역발행요청/역발행/대상아님/면제, 미입력시 정발행)",
    "※필수", "※필수 (000-00-00000)", "선택 (주관/공동/위탁)", "선택 (최우수/우수/일반)", "선택", "※필수 (원 단위)", "선택",
  ];
  const stageHeaders = [
    "과제번호(숫자)", "전문기관명", "RCMS사업명", "과제번호", "과제명",
    "총개발시작일자", "총개발종료일자",
    "정산대상시작단계", "정산대상시작연차", "정산대상종료단계", "정산대상종료연차",
    "정산형태구분", "발행구분",
    "연구기관명", "기관사업자등록번호", "기관역할구분", "기관등급", "기관책임자", "기관_총사업비(현금)", "회계법인",
  ];
  const stageRows = [
    [
      "1", "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "위탁정산", "정발행",
      "삼화기술경영(주)", "123-45-67890", "주관", "일반", "홍길동", "500000000", "삼일회계법인",
    ],
    [
      "1", "한국산업기술기획평가원", "스마트제조혁신사업", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "1", "3", "위탁정산", "정발행",
      "참여기업(주)", "234-56-78901", "공동", "우수", "김참여", "200000000", "삼일회계법인",
    ],
    [
      "2", "한국에너지기술평가원", "신재생에너지핵심기술개발", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "2024-06-01", "2026-05-31", "0", "1", "0", "4", "위탁정산", "역발행요청",
      "에너지연구소", "345-67-89012", "주관", "최우수", "박연구", "800000000", "한영회계법인",
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
  applyDropdown(stageWs, stageHeaders.indexOf("발행구분") + 1, ["정발행", "역발행요청", "역발행", "대상아님", "면제"], 3, 2 + TEMPLATE_BLANK_ROWS);
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

  // "연차별기관별" + "단계기관별" 시트를 과제+기관 단위로 합산 — 참여기관(ProjectMember) 등록에 사용
  const { members: memberAggregates, projectMaxTerm } = useMemo(
    () => buildMemberAggregates(parsedSheets),
    [parsedSheets]
  );

  // "단계기관별" 시트의 정산대상시작/종료단계·연차 값으로 과제별 단계 구조(Project.stages)를 추정
  const stageAggregates = useMemo(() => buildStageAggregates(parsedSheets), [parsedSheets]);

  // 과제담당자·자율성트랙·과제코드·연구책임자 등 과제 레벨 단일값 — 여러 행에 값이 갈리면 등록하지 않고 이슈로 남긴다
  const scalarAggregates = useMemo(() => buildProjectScalarAggregates(parsedSheets), [parsedSheets]);

  // 이미 등록된 과제 중 이번 엑셀이 다음/동일/과거 연차 중 무엇에 해당하는지 판단
  const projectUpdates = useMemo(
    () => computeProjectUpdates(projects, memberAggregates, projectMaxTerm),
    [projects, memberAggregates, projectMaxTerm]
  );

  function toggleProjectUpdate(normNum: string, next: boolean) {
    setProjectUpdateChoices((prev) => ({ ...prev, [normNum]: next }));
  }

  // 이미 참여기관으로 연결된 (과제, 기관) 쌍은 제외하고 새로 등록될 참여기관 수를 계산
  const newMemberCount = useMemo(() => {
    const existingKeys = new Set<string>();
    for (const pm of projectMembers) {
      const proj = projects.find((p) => p.id === pm.projectId);
      const inst = institutions.find((i) => i.id === pm.institutionId);
      if (proj && inst) existingKeys.add(`${normProjectNum(proj.projectNumber)}|${normBiz(inst.bizNumber)}`);
    }
    return memberAggregates.filter((m) => !existingKeys.has(m.key)).length;
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
            billingType: get("billingType", row),
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
          projectCount: 0,
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
        const stageInfo = stageAggregates.get(normNum);
        const { agreementType, stages, batchEndTerm } = resolveStageStructure(stageInfo);
        const maxStageEndTerm = stages ? Math.max(...stages.map((s) => s.endTermNumber)) : batchEndTerm;
        const totalTerms = Math.max(1, projectMaxTerm.get(normNum) ?? 1, maxStageEndTerm);
        const currentTerm = computeCurrentTerm(startDateStr, totalTerms, today);

        // 당해(현재 연차) 정부출연금/민간현금/민간현물 — 참여기관 전체 합산
        const { govGrant, privateCash, privateInKind } = sumTermFinancials(memberAggregates, normNum, currentTerm);

        // 현재 연차가 속한 단계의 실제 날짜 범위(있으면) → 단계시작일/단계종료일
        const currentStage = stages?.find((s) => currentTerm >= s.startTermNumber && currentTerm <= s.endTermNumber);
        const stageDateRange = currentStage ? stageInfo?.dateRanges.get(currentStage.stageNumber) : undefined;

        // 연차상시/정산 — 방금 계산한 단계 구조·총연차 기준으로 판정(다른 화면과 동일 기준)
        const projectCategory = isSettlementTerm({ agreementType, stages, totalTerms }, currentTerm) ? "정산" : "연차상시";

        // 과제담당자·과제코드·연구책임자·자율성트랙 — 같은 과제의 여러 행에서 값이 하나로 모아질 때만 채택.
        // 값이 갈리면(예: 같은 과제인데 코드가 다르게 찍힘) 여기서 비워두고, 아래에서 이슈로 남겨 확인을 요청한다.
        const scalarInfo = scalarAggregates.get(normNum);
        const assignedManager = scalarInfo?.assignedManagers.size === 1 ? [...scalarInfo.assignedManagers][0] : undefined;
        const projectCode = scalarInfo?.projectCodes.size === 1 ? [...scalarInfo.projectCodes][0] : undefined;
        const researchLead = scalarInfo?.researchLeads.size === 1 ? [...scalarInfo.researchLeads][0] : undefined;

        // 새로 만들기 전에 "과제번호만 바뀐 기존 과제"인지 먼저 확인한다 — RCMS에서 과제번호가
        // 재부여되는 경우가 있어, 문자열이 달라도 과제코드나 (과제명+기간)이 같으면 같은 과제로 본다.
        const { project: renamedFrom, ambiguousCandidates } = resolveRenamedProject(
          row.projectName || "미입력", startDateStr, row.endDate || today, projectCode, projects
        );

        if (ambiguousCandidates.length > 0) {
          // 후보가 여러 개라 자동으로 판단할 수 없음 — 등록하지 않고 아래에서 이슈로 남긴다
          // (registeredProjects에 안 넣으므로 이 과제군의 참여기관·단계 정보도 함께 건너뛴다).
          renameAmbiguities.push({ normNum, rawProjectNumber: row.projectNumber, projectName: row.projectName, candidates: ambiguousCandidates });
        } else if (renamedFrom) {
          // 과제번호 변경으로 판단 — 새로 만들지 않고 기존 과제를 그대로 갱신한다. updateProject의
          // 변경이력 기록이 "이전 과제번호 → 새 과제번호"를 감사로그에 자동으로 남긴다.
          //
          // 과제코드는 조금 다르게 다룬다 — 코드가 재부여된 뒤에 누군가 예전 코드가 적힌 파일을
          // 다시 올리는 경우가 있어서, "이력에 이미 있는 예전 코드"가 들어오면 현재 코드를 그걸로
          // 되돌리지 않는다. 진짜 새 코드일 때만 지금 코드를 이력에 넣고 교체한다.
          let nextProjectCode = renamedFrom.projectCode;
          let nextPreviousCodes = renamedFrom.previousProjectCodes;
          if (projectCode && projectCode !== renamedFrom.projectCode) {
            const isKnownOldCode = renamedFrom.previousProjectCodes?.includes(projectCode) ?? false;
            if (!isKnownOldCode) {
              nextPreviousCodes = renamedFrom.projectCode
                ? [...new Set([...(renamedFrom.previousProjectCodes ?? []), renamedFrom.projectCode])]
                : renamedFrom.previousProjectCodes;
              nextProjectCode = projectCode;
            }
            // isKnownOldCode === true면 nextProjectCode/nextPreviousCodes를 그대로 둬서(변경 없음) 되돌리지 않는다.
          }

          updateProject(renamedFrom.id, {
            projectNumber: row.projectNumber,
            projectName: row.projectName || renamedFrom.projectName,
            agencyId: agencyId || renamedFrom.agencyId,
            agency: row.agencyName || renamedFrom.agency,
            startDate: startDateStr,
            endDate: row.endDate || today,
            totalTerms: Math.max(renamedFrom.totalTerms, totalTerms),
            currentTerm,
            billingType: parseBillingType(row.billingType) ?? renamedFrom.billingType,
            agreementType: agreementType ?? renamedFrom.agreementType,
            stages: stages ?? renamedFrom.stages,
            projectCategory,
            projectType: scalarInfo?.isAutonomyTrack ? "AUTONOMY_TRACK" : renamedFrom.projectType,
            govGrant: govGrant > 0 ? govGrant : renamedFrom.govGrant,
            privateCash: privateCash > 0 ? privateCash : renamedFrom.privateCash,
            privateInKind: privateInKind > 0 ? privateInKind : renamedFrom.privateInKind,
            stageStartDate: stageDateRange?.start ?? renamedFrom.stageStartDate,
            stageEndDate: stageDateRange?.end ?? renamedFrom.stageEndDate,
            assignedManager: assignedManager ?? renamedFrom.assignedManager,
            projectCode: nextProjectCode,
            previousProjectCodes: nextPreviousCodes,
            researchLead: researchLead ?? renamedFrom.researchLead,
          });
          registeredProjects.set(normNum, renamedFrom.id);
          newProjectAgencyId.set(normNum, agencyId || renamedFrom.agencyId);
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
            billingType: parseBillingType(row.billingType),
            agreementType,
            stages,
            projectCategory,
            projectType: scalarInfo?.isAutonomyTrack ? "AUTONOMY_TRACK" : undefined,
            govGrant: govGrant > 0 ? govGrant : undefined,
            privateCash: privateCash > 0 ? privateCash : undefined,
            privateInKind: privateInKind > 0 ? privateInKind : undefined,
            stageStartDate: stageDateRange?.start,
            stageEndDate: stageDateRange?.end,
            assignedManager,
            projectCode,
            researchLead,
          });
          registeredProjects.set(normNum, created.id);
          newProjectAgencyId.set(normNum, agencyId);
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
      // ProjectMember.annualBudgets엔 공식 4개 필드만 저장 — govGrant/privateCash/privateInKind는
      // 과제 레벨 "당해 사업비" 필드를 채우기 위한 집계용 임시값이라 여기엔 남기지 않는다.
      const annualBudgets: AnnualBudget[] = Array.from(agg.budgetsByTerm.values())
        .sort((a, b) => a.termNumber - b.termNumber)
        .map(({ termYear, termNumber, cashBudget, inKindBudget }) => ({ termYear, termNumber, cashBudget, inKindBudget }));
      const existingMember = projectMembers.find(
        (m) => m.projectId === projectId && m.institutionId === institutionId
      );

      if (!existingMember) {
        // 신규 참여기관
        const totalCash = annualBudgets.length > 0
          ? annualBudgets.reduce((s, b) => s + b.cashBudget, 0)
          : agg.totalCashBudgetFallback;
        const totalInKind = annualBudgets.reduce((s, b) => s + b.inKindBudget, 0);
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

    // 다음 연차로 진행된 것으로 승인된 과제는 진행연차(및 필요 시 총연차)를 갱신한다.
    for (const info of projectUpdates) {
      if (info.status !== "next" || !isApprovedUpdate(info.normNum)) continue;
      const existingProject = projects.find((p) => p.id === info.projectId);
      if (!existingProject) continue;
      touchedProjectIds.add(info.projectId);
      updateProject(info.projectId, {
        currentTerm: info.excelTerm,
        totalTerms: Math.max(existingProject.totalTerms, info.excelTerm),
      });
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

    // 총사업비 재계산 — 이번에 새로 만들었거나 갱신한 과제만 대상으로, 참여기관 사업비 합계로 맞춘다.
    touchedProjectIds.forEach((pid) => recalcProjectTotalBudget(pid));

    const advancedProjectCount = projectUpdates.filter(
      (u) => u.status === "next" && isApprovedUpdate(u.normNum)
    ).length;

    // 자동으로 채우지 못했거나(단계 구조), 같은 과제인데 행마다 값이 갈려서(과제담당자·과제코드·
    // 연구책임자·과제명) 어느 값이 맞는지 판단할 수 없는 경우는 조용히 추정해서 반영하지 않고,
    // 과제 담당자·회계담당자에게 이슈로 남겨서 직접 확인하도록 한다.
    const now = new Date().toISOString().replace("T", " ").slice(0, 16);
    const authorName = getCurrentUser()?.name ?? "시스템";
    let stageAlertCount = 0;
    const reviewNormNums = new Set([...stageAggregates.keys(), ...scalarAggregates.keys()]);
    for (const normNum of reviewNormNums) {
      const projectId = registeredProjects.get(normNum);
      if (!projectId) continue;

      const reasons: string[] = [];
      const stageInfo = stageAggregates.get(normNum);
      if (stageInfo?.hasMissing) {
        reasons.push("\"단계기관별\" 시트의 정산대상시작/종료단계·연차 값이 일부 비어 있거나 해석할 수 없어 단계 구조(협약구조)를 자동으로 채우지 못했습니다.");
      }
      const scalarInfo = scalarAggregates.get(normNum);
      if (scalarInfo) {
        if (scalarInfo.projectNames.size > 1) {
          reasons.push(`같은 과제번호인데 과제명이 서로 다릅니다: ${[...scalarInfo.projectNames].join(" / ")}`);
        }
        if (scalarInfo.projectCodes.size > 1) {
          reasons.push(`같은 과제번호인데 과제코드(과제번호(숫자))가 서로 달라 등록하지 않았습니다: ${[...scalarInfo.projectCodes].join(" / ")}`);
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
    <Modal title={TITLES[step]} onClose={onClose} size="xl">
      {/* 진행 표시 */}
      {step !== "done" && (
        <div className="px-6 pt-4 pb-0">
          <div className="flex items-center gap-1">
            {["파일 선택", "시트 탐색", "컬럼 매핑", "미리보기"].map((label, i) => (
              <div key={label} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  i < stepIdx ? "bg-blue-600 text-white" : i === stepIdx ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-slate-200 text-slate-500"
                }`}>{i + 1}</div>
                <span className={`text-[10px] ${i === stepIdx ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{label}</span>
                {i < 3 && <div className={`flex-1 h-px ${i < stepIdx ? "bg-blue-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 스텝 콘텐츠 */}
      {step === "upload" && (
        <div className="p-6">
          <UploadZone onFile={handleFile} />
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
          newMemberCount={newMemberCount}
          projectUpdates={projectUpdates}
          updateChoices={projectUpdateChoices}
          onToggleUpdate={toggleProjectUpdate}
          onConfirm={doRegister}
          onBack={() => setStep(previewBackStep)}
          loading={loading}
        />
      )}

      {step === "done" && (
        <DoneStep result={doneResult} onClose={onClose} />
      )}
    </Modal>
  );
}
