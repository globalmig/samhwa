"use client";

import { use, useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiEdit2, FiCheck, FiX, FiPlus, FiSend, FiChevronDown, FiChevronUp, FiTrash2, FiFileText,
  FiHash, FiCalendar, FiLayers, FiDollarSign, FiInfo,
} from "react-icons/fi";
import {
  useStore, updateProject, addProjectIssue, updateProjectIssue, deleteProjectIssue, addTaxInvoice, updateTaxInvoice,
  addReceivable, updateReceivable, addEmailDispatch, updateTermFee, updateUnclaimedFee,
  updateProjectMember, autoGenerateTermFees, addProjectMember, deleteProjectMember, deleteProject,
  setTermOtherFirmHandled, setTermBillingType, setTermDates,
} from "@/lib/store";
import { type TaxInvoice, type Receivable, type TermFee, type UnclaimedFee, type Project, type ProjectMember, type Institution, type IssueRecipientGroup, type AgencyNoticeTemplateEntry, type SystemUser, type EmailDispatch, type FeePolicy, EMPTY_NOTICE_TEMPLATE, COMPANY_INFO } from "@/lib/mock";
import { calcTermFee, resolvePolicy, normalizeGrade, getMemberAmount, isSettlementTerm, isNonProfitInstitution, isExcludedMember, resolveRdaAgencyId, resolveMemberGradeForTerm, resolveMemberSettlementTypeForTerm, resolveMemberRecipientForTerm, hasStageTermDateMismatch, buildNoticeFeeRows, type CalcMember } from "@/lib/fee-calculator";
import { fmtWonFull, fmtDate, splitVatInclusive, addMonths, resolveTermDateRange } from "@/lib/utils";
import { fmtValue, fieldLabel } from "@/lib/audit-log-format";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import MoneyInput from "@/components/common/MoneyInput";
import DateInput from "@/components/common/DateInput";
import NoticeLetterPreview, { type NoticeStatusRow } from "@/components/common/NoticeLetterPreview";
import { buildNoticeEmailHtml } from "@/lib/notice-email-html";
import InstitutionQuickAdd from "@/components/common/InstitutionQuickAdd";
import UserMultiSelect from "@/components/common/UserMultiSelect";
import AgreementStructureEditor from "@/components/common/AgreementStructureEditor";
import { useCanWrite } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";

// ─── Shared styles ───────────────────────────────────────────
const inp = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const sel = `${inp} bg-white`;

// ─── Status maps ─────────────────────────────────────────────
const PROJECT_STATUS: Record<string, { label: string; color: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "진행중", color: "green" },
  COMPLETED: { label: "완료", color: "slate" },
  SUSPENDED: { label: "중단", color: "amber" },
};
const INVOICE_STATUS: Record<string, { label: string; color: "green" | "amber" | "red" }> = {
  ISSUED: { label: "발행", color: "green" },
  MODIFIED: { label: "수정발행", color: "amber" },
  CANCELED: { label: "취소", color: "red" },
};
const RECEIVABLE_STATUS: Record<string, { label: string; color: "green" | "amber" | "red" | "slate" }> = {
  PAID: { label: "완납", color: "green" },
  PARTIAL: { label: "일부납부", color: "amber" },
  OVERDUE: { label: "미수", color: "red" },
  PENDING: { label: "미납", color: "amber" },
};
const UNCLAIMED_STATUS: Record<string, { label: string; color: "amber" | "blue" | "green" }> = {
  PENDING: { label: "대기중", color: "amber" },
  CARRIED_OVER: { label: "이월됨", color: "blue" },
  RESOLVED: { label: "해소됨", color: "green" },
};
const FEE_STATUS: Record<string, { label: string; color: "green" | "blue" | "slate" }> = {
  BILLED: { label: "청구완료", color: "green" },
  CONFIRMED: { label: "확정", color: "blue" },
  DRAFT: { label: "초안", color: "slate" },
  SCHEDULED: { label: "연차 미시작", color: "slate" },
};
const PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-500",
};
const PRIORITY_LABEL: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
const ISSUE_STATUS_STYLE: Record<string, string> = {
  OPEN:        "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED:    "bg-green-100 text-green-700",
};
const ISSUE_STATUS_LABEL: Record<string, string> = {
  OPEN:        "미처리",
  IN_PROGRESS: "진행중",
  RESOLVED:    "완료",
};
const GRADE_COLOR: Record<string, string> = {
  S: "bg-blue-100 text-blue-700",
  A: "bg-green-100 text-green-700",
  B: "bg-green-100 text-green-700",
  C: "bg-green-100 text-green-700",
  일반: "bg-slate-100 text-slate-500",
};
const GRADE_LABEL: Record<string, string> = { S: "최우수(S)", A: "우수(A)", B: "우수(B)", C: "우수(C)", 일반: "일반" };
const ROLE_LABEL: Record<"LEAD" | "PARTICIPANT" | "ENTRUSTED", string> = { LEAD: "주관", PARTICIPANT: "공동", ENTRUSTED: "위탁" };

// ─── 발행구분 (수수료 청구관리 목록과 동일한 옵션 — TermFee.billingType 필드 공유) ──
const BILLING_TYPE_COLOR: Record<string, string> = {
  "정발행":     "bg-blue-100 text-blue-700",
  "역발행요청": "bg-violet-100 text-violet-700",
  "역발행":     "bg-purple-100 text-purple-700",
  "대상아님":   "bg-slate-100 text-slate-500",
  "면제":       "bg-amber-100 text-amber-700",
};
const BILLING_OPTIONS = [
  { value: "정발행",     label: "정발행",     desc: "일반적인 세금계산서 발행 (삼화→기관)" },
  { value: "역발행요청", label: "역발행 요청", desc: "기관이 계산서를 발행하도록 요청한 상태" },
  { value: "역발행",     label: "역발행",     desc: "기관이 삼화 앞으로 세금계산서를 발행" },
  { value: "대상아님",   label: "대상아님",   desc: "수수료 발행 대상이 아닌 과제 (국토부 공동기관, 농진청 소속기관이 주관 아닌 공동기관 등)" },
  { value: "면제",       label: "면제",       desc: "IITP·KAIA 주관이 최우수기관이고 공동 없는 경우" },
] as const;

// ─── 연차번호 → 연도 변환 (당해시작일 기준) ───────────────────
function termNumberToYear(startDate: string, termNumber: number): number {
  const d = new Date(startDate);
  d.setFullYear(d.getFullYear() + termNumber - 1);
  return d.getFullYear();
}

// ─── TermGroup ───────────────────────────────────────────────
interface TermGroup {
  key: string;
  termYear: number;
  termNumber: number;
  fees: TermFee[];
  totalApplied: number;
  totalCalculated: number;
  invoice: TaxInvoice | null;
  receivable: Receivable | null;
  unclaimed: UnclaimedFee | null;
  termStatus: TermFee["status"];
}

// ─── 세금계산서/공문발송/수금 "청구 단위" ──────────────────────
// 기본은 연차 전체를 하나로 묶어 청구하지만(institutionId: null), RDA2처럼 기관마다 발행일·
// 공문발송일·수금일이 따로 관리돼야 하는 과제는 기관별로 하나씩(institutionId 있음) 만든다.
interface BillingUnit {
  key: string;
  institutionId: string | null;
  billingInstitutionId: string;   // TaxInvoice/Receivable.leadInstitutionId에 저장할 값
  billingLabel: string;           // 화면 표시 + leadInstitutionName에 저장할 값
  recipients: { institutionName: string; email: string }[]; // 공문 발송 대상
  amount: number;
  billedFees: { id: string; status: TermFee["status"] }[];      // 발행 시 BILLED로 갱신
  confirmedFees: { id: string; status: TermFee["status"] }[];   // 발행 시 (초안/예정이면) CONFIRMED로 갱신
  billingType?: TermFee["billingType"]; // 이 단위(연차 전체 또는 분리된 기관)의 발행구분 — TermFee에서 대표값을 가져온다
  invoice: TaxInvoice | null;
  receivable: Receivable | null;
}

// ─── Tab 1: 과제 정보 ────────────────────────────────────────
function ProjectInfoTab({ projectId }: { projectId: string }) {
  const canEditProjects = useCanWrite('projects');
  const canEditIssues = useCanWrite('issues');
  const canManageIssues = useCanWrite('issues-manage');
  const { projects, projectMembers, institutions, projectIssues, auditLog, fundingAgencies, feePolicies, termFeeCalcs, termFees, users } = useStore();
  const selectableUsers = users.filter((u) => u.status === "ACTIVE");

  const project = projects.find((p) => p.id === projectId) ?? null;

  // All hooks before conditional return
  const [draft, setDraft] = useState<Project>(() => project ?? {
    id: "", projectNumber: "", projectName: "", agencyId: "", agency: "",
    leadInstitutionId: "", leadInstitutionName: "",
    totalBudget: 0, startDate: "", endDate: "",
    totalTerms: 1, currentTerm: 1, status: "ACTIVE",
  });
  // "현재연차/총연차"(예: 2/3)를 하나의 입력란으로 받는다 — 매 입력마다 draft로 되돌리면
  // "2/" 처럼 아직 완성되지 않은 중간 입력 상태에서 커서가 튀므로, 표시값이 draft와 다를 때만 동기화한다.
  const [termText, setTermText] = useState(() => `${draft.currentTerm}/${draft.totalTerms}`);
  useEffect(() => {
    setTermText((prev) => {
      const m = prev.match(/^(\d+)\/(\d+)$/);
      const inSync = m && Number(m[1]) === draft.currentTerm && Number(m[2]) === draft.totalTerms;
      return inSync ? prev : `${draft.currentTerm}/${draft.totalTerms}`;
    });
  }, [draft.currentTerm, draft.totalTerms]);
  function handleTermTextChange(raw: string) {
    setTermText(raw);
    const m = raw.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    if (!m) return;
    const cur = Number(m[1]);
    const tot = Number(m[2]);
    if (cur < 1 || tot < 1) return;
    setDraft((p) => ({ ...p, currentTerm: cur, totalTerms: tot }));
  }
  const [savedMsg, setSavedMsg] = useState(false);
  const [editingMembers, setEditingMembers] = useState(false);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, Partial<ProjectMember>>>({});
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, { cashBudget: number; inKindBudget: number }>>({});
  const [budgetMismatchError, setBudgetMismatchError] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingBudgetMember, setEditingBudgetMember] = useState<ProjectMember | null>(null);
  const [editingGradeMember, setEditingGradeMember] = useState<ProjectMember | null>(null);
  const [editingSettlementMember, setEditingSettlementMember] = useState<ProjectMember | null>(null);
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueContent, setIssueContent] = useState("");
  const [issuePriority, setIssuePriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [issueStatus, setIssueStatus] = useState<"OPEN" | "IN_PROGRESS" | "RESOLVED">("OPEN");
  const [issueRecipients, setIssueRecipients] = useState<IssueRecipientGroup[]>([]);
  const [issueRecipientUserIds, setIssueRecipientUserIds] = useState<string[]>([]);
  const [issueInstitutionName, setIssueInstitutionName] = useState("");
  const [issueNoInstitution, setIssueNoInstitution] = useState(false);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDraft, setEditIssueDraft] = useState({
    content: "", priority: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW", status: "OPEN" as "OPEN" | "IN_PROGRESS" | "RESOLVED",
    recipientGroups: [] as IssueRecipientGroup[], recipientUserIds: [] as string[],
    institutionName: "", noInstitution: false,
  });
  const [deletingIssueId, setDeletingIssueId] = useState<string | null>(null);
  const [showProjectTypeConfirm, setShowProjectTypeConfirm] = useState(false);
  const [showStageDateConfirm, setShowStageDateConfirm] = useState(false);
  // 참여기관 목록에서 "지금 보고 있는 연차" — 기본은 현재 진행 연차이지만, 참여기관·등급·정산구분·
  // 사업비가 연차마다 바뀔 수 있어 탭으로 다른 연차를 훑어볼 수 있게 한다. 인라인 일괄수정("기관 수정")은
  // 항상 실제 진행 연차(currentTerm) 기준으로만 동작하므로, 편집 모드에 들어가면 이 값을 되돌린다.
  const [viewTerm, setViewTerm] = useState(() => project?.currentTerm ?? 1);

  if (!project) return null;

  const members = projectMembers.filter((m) => m.projectId === projectId);
  const issues = [...projectIssues.filter((i) => i.projectId === projectId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = auditLog
    .filter((e) => e.entityType === "project" && e.entityId === projectId)
    .slice(0, 10);

  // KEIT 수수료 산정 (현재 연차 기준)
  const currentTerm = project.currentTerm ?? 1;
  // 연차 탭에 몇 개까지 보여줄지 — project.totalTerms만 믿으면 이 값이 실제 데이터와 어긋난 과제(예:
  // 엑셀 업로드 총연차 계산 오류 등으로 totalTerms=1인데 실제로는 5연차까지 사업비가 입력된 경우)에서
  // 탭 자체가 하나도 안 뜨는 문제가 생긴다. currentTerm과 실제 연차별 사업비에 찍힌 연차까지 감안해
  // 항상 실제 존재하는 연차만큼은 탭으로 보이게 한다.
  const maxViewableTerm = Math.max(
    project.totalTerms ?? 1,
    currentTerm,
    ...members.flatMap((m) => m.annualBudgets?.map((b) => b.termNumber) ?? [])
  );
  // 단계협약(STAGED)이면 과제 전체 기간(최초시작일/최종종료일)은 더 이상 따로 입력받지 않고,
  // 협약구조 표의 1단계 시작일 · 마지막 단계 종료일에서 그대로 파생시킨다 — 일괄협약(BATCH)은
  // 단계 표 자체가 없으므로 이전처럼 직접 입력받는다.
  const isStaged = draft.agreementType === "STAGED";
  const draftFirstStage = isStaged ? draft.stages?.[0] : undefined;
  const draftLastStage = isStaged ? draft.stages?.[draft.stages.length - 1] : undefined;
  const resolvedFirstStartDate = isStaged ? (draftFirstStage?.stageStartDate ?? draft.firstStartDate) : draft.firstStartDate;
  const resolvedFinalEndDate = isStaged ? (draftLastStage?.stageEndDate ?? draft.finalEndDate) : draft.finalEndDate;

  function getCurrentTermBudget(m: ProjectMember): { cashBudget: number; inKindBudget: number } {
    const ab = m.annualBudgets?.find((a) => a.termNumber === currentTerm);
    return {
      cashBudget: ab?.cashBudget ?? m.cashBudget ?? m.budget ?? 0,
      inKindBudget: ab?.inKindBudget ?? m.inKindBudget ?? 0,
    };
  }
  function getMemberBudgetVal(m: ProjectMember, field: "cashBudget" | "inKindBudget"): number {
    return budgetDrafts[m.id]?.[field] ?? getCurrentTermBudget(m)[field];
  }
  function setMemberBudgetField(m: ProjectMember, field: "cashBudget" | "inKindBudget", value: number) {
    setBudgetMismatchError("");
    setBudgetDrafts((prev) => ({
      ...prev,
      [m.id]: { ...(prev[m.id] ?? getCurrentTermBudget(m)), [field]: value },
    }));
  }
  // 현재 진행 연차가 아닌 다른 연차를 탭으로 훑어볼 때 쓴다 — getCurrentTermBudget과 달리 사업비를
  // 입력한 적 없는 연차는 기관 총액으로 되돌리지 않고 0으로 둔다(그래야 "이 연차엔 참여 안 함"이 드러난다).
  function getViewTermBudget(m: ProjectMember, termNumber: number): { cashBudget: number; inKindBudget: number } {
    if (termNumber === currentTerm) return getCurrentTermBudget(m);
    const ab = m.annualBudgets?.find((a) => a.termNumber === termNumber);
    return { cashBudget: ab?.cashBudget ?? 0, inKindBudget: ab?.inKindBudget ?? 0 };
  }

  const policy = resolvePolicy(project.agencyId, feePolicies, project.programType ?? "GENERAL");
  const defaultSettlementType = policy?.defaultSettlementType ?? "자체정산";
  // 아래(calcMembers~feeResult)는 참여기관 목록 탭에서 "지금 보고 있는 연차"(viewTerm) 기준으로 계산한다.
  // 다른 화면 요소(당해 사업비 자동계산 등)는 여전히 getMemberBudgetVal/currentTerm을 직접 쓰므로 영향 없다.
  const calcMembers: CalcMember[] = policy ? members.flatMap((m) => {
    const { cashBudget, inKindBudget } = getViewTermBudget(m, viewTerm);
    const amount = policy.feeBasis === "CASH_PLUS_INKIND" ? cashBudget + inKindBudget : cashBudget;
    if (amount <= 0) return [];
    return [{
      institutionId: m.institutionId,
      institutionName: m.institutionName,
      role: m.role as "LEAD" | "PARTICIPANT" | "ENTRUSTED",
      grade: normalizeGrade(resolveMemberGradeForTerm(m, viewTerm)),
      institutionType: m.institutionType,
      settlementType: resolveMemberSettlementTypeForTerm(m, viewTerm, defaultSettlementType),
      cashBudget,
      inKindBudget,
    }];
  }) : [];

  const currentWorkType: "ANNUAL" | "SETTLEMENT" = isSettlementTerm(project, viewTerm) ? "SETTLEMENT" : "ANNUAL";
  // 정산 연차는 이전 연차들의 일반 미청구 누적액도 이번에 함께 걷어야 하므로, 자동산정 시 저장해둔
  // TermFeeCalc.carriedOverUnclaimed(단계 내 누적)를 그대로 가져와 반영한다 — 0으로 고정하면 안 됨.
  const carriedOverUnclaimed = termFeeCalcs.find(
    (c) => c.projectNumber === project.projectNumber && c.termNumber === viewTerm
  )?.carriedOverUnclaimed ?? 0;
  const feeResult = policy && calcMembers.length > 0
    ? calcTermFee({
        members: calcMembers,
        workType: currentWorkType,
        policy,
        projectType: project.projectType ?? "GENERAL",
        carriedOverUnclaimed,
        autonomySettlementType: project.autonomySettlementType,
      })
    : null;

  const exemptIds = new Set(feeResult?.exemptBreakdown.map((e) => e.institutionId) ?? []);
  const excludedIds = new Set(feeResult?.excludedInstitutionIds ?? []);
  const feeBasis = policy?.feeBasis ?? "CASH";
  const nonExemptCalcMembers = calcMembers.filter(
    (m) => !exemptIds.has(m.institutionId) && !excludedIds.has(m.institutionId)
  );
  const totalNonExemptCash = nonExemptCalcMembers.reduce((s, m) => s + getMemberAmount(m, feeBasis), 0);

  const getInstCalcFee = (institutionId: string): number => {
    if (!feeResult) return 0;
    if (excludedIds.has(institutionId)) return 0;
    const perInst = feeResult.perInstitutionFees?.find((e) => e.institutionId === institutionId);
    if (perInst) return perInst.calculatedFee;
    if (exemptIds.has(institutionId)) {
      return feeResult.exemptBreakdown.find((e) => e.institutionId === institutionId)?.calculatedFee ?? 0;
    }
    const cm = calcMembers.find((m) => m.institutionId === institutionId);
    if (!cm) return 0;
    const ratio = totalNonExemptCash > 0 ? getMemberAmount(cm, feeBasis) / totalNonExemptCash : 0;
    return Math.round(feeResult.generalFee * ratio);
  };

  const totalCalcFee = feeResult?.calculatedFee ?? members.reduce((s, m) => s + m.calculatedFee, 0);

  // 확정(CONFIRMED/BILLED)되지 않았고 수동조정(manualOverride)도 안 된 연차 수 — projectType을
  // 바꾸면 autoGenerateTermFees가 이 연차들을 새 유형 기준으로 소급 재계산한다(과거 연차 포함).
  function countUnlockedTerms(): number {
    const relevant = termFees.filter(
      (tf) => tf.projectNumber === project!.projectNumber &&
        tf.status !== "CONFIRMED" && tf.status !== "BILLED" && !tf.manualOverride
    );
    return new Set(relevant.map((tf) => tf.termNumber)).size;
  }

  function doSaveEdit() {
    const inst = institutions.find((i) => i.id === draft.leadInstitutionId);
    const leadInstitutionName = inst?.name ?? project!.leadInstitutionName;
    const annualBudget = (draft.govGrant ?? 0) + (draft.privateCash ?? 0) + (draft.privateInKind ?? 0);
    // 전담기관이 농촌진흥청 계열(RDA1/RDA2)이면 주관기관명으로 실제 트랙을 자동 교정한다 —
    // 두 레코드 모두 표시 이름이 "농촌진흥청"이라 사람이 직접 고르면 실수하기 쉽다.
    const rda2AffiliatedNames = fundingAgencies.find((a) => a.id === "fa-006")?.rda2AffiliatedInstitutionNames;
    const resolvedAgencyId = resolveRdaAgencyId(draft.agencyId, leadInstitutionName, rda2AffiliatedNames);
    const resolvedAgency = fundingAgencies.find((a) => a.id === resolvedAgencyId)?.name ?? draft.agency;
    updateProject(projectId, {
      ...draft,
      agencyId: resolvedAgencyId,
      agency: resolvedAgency,
      leadInstitutionName,
      totalBudget: annualBudget > 0 ? annualBudget : draft.totalBudget,
      firstStartDate: resolvedFirstStartDate,
      finalEndDate: resolvedFinalEndDate,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  // 단계 날짜(시작일/종료일)가 바뀌었을 때, 그 단계에 속한 연차 중 담당자가 날짜를 직접 지정해둔
  // 것(TermFee.termStartDate/termEndDate)이 있으면 그대로 둘지/자동계산으로 되돌릴지 확인이 필요하다 —
  // 그냥 두면 지정해둔 날짜가 새 단계 기간 밖으로 벗어난 채 남을 수 있다.
  function stagesWithChangedDates(): Set<number> {
    const oldStages = project!.stages ?? [];
    const changed = new Set<number>();
    for (const ns of draft.stages ?? []) {
      const os = oldStages.find((o) => o.stageNumber === ns.stageNumber);
      if (os && (os.stageStartDate !== ns.stageStartDate || os.stageEndDate !== ns.stageEndDate)) {
        changed.add(ns.stageNumber);
      }
    }
    return changed;
  }

  function manuallyDatedTermsInChangedStages(): { termYear: number; termNumber: number }[] {
    const changedStages = stagesWithChangedDates();
    if (changedStages.size === 0) return [];
    const seen = new Set<string>();
    const result: { termYear: number; termNumber: number }[] = [];
    for (const tf of termFees) {
      if (tf.projectNumber !== project!.projectNumber) continue;
      if (!tf.termStartDate && !tf.termEndDate) continue;
      const stage = (draft.stages ?? []).find((s) => tf.termNumber >= s.startTermNumber && tf.termNumber <= s.endTermNumber);
      if (!stage || !changedStages.has(stage.stageNumber)) continue;
      const k = `${tf.termYear}|${tf.termNumber}`;
      if (seen.has(k)) continue;
      seen.add(k);
      result.push({ termYear: tf.termYear, termNumber: tf.termNumber });
    }
    return result;
  }

  function saveEdit() {
    const projectTypeChanged = (draft.projectType ?? "GENERAL") !== (project!.projectType ?? "GENERAL");
    const autonomySettlementChanged = (draft.autonomySettlementType ?? "자체정산") !== (project!.autonomySettlementType ?? "자체정산");
    // IITP 전용 "사업 유형"(일반 R&D ↔ ICT 기금사업)도 정책 자체가 통째로 바뀌는 필드라(구간표·연차상시
    // 청구비율·산정방식 모두 다름), 자율성트랙 변경과 동일하게 미확정 연차 재계산 확인을 거쳐야 한다.
    const programTypeChanged = (draft.programType ?? "GENERAL") !== (project!.programType ?? "GENERAL");
    if ((projectTypeChanged || autonomySettlementChanged || programTypeChanged) && countUnlockedTerms() > 0) {
      setShowProjectTypeConfirm(true);
      return;
    }
    if (manuallyDatedTermsInChangedStages().length > 0) {
      setShowStageDateConfirm(true);
      return;
    }
    doSaveEdit();
  }

  const annualBudget = (draft.govGrant ?? 0) + (draft.privateCash ?? 0) + (draft.privateInKind ?? 0);

  const totalCashBudget = members.reduce((s, m) => s + getMemberBudgetVal(m, "cashBudget"), 0);
  const totalInKindBudget = members.reduce((s, m) => s + getMemberBudgetVal(m, "inKindBudget"), 0);
  const budgetMatchesAnnual = totalCashBudget + totalInKindBudget === annualBudget;
  // 참여기관 표 하단 합계는 편집 중일 때만 위 currentTerm+초안 반영 합계를 그대로 쓰고(입력하는 대로
  // 바로 반영되어야 하니까), 탭으로 다른 연차를 보고 있을 때는 그 연차 기준(calcMembers)으로 다시 더한다.
  const viewTotalCashBudget = editingMembers ? totalCashBudget : calcMembers.reduce((s, m) => s + m.cashBudget, 0);
  const viewTotalInKindBudget = editingMembers ? totalInKindBudget : calcMembers.reduce((s, m) => s + (m.inKindBudget ?? 0), 0);

  function startMemberEdit() { setMemberDrafts({}); setBudgetDrafts({}); setBudgetMismatchError(""); setViewTerm(currentTerm); setEditingMembers(true); }
  function cancelMemberEdit() { setEditingMembers(false); setMemberDrafts({}); setBudgetDrafts({}); setBudgetMismatchError(""); }
  function saveMemberEdits() {
    if (!budgetMatchesAnnual) {
      setBudgetMismatchError(
        `현금합계(${fmtWonFull(totalCashBudget)}) + 현물합계(${fmtWonFull(totalInKindBudget)})가 당해 사업비 자동계산 금액(${fmtWonFull(annualBudget)})과 일치하지 않아 저장할 수 없습니다.`
      );
      return;
    }
    const ids = new Set([...Object.keys(memberDrafts), ...Object.keys(budgetDrafts)]);
    ids.forEach((id) => {
      const m = members.find((mm) => mm.id === id);
      if (!m) return;
      const changes: Partial<ProjectMember> = { ...(memberDrafts[id] ?? {}) };
      const bd = budgetDrafts[id];
      if (bd) {
        const existing = m.annualBudgets ?? [];
        const termYear = existing.find((a) => a.termNumber === currentTerm)?.termYear
          ?? termNumberToYear(project!.startDate, currentTerm);
        changes.annualBudgets = [
          ...existing.filter((a) => a.termNumber !== currentTerm),
          { termYear, termNumber: currentTerm, cashBudget: bd.cashBudget, inKindBudget: bd.inKindBudget },
        ].sort((a, b) => a.termNumber - b.termNumber);
      }
      if (Object.keys(changes).length > 0) updateProjectMember(id, changes);
    });
    setEditingMembers(false);
    setMemberDrafts({});
    setBudgetDrafts({});
    setBudgetMismatchError("");
  }
  function setMemberField(memberId: string, field: keyof ProjectMember, value: unknown) {
    setMemberDrafts((prev) => ({ ...prev, [memberId]: { ...prev[memberId], [field]: value } }));
  }
  function getMemberVal<K extends keyof ProjectMember>(m: ProjectMember, field: K): ProjectMember[K] {
    return (memberDrafts[m.id]?.[field] ?? m[field]) as ProjectMember[K];
  }

  function submitIssue() {
    if (!issueContent.trim()) return;
    addProjectIssue({
      projectId,
      projectNumber: project!.projectNumber,
      content: issueContent.trim(),
      author: "김관리",
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      priority: issuePriority,
      status: issueStatus,
      recipientGroups: issueRecipients,
      recipientUserIds: issueRecipientUserIds,
      institutionName: issueNoInstitution ? undefined : (issueInstitutionName.trim() || undefined),
      noInstitution: issueNoInstitution,
    });
    setIssueContent("");
    setIssuePriority("MEDIUM");
    setIssueStatus("OPEN");
    setIssueRecipients([]);
    setIssueRecipientUserIds([]);
    setIssueInstitutionName("");
    setIssueNoInstitution(false);
    setShowIssueForm(false);
  }

  function toggleIssueRecipient(group: IssueRecipientGroup) {
    setIssueRecipients((prev) => prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]);
  }
  function toggleEditIssueRecipient(group: IssueRecipientGroup) {
    setEditIssueDraft((d) => ({
      ...d,
      recipientGroups: d.recipientGroups.includes(group) ? d.recipientGroups.filter((g) => g !== group) : [...d.recipientGroups, group],
    }));
  }

  return (
    <div className="space-y-4">
      {/* 기본 정보 — 항상 편집 가능 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 rounded-t-xl">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <FiInfo size={14} className="text-slate-400" /> 기본 정보
          </h3>
          <div className="flex items-center gap-2">
            {savedMsg && <span className="text-xs text-green-600 font-medium">저장됨</span>}
            {canEditProjects && (
              <button onClick={saveEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <FiCheck size={12} /> 저장
              </button>
            )}
          </div>
        </div>
        <div className="px-5 py-5 space-y-4">
          {/* 기본 식별 정보 (과제코드/상태/과제번호/전담기관/과제명/주관기관/연구책임자명) */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-4 space-y-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FiHash size={12} className="text-slate-400" /> 기본 식별 정보
            </p>
            {/* 과제코드 + 상태 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">과제코드</label>
                <input className={`${inp} w-full font-mono bg-white`} value={draft.projectCode ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, projectCode: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">상태</label>
                <select className={`${sel} w-full`} value={draft.status}
                  onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as Project["status"] }))}>
                  <option value="ACTIVE">진행중</option>
                  <option value="COMPLETED">완료</option>
                  <option value="SUSPENDED">중단</option>
                </select>
              </div>
            </div>

            {/* 과제번호 + 전담기관 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">과제번호</label>
                <input className={`${inp} w-full font-mono bg-white`} value={draft.projectNumber}
                  onChange={(e) => setDraft((p) => ({ ...p, projectNumber: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">전담기관</label>
                <select className={`${sel} w-full`} value={draft.agencyId ?? ""}
                  onChange={(e) => {
                    const a = fundingAgencies.find((fa) => fa.id === e.target.value);
                    setDraft((p) => ({ ...p, agencyId: e.target.value, agency: a?.name ?? "" }));
                  }}>
                  <option value="">선택하세요</option>
                  {fundingAgencies.map((a) => (
                    <option key={a.id} value={a.id}>{a.shortName} · {a.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 과제명 */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">과제명</label>
              <input className={`${inp} w-full bg-white`} value={draft.projectName}
                onChange={(e) => setDraft((p) => ({ ...p, projectName: e.target.value }))} />
            </div>

            {/* 주관기관 + 연구책임자명 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <InstitutionQuickAdd
                  label="주관기관"
                  value={draft.leadInstitutionId}
                  onChange={(id) => setDraft((p) => ({ ...p, leadInstitutionId: id }))}
                  institutions={institutions}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">연구책임자명</label>
                <input className={`${inp} w-full bg-white`} value={draft.researchLead ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, researchLead: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* 사업비 구분 (총사업비 / 현금사업비 / 현물사업비) */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FiDollarSign size={12} className="text-slate-400" /> 사업비 구분 (총사업비 / 현금사업비 / 현물사업비)
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 정부출연금 (원)</label>
                <MoneyInput className={`${inp} w-full`} value={draft.govGrant ?? 0}
                  onChange={(v) => setDraft((p) => ({ ...p, govGrant: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">공동기관 수</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white text-slate-500">
                  {members.filter((m) => m.role === "PARTICIPANT").length}개
                </div>
                <p className="text-[10px] text-slate-400 mt-1">참여기관 목록에서 기관을 추가·삭제하면 자동 반영됩니다</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현금 (원)</label>
                <MoneyInput className={`${inp} w-full`} value={draft.privateCash ?? 0}
                  onChange={(v) => setDraft((p) => ({ ...p, privateCash: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  사용실적 제출기한
                  <span className="ml-1 text-slate-400 font-normal">· 전담기관 사용실적보고서 기준</span>
                </label>
                <DateInput className="w-full" value={draft.usageReportDeadline ?? ""}
                  onChange={(v) => setDraft((p) => ({ ...p, usageReportDeadline: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현물 (원)</label>
                <MoneyInput className={`${inp} w-full`} value={draft.privateInKind ?? 0}
                  onChange={(v) => setDraft((p) => ({ ...p, privateInKind: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">전담기관 배정일자</label>
                <DateInput className="w-full" value={draft.agencyAssignedAt ?? ""}
                  onChange={(v) => setDraft((p) => ({ ...p, agencyAssignedAt: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 현금사업비 (자동계산)</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white font-bold text-slate-700">
                  {fmtWonFull((draft.govGrant ?? 0) + (draft.privateCash ?? 0))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">내부 배정일</label>
                <DateInput className="w-full" value={draft.internalAssignedAt ?? ""}
                  onChange={(v) => setDraft((p) => ({ ...p, internalAssignedAt: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 사업비 (자동계산)</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white font-bold text-slate-700">
                  {fmtWonFull(annualBudget)}
                </div>
              </div>
            </div>
          </div>

          {/* 과제 전체 기간 — 단계협약은 협약구조 표의 1단계 시작일·마지막 단계 종료일에서 자동
              계산되고(직접 입력 불가), 일괄협약은 단계 표가 없으므로 그대로 직접 입력받는다. */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FiCalendar size={12} className="text-slate-400" /> 과제 전체 기간
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  최초시작일 (과제 총 시작일){isStaged && " (1단계 시작일 자동계산)"}
                </label>
                {isStaged ? (
                  <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white font-bold text-slate-700">
                    {resolvedFirstStartDate ? fmtDate(resolvedFirstStartDate) : "협약구조에서 1단계 시작일을 입력해주세요"}
                  </div>
                ) : (
                  <DateInput className="w-full" value={draft.firstStartDate ?? ""}
                    onChange={(v) => setDraft((p) => ({ ...p, firstStartDate: v }))} />
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  최종종료일 (과제 총 종료일){isStaged && " (마지막 단계 종료일 자동계산)"}
                </label>
                {isStaged ? (
                  <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white font-bold text-slate-700">
                    {resolvedFinalEndDate ? fmtDate(resolvedFinalEndDate) : "협약구조에서 마지막 단계 종료일을 입력해주세요"}
                  </div>
                ) : (
                  <DateInput className="w-full" value={draft.finalEndDate ?? ""}
                    onChange={(v) => setDraft((p) => ({ ...p, finalEndDate: v }))} />
                )}
              </div>
            </div>
          </div>

          {/* 연차 + 과제구분 + 자율성트랙 */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FiLayers size={12} className="text-slate-400" /> 연차 및 과제 유형
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">과제 구분</label>
                <select className={`${sel} w-full`} value={draft.projectCategory ?? "연차상시"}
                  onChange={(e) => setDraft((p) => ({ ...p, projectCategory: e.target.value }))}>
                  <option value="연차상시">연차상시</option>
                  <option value="정산">정산</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">연차 (현재/총)</label>
                <input className={`${inp} w-full bg-white`} placeholder="예: 2/3" value={termText}
                  onChange={(e) => handleTermTextChange(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">자율성트랙 여부</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium bg-white">
                  <button type="button"
                    onClick={() => setDraft((p) => ({ ...p, projectType: "GENERAL" }))}
                    className={`flex-1 px-2 py-1.5 transition-colors ${
                      (draft.projectType ?? "GENERAL") === "GENERAL" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}>일반과제</button>
                  <button type="button"
                    onClick={() => setDraft((p) => ({ ...p, projectType: "AUTONOMY_TRACK" }))}
                    className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${
                      draft.projectType === "AUTONOMY_TRACK" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                    }`}>자율성트랙</button>
                </div>
              </div>
              {draft.projectType === "AUTONOMY_TRACK" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1"
                    title="참여기관별 정산구분과 별개로, 과제 전체에 일괄 적용됩니다">
                    자율성트랙 정산구분
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium bg-white">
                    <button type="button"
                      onClick={() => setDraft((p) => ({ ...p, autonomySettlementType: "자체정산" }))}
                      className={`flex-1 px-2 py-1.5 transition-colors ${
                        (draft.autonomySettlementType ?? "자체정산") === "자체정산" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>자체정산</button>
                    <button type="button"
                      onClick={() => setDraft((p) => ({ ...p, autonomySettlementType: "위탁정산" }))}
                      className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${
                        draft.autonomySettlementType === "위탁정산" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>위탁정산</button>
                  </div>
                </div>
              )}
              {draft.agencyId === "fa-003" && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    사업 유형 <span className="text-slate-400 font-normal">· IITP 전용</span>
                  </label>
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium bg-white">
                    <button type="button"
                      onClick={() => setDraft((p) => ({ ...p, programType: "GENERAL" }))}
                      className={`flex-1 px-2 py-1.5 transition-colors ${
                        (draft.programType ?? "GENERAL") === "GENERAL" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>일반 R&D</button>
                    <button type="button"
                      onClick={() => setDraft((p) => ({ ...p, programType: "ICT_FUND" }))}
                      className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${
                        draft.programType === "ICT_FUND" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"
                      }`}>ICT 기금사업</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-4 space-y-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <FiFileText size={12} className="text-slate-400" /> 협약구조
            </p>
            <AgreementStructureEditor
              agreementType={draft.agreementType}
              stages={draft.stages}
              totalTerms={draft.totalTerms}
              onChange={(agreementType, stages) => setDraft((p) => ({ ...p, agreementType, stages }))}
            />
          </div>
        </div>
      </div>

      {/* 참여기관 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">참여기관 목록</h3>
            <p className="text-xs text-slate-400 mt-0.5">기관별 현금·현물 사업비 및 등급 수정 가능 · 예산 변경 시 수수료 재산정 반영</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              currentWorkType === "SETTLEMENT" ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
            }`}>
              {viewTerm}연차 · {currentWorkType === "SETTLEMENT" ? "정산" : "연차상시"}
            </span>
            {viewTerm === currentTerm && (
              <span className={`text-xs ${budgetMatchesAnnual ? "text-slate-500" : "text-red-600 font-medium"}`}>
                현금+현물 합계 <strong className={budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}>{fmtWonFull(totalCashBudget + totalInKindBudget)}</strong>
                <span className="text-slate-400 mx-1">/</span>
                당해 사업비 {fmtWonFull(annualBudget)}
              </span>
            )}
            <span className="text-xs text-slate-500">
              산정 수수료 합계 <strong className="text-slate-800 ml-1">{fmtWonFull(totalCalcFee)}</strong>
            </span>
            {editingMembers ? (
              <>
                <button onClick={saveMemberEdits}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <FiCheck size={12} /> 저장
                </button>
                <button onClick={cancelMemberEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <FiX size={12} /> 취소
                </button>
              </>
            ) : canEditProjects ? (
              <>
                <button onClick={() => setShowAddMember((v) => !v)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                  <FiPlus size={12} /> 참여기관 추가
                </button>
                <button onClick={startMemberEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <FiEdit2 size={12} /> 기관 수정
                </button>
              </>
            ) : null}
          </div>
        </div>
        {!editingMembers && maxViewableTerm > 1 && (
          <div className="px-5 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-slate-400 shrink-0 mr-1">연차별 보기</span>
            {Array.from({ length: maxViewableTerm }, (_, i) => i + 1).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setViewTerm(t)}
                className={`shrink-0 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors ${
                  viewTerm === t
                    ? "bg-blue-600 border-blue-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {t}연차{t === currentTerm ? " · 현재" : ""}
              </button>
            ))}
          </div>
        )}
        {budgetMismatchError && (
          <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 text-xs font-medium text-red-600">
            {budgetMismatchError}
          </div>
        )}
        {showAddMember && (
          <AddMemberForm
            projectId={projectId}
            projectNumber={project.projectNumber}
            startDate={project.startDate}
            totalTerms={maxViewableTerm}
            institutions={institutions}
            existingInstitutionIds={new Set(members.map((m) => m.institutionId))}
            onClose={() => setShowAddMember(false)}
          />
        )}
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">참여기관 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">기관명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">역할</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">등급</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">정산구분</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">현금예산 (원)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">현물예산 (원)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">합계금액 (원)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">구분</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정 수수료 ({viewTerm}연차)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 w-24">연차별 사업비</th>
                {canEditProjects && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const rawGrade = (getMemberVal(m, "institutionGrade") ?? "일반") as string;
                // 배지 표시는 편집 중인 기본값이 아니라 "지금 보고 있는 연차에 실제로 적용되는" 값(연차별
                // 오버라이드 반영)을 보여준다. 인라인 일괄수정 중에는 항상 진행 연차(currentTerm)만 다루므로
                // 그때는 getMemberBudgetVal(currentTerm 고정) 값을 그대로 쓴다.
                const displayGrade = normalizeGrade(resolveMemberGradeForTerm(m, viewTerm));
                const displaySettlementType = resolveMemberSettlementTypeForTerm(m, viewTerm, defaultSettlementType);
                const cashBudget = editingMembers ? getMemberBudgetVal(m, "cashBudget") : getViewTermBudget(m, viewTerm).cashBudget;
                const inKindBudget = editingMembers ? getMemberBudgetVal(m, "inKindBudget") : getViewTermBudget(m, viewTerm).inKindBudget;
                const isParticipatingThisTerm = cashBudget > 0 || inKindBudget > 0;
                return (
                  <tr key={m.id} className={`border-b border-slate-50 hover:bg-slate-50 ${!isParticipatingThisTerm ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <Link href={`/institutions/${m.institutionId}`}
                        className="text-sm text-blue-600 hover:underline font-medium">{m.institutionName}</Link>
                      {!isParticipatingThisTerm && (
                        <span className="ml-1.5 text-[10px] font-medium text-slate-400" title={`${viewTerm}연차 사업비가 입력되지 않아 이 연차 계산에서 빠집니다`}>
                          · {viewTerm}연차 미참여
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMembers ? (
                        <select
                          value={getMemberVal(m, "role")}
                          onChange={(e) => setMemberField(m.id, "role", e.target.value as ProjectMember["role"])}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="LEAD">주관</option>
                          <option value="PARTICIPANT">공동</option>
                          <option value="ENTRUSTED">위탁</option>
                        </select>
                      ) : (
                        <StatusBadge
                          label={ROLE_LABEL[m.role]}
                          color={m.role === "LEAD" ? "blue" : m.role === "ENTRUSTED" ? "amber" : "slate"}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMembers ? (
                        <select
                          value={rawGrade}
                          onChange={(e) => setMemberField(m.id, "institutionGrade", e.target.value as ProjectMember["institutionGrade"])}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="최우수(S)">최우수 (S)</option>
                          <option value="우수(A)">우수 (A)</option>
                          <option value="우수(B)">우수 (B)</option>
                          <option value="우수(C)">우수 (C)</option>
                          <option value="일반">일반</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${GRADE_COLOR[displayGrade] ?? GRADE_COLOR["일반"]}`} title={`${viewTerm}연차 적용 등급`}>
                          {GRADE_LABEL[displayGrade] ?? displayGrade}
                        </span>
                      )}
                      {displayGrade !== "일반" && !isNonProfitInstitution(m.institutionType) && (
                        <p className="text-[10px] text-amber-600 mt-1 leading-tight" title="정산면제는 비영리기관(대학·정부출연연구소·공공기관)만 해당하여, 영리기업은 등급이 있어도 정산면제가 적용되지 않습니다.">
                          ⚠ 영리기관·면제불가
                        </p>
                      )}
                      <button
                        onClick={() => setEditingGradeMember(m)}
                        className="mt-1 inline-flex items-center gap-1 text-slate-400 hover:text-blue-600 transition-colors"
                        title={(m.gradeOverrides?.length ?? 0) > 0
                          ? `연차별 등급 ${m.gradeOverrides!.length}건 설정됨 — 클릭하여 수정`
                          : "등급평가는 연차마다 갱신될 수 있습니다 — 연차별로 다른 등급을 지정하려면 클릭"}
                      >
                        <FiEdit2 size={11} />
                        {(m.gradeOverrides?.length ?? 0) > 0 && (
                          <span className="text-[10px] font-medium">{m.gradeOverrides!.length}</span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMembers ? (
                        <select
                          value={getMemberVal(m, "settlementType") ?? defaultSettlementType}
                          onChange={(e) => setMemberField(m.id, "settlementType", e.target.value as ProjectMember["settlementType"])}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="위탁정산">위탁정산</option>
                          <option value="자체정산">자체정산</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                          displaySettlementType === "자체정산" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`} title={`${viewTerm}연차 적용 정산구분`}>
                          {displaySettlementType}
                        </span>
                      )}
                      <button
                        onClick={() => setEditingSettlementMember(m)}
                        className="mt-1 inline-flex items-center gap-1 text-slate-400 hover:text-blue-600 transition-colors"
                        title={(m.settlementTypeOverrides?.length ?? 0) > 0
                          ? `연차별 정산구분 ${m.settlementTypeOverrides!.length}건 설정됨 — 클릭하여 수정`
                          : "정산구분은 연차 중간에 바뀔 수 있습니다 — 연차별로 다르게 지정하려면 클릭"}
                      >
                        <FiEdit2 size={11} />
                        {(m.settlementTypeOverrides?.length ?? 0) > 0 && (
                          <span className="text-[10px] font-medium">{m.settlementTypeOverrides!.length}</span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingMembers ? (
                        <MoneyInput
                          value={cashBudget}
                          onChange={(v) => setMemberBudgetField(m, "cashBudget", v)}
                          className={`${inp} w-36 text-right`}
                        />
                      ) : (
                        <span className="text-sm text-slate-700">{fmtWonFull(cashBudget)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingMembers ? (
                        <MoneyInput
                          value={inKindBudget}
                          onChange={(v) => setMemberBudgetField(m, "inKindBudget", v)}
                          className={`${inp} w-36 text-right`}
                        />
                      ) : (
                        <span className="text-sm text-slate-700">{fmtWonFull(inKindBudget)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-medium text-slate-800">{fmtWonFull(cashBudget + inKindBudget)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {excludedIds.has(m.institutionId)
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded bg-red-100 text-red-600">제외</span>
                        : exemptIds.has(m.institutionId)
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">면제</span>
                        : <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">일반</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      {feeResult
                        ? fmtWonFull(getInstCalcFee(m.institutionId))
                        : fmtWonFull(m.calculatedFee)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setEditingBudgetMember(m)}
                        className="text-[11px] font-medium text-blue-600 border border-blue-200 rounded-lg px-2 py-1 hover:bg-blue-50 transition-colors"
                      >
                        {(m.annualBudgets?.length ?? 0) > 0 ? `${m.annualBudgets!.length}개 연차` : "입력"}
                      </button>
                    </td>
                    {canEditProjects && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            // 연차 탭이 여러 개인 과제에서 "삭제"는 그 연차부터 이후 연차까지 전부 빠지는
                            // 것을 의미한다(계약 종료 등으로 이 연차부터 참여를 그만두는 경우) — 그 이전
                            // 연차 참여 이력은 그대로 남긴다. 그 결과 남는 연차가 하나도 없으면(애초에
                            // 이 연차부터 참여였던 경우) 참여기관 자체를 완전히 제거한다.
                            if (maxViewableTerm > 1) {
                              if (!confirm(`"${m.institutionName}"을(를) ${viewTerm}연차부터 이후 연차 전부 제외합니다. 그 이전 연차 참여 이력은 그대로 유지됩니다. 계속하시겠습니까?`)) return;
                              const remainingBudgets = (m.annualBudgets ?? []).filter((b) => b.termNumber < viewTerm);
                              if (remainingBudgets.length === 0) {
                                deleteProjectMember(m.id);
                              } else {
                                updateProjectMember(m.id, {
                                  annualBudgets: remainingBudgets,
                                  gradeOverrides: m.gradeOverrides?.filter((g) => g.termNumber < viewTerm),
                                  settlementTypeOverrides: m.settlementTypeOverrides?.filter((s) => s.termNumber < viewTerm),
                                });
                              }
                            } else {
                              if (confirm(`"${m.institutionName}"을(를) 참여기관에서 제외하시겠습니까?`)) deleteProjectMember(m.id);
                            }
                          }}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title={maxViewableTerm > 1 ? `${viewTerm}연차부터 이후 연차 전부 제외` : "참여기관에서 제외"}>
                          <FiTrash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={4} className="px-4 py-2.5 text-right text-xs text-slate-400">합계</td>
                <td className={`px-4 py-2.5 text-right font-bold ${!editingMembers || budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}`}>
                  현금 {fmtWonFull(viewTotalCashBudget)}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold ${!editingMembers || budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}`}>
                  현물 {fmtWonFull(viewTotalInKindBudget)}
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtWonFull(viewTotalCashBudget + viewTotalInKindBudget)}</td>
                <td />
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtWonFull(totalCalcFee)}</td>
                <td />
                {canEditProjects && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* 이슈/메모 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">이슈 / 메모</h3>
          {canEditIssues && (
            <button onClick={() => setShowIssueForm((v) => !v)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              <FiPlus size={12} /> 이슈 등록
            </button>
          )}
        </div>
        {showIssueForm && (
          <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/30">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">이슈 발생 기관명</label>
                <div className="flex items-center gap-2">
                  <input value={issueInstitutionName} onChange={(e) => setIssueInstitutionName(e.target.value)}
                    disabled={issueNoInstitution} placeholder="기관명을 입력하세요"
                    className={`${inp} flex-1 disabled:bg-slate-50 disabled:text-slate-400`} />
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap">
                    <input type="checkbox" checked={issueNoInstitution}
                      onChange={(e) => { setIssueNoInstitution(e.target.checked); if (e.target.checked) setIssueInstitutionName(""); }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                    <span className="text-xs text-slate-600">선택 필요 없음</span>
                  </label>
                </div>
              </div>
              <textarea value={issueContent} onChange={(e) => setIssueContent(e.target.value)}
                placeholder="이슈 또는 메모 내용을 입력하세요"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                rows={3} autoFocus />
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-xs text-slate-500 mr-2">중요도</label>
                  <select value={issuePriority} onChange={(e) => setIssuePriority(e.target.value as typeof issuePriority)}
                    className={`${sel} w-24`}>
                    <option value="HIGH">높음</option>
                    <option value="MEDIUM">보통</option>
                    <option value="LOW">낮음</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 mr-2">진행여부</label>
                  <select value={issueStatus} onChange={(e) => setIssueStatus(e.target.value as typeof issueStatus)}
                    className={`${sel} w-24`}>
                    <option value="OPEN">미처리</option>
                    <option value="IN_PROGRESS">진행중</option>
                    <option value="RESOLVED">완료</option>
                  </select>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">알림 받을 대상(전체) <span className="text-slate-400 font-normal">· 선택 안 하면 과제 담당자에게만 전달</span></p>
                <div className="flex items-center gap-3">
                  {([
                    { value: "MANAGER", label: "담당자" },
                    { value: "ACCOUNTANT", label: "회계담당자 전체" },
                    { value: "SETTLEMENT", label: "전문기관담당자 전체" },
                  ] as const).map(({ value, label }) => (
                    <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={issueRecipients.includes(value)}
                        onChange={() => toggleIssueRecipient(value)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                      <span className="text-xs text-slate-600">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1.5">알림 받을 대상(개인) <span className="text-slate-400 font-normal">· 위 전체 선택과 별개로 특정 인원을 추가 지정</span></p>
                <UserMultiSelect
                  users={selectableUsers}
                  selectedIds={issueRecipientUserIds}
                  onChange={setIssueRecipientUserIds}
                  placeholder="이름으로 검색..."
                />
                <div className="flex gap-2 mt-3 justify-end">
                  <button onClick={() => setShowIssueForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
                  <button onClick={submitIssue} disabled={!issueContent.trim()}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">등록</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {issues.length === 0 && !showIssueForm ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">등록된 이슈가 없습니다</div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {issues.map((issue) => {
              const isEditing = editingIssueId === issue.id;
              const isDeleting = deletingIssueId === issue.id;

              if (isEditing) {
                return (
                  <li key={issue.id} className="px-5 py-3.5 bg-blue-50/30 space-y-2">
                    <textarea
                      value={editIssueDraft.content}
                      onChange={(e) => setEditIssueDraft((d) => ({ ...d, content: e.target.value }))}
                      className="w-full text-sm border border-blue-300 rounded-lg px-3 py-2 text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                      rows={2} maxLength={500} autoFocus />
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="text-xs text-slate-500 mr-1.5">중요도</label>
                        <select value={editIssueDraft.priority}
                          onChange={(e) => setEditIssueDraft((d) => ({ ...d, priority: e.target.value as typeof editIssueDraft.priority }))}
                          className={`${sel} w-20 py-1`}>
                          <option value="HIGH">높음</option>
                          <option value="MEDIUM">보통</option>
                          <option value="LOW">낮음</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mr-1.5">진행여부</label>
                        <select value={editIssueDraft.status}
                          onChange={(e) => setEditIssueDraft((d) => ({ ...d, status: e.target.value as typeof editIssueDraft.status }))}
                          className={`${sel} w-20 py-1`}>
                          <option value="OPEN">미처리</option>
                          <option value="IN_PROGRESS">진행중</option>
                          <option value="RESOLVED">완료</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500 mr-1.5 shrink-0">이슈 발생 기관</label>
                      <input value={editIssueDraft.institutionName}
                        onChange={(e) => setEditIssueDraft((d) => ({ ...d, institutionName: e.target.value }))}
                        disabled={editIssueDraft.noInstitution} placeholder="기관명을 입력하세요"
                        className={`${sel} w-40 py-1 disabled:bg-slate-50 disabled:text-slate-400`} />
                      <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                        <input type="checkbox" checked={editIssueDraft.noInstitution}
                          onChange={(e) => setEditIssueDraft((d) => ({ ...d, noInstitution: e.target.checked, institutionName: e.target.checked ? "" : d.institutionName }))}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                        <span className="text-xs text-slate-600">선택 필요 없음</span>
                      </label>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs text-slate-500 shrink-0">대상(전체)</span>
                      {([
                        { value: "MANAGER", label: "담당자" },
                        { value: "ACCOUNTANT", label: "회계담당자 전체" },
                        { value: "SETTLEMENT", label: "전문기관담당자 전체" },
                      ] as const).map(({ value, label }) => (
                        <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={editIssueDraft.recipientGroups.includes(value)}
                            onChange={() => toggleEditIssueRecipient(value)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                          <span className="text-xs text-slate-600">{label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-xs text-slate-500 shrink-0 pt-1.5">대상(개인)</span>
                      <div className="flex-1 max-w-sm">
                        <UserMultiSelect
                          users={selectableUsers}
                          selectedIds={editIssueDraft.recipientUserIds}
                          onChange={(ids) => setEditIssueDraft((d) => ({ ...d, recipientUserIds: ids }))}
                          placeholder="이름으로 검색..."
                        />
                      </div>
                      <div className="flex gap-2 ml-auto">
                        <button onClick={() => setEditingIssueId(null)}
                          className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
                        <button
                          onClick={() => {
                            updateProjectIssue(issue.id, {
                              content: editIssueDraft.content.trim(), priority: editIssueDraft.priority, status: editIssueDraft.status,
                              recipientGroups: editIssueDraft.recipientGroups,
                              recipientUserIds: editIssueDraft.recipientUserIds,
                              institutionName: editIssueDraft.noInstitution ? undefined : (editIssueDraft.institutionName.trim() || undefined),
                              noInstitution: editIssueDraft.noInstitution,
                            });
                            setEditingIssueId(null);
                          }}
                          disabled={!editIssueDraft.content.trim()}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                          <FiCheck size={11} /> 저장
                        </button>
                      </div>
                    </div>
                  </li>
                );
              }

              return (
                <li key={issue.id} className={`px-5 py-3.5 flex items-start gap-3 transition-colors ${isDeleting ? "bg-red-50" : ""}`}>
                  <span className={`mt-0.5 shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${PRIORITY_STYLE[issue.priority]}`}>
                    {PRIORITY_LABEL[issue.priority]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-relaxed">{issue.content}</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {issue.author} · {issue.createdAt}
                      {!issue.noInstitution && issue.institutionName && <> · {issue.institutionName}</>}
                    </p>
                  </div>
                  {canManageIssues ? (
                    <select
                      value={issue.status ?? "OPEN"}
                      onChange={(e) => updateProjectIssue(issue.id, { status: e.target.value as "OPEN" | "IN_PROGRESS" | "RESOLVED" })}
                      className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-400 ${ISSUE_STATUS_STYLE[issue.status ?? "OPEN"]}`}>
                      <option value="OPEN">미처리</option>
                      <option value="IN_PROGRESS">진행중</option>
                      <option value="RESOLVED">완료</option>
                    </select>
                  ) : (
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${ISSUE_STATUS_STYLE[issue.status ?? "OPEN"]}`}>
                      {ISSUE_STATUS_LABEL[issue.status ?? "OPEN"]}
                    </span>
                  )}
                  {canManageIssues && (
                    isDeleting ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => { deleteProjectIssue(issue.id); setDeletingIssueId(null); }}
                          className="px-2 py-0.5 text-[10px] font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors">
                          삭제
                        </button>
                        <button onClick={() => setDeletingIssueId(null)}
                          className="px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-100 rounded transition-colors">
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => { setEditingIssueId(issue.id); setEditIssueDraft({
                            content: issue.content, priority: issue.priority, status: issue.status ?? "OPEN",
                            recipientGroups: issue.recipientGroups ?? [], recipientUserIds: issue.recipientUserIds ?? [],
                            institutionName: issue.institutionName ?? "", noInstitution: issue.noInstitution ?? false,
                          }); }}
                          className="p-1.5 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                          <FiEdit2 size={13} />
                        </button>
                        <button onClick={() => setDeletingIssueId(issue.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                          <FiTrash2 size={13} />
                        </button>
                      </div>
                    )
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* 변경이력 */}
      {history.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">변경이력</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">일시</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">액션</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">수행자</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">변경 항목</th>
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="px-4 py-2.5 text-center font-mono text-xs text-slate-500">{e.performedAt}</td>
                  <td className="px-4 py-2.5 text-center">
                    <StatusBadge
                      label={e.action === "CREATE" ? "생성" : e.action === "UPDATE" ? "수정" : "삭제"}
                      color={e.action === "CREATE" ? "blue" : e.action === "UPDATE" ? "amber" : "red"}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center text-sm text-slate-700">{e.performedBy}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {e.changedFields ? (
                      <div className="space-y-0.5">
                        {Object.entries(e.changedFields).map(([field, change]) => (
                          <div key={field}>
                            <span className="font-medium text-slate-600">{fieldLabel(field)}</span>
                            {": "}
                            <span className="line-through text-red-500">{fmtValue(change.before, e.entityType, field)}</span>
                            {" → "}
                            <span className="text-blue-600 font-medium">{fmtValue(change.after, e.entityType, field)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showProjectTypeConfirm && (
        <Modal title="과제 유형 변경 확인" onClose={() => setShowProjectTypeConfirm(false)}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              {(draft.projectType ?? "GENERAL") !== (project.projectType ?? "GENERAL") ? (
                <>과제 유형을 <span className="font-semibold">{draft.projectType === "AUTONOMY_TRACK" ? "자율성트랙" : "일반 R&D"}</span>(으)로 변경하면, </>
              ) : (draft.programType ?? "GENERAL") !== (project.programType ?? "GENERAL") ? (
                <>사업 유형을 <span className="font-semibold">{draft.programType === "ICT_FUND" ? "ICT 기금사업" : "일반 R&D"}</span>(으)로 변경하면, </>
              ) : (
                <>자율성트랙 정산구분을 <span className="font-semibold">{draft.autonomySettlementType ?? "자체정산"}</span>(으)로 변경하면, </>
              )}
              아직 확정(청구완료)되지 않은 <span className="font-semibold text-blue-700">{countUnlockedTerms()}개 연차</span>의 수수료가
              새 기준으로 다시 계산됩니다. 과거 연차라도 확정 전이면 함께 재계산 대상에 포함됩니다.
            </p>
            <p className="text-xs text-slate-400">
              이미 확정되었거나 금액을 직접 수정(수동조정)해 둔 연차는 영향을 받지 않습니다.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowProjectTypeConfirm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={() => { setShowProjectTypeConfirm(false); doSaveEdit(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                재계산하고 저장
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showStageDateConfirm && (
        <Modal title="연차 날짜 확인" onClose={() => setShowStageDateConfirm(false)}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-slate-700 leading-relaxed">
              단계 날짜가 바뀌면서, 직접 날짜를 지정해둔{" "}
              <span className="font-semibold text-blue-700">{manuallyDatedTermsInChangedStages().length}개 연차</span>가
              새 단계 기간과 맞지 않게 될 수 있습니다. 그 연차들의 날짜를 함께 바꾸시겠습니까?
            </p>
            <p className="text-xs text-slate-400">
              &quot;자동계산으로 초기화&quot;를 선택하면 직접 지정한 날짜를 지우고 새 단계 기간 기준으로 다시 계산된 값을 씁니다.
              &quot;그대로 두고 저장&quot;을 선택하면 지정해둔 날짜는 유지되지만, 목록에 &quot;단계·연차 날짜 불일치&quot; 표시가 뜹니다.
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setShowStageDateConfirm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={() => { setShowStageDateConfirm(false); doSaveEdit(); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                그대로 두고 저장
              </button>
              <button
                onClick={() => {
                  for (const t of manuallyDatedTermsInChangedStages()) {
                    setTermDates(project!.projectNumber, t.termYear, t.termNumber, null, null);
                  }
                  setShowStageDateConfirm(false);
                  doSaveEdit();
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                연차 날짜 초기화하고 저장
              </button>
            </div>
          </div>
        </Modal>
      )}

      {editingBudgetMember && (
        <Modal title={`${editingBudgetMember.institutionName} · 연차별 사업비`} onClose={() => setEditingBudgetMember(null)}>
          <AnnualBudgetEditor
            member={editingBudgetMember}
            project={project}
            canEdit={canEditProjects}
            onClose={() => setEditingBudgetMember(null)}
          />
        </Modal>
      )}

      {editingGradeMember && (
        <Modal title={`${editingGradeMember.institutionName} · 연차별 등급`} onClose={() => setEditingGradeMember(null)}>
          <GradeOverrideEditor
            member={editingGradeMember}
            project={project}
            lockedTermNumbers={new Set(
              termFees
                .filter((tf) => tf.projectNumber === project.projectNumber && tf.institutionId === editingGradeMember.institutionId &&
                  (tf.status === "CONFIRMED" || tf.status === "BILLED" || tf.manualOverride))
                .map((tf) => tf.termNumber)
            )}
            canEdit={canEditProjects}
            onClose={() => setEditingGradeMember(null)}
          />
        </Modal>
      )}

      {editingSettlementMember && (
        <Modal title={`${editingSettlementMember.institutionName} · 연차별 정산구분`} onClose={() => setEditingSettlementMember(null)}>
          <SettlementTypeOverrideEditor
            member={editingSettlementMember}
            project={project}
            defaultSettlementType={defaultSettlementType}
            lockedTermNumbers={new Set(
              termFees
                .filter((tf) => tf.projectNumber === project.projectNumber && tf.institutionId === editingSettlementMember.institutionId &&
                  (tf.status === "CONFIRMED" || tf.status === "BILLED" || tf.manualOverride))
                .map((tf) => tf.termNumber)
            )}
            canEdit={canEditProjects}
            onClose={() => setEditingSettlementMember(null)}
          />
        </Modal>
      )}
    </div>
  );
}

// ─── 참여기관별 연차별 사업비 입력 ──────────────────────────────
function AnnualBudgetEditor({
  member,
  project,
  canEdit,
  onClose,
}: {
  member: ProjectMember;
  project: Project;
  canEdit: boolean;
  onClose: () => void;
}) {
  const totalTerms = project.totalTerms ?? 1;
  const [rows, setRows] = useState(() =>
    Array.from({ length: totalTerms }, (_, i) => {
      const termNumber = i + 1;
      const existing = member.annualBudgets?.find((a) => a.termNumber === termNumber);
      return {
        termNumber,
        termYear: existing?.termYear ?? termNumberToYear(project.startDate, termNumber),
        cashBudget: existing?.cashBudget ?? 0,
        inKindBudget: existing?.inKindBudget ?? 0,
      };
    })
  );

  function setRow(termNumber: number, patch: Partial<{ cashBudget: number; inKindBudget: number }>) {
    setRows((prev) => prev.map((r) => (r.termNumber === termNumber ? { ...r, ...patch } : r)));
  }

  function handleSave() {
    const annualBudgets = rows
      .filter((r) => r.cashBudget > 0 || r.inKindBudget > 0)
      .map((r) => ({ termYear: r.termYear, termNumber: r.termNumber, cashBudget: r.cashBudget, inKindBudget: r.inKindBudget }));
    updateProjectMember(member.id, { annualBudgets: annualBudgets.length > 0 ? annualBudgets : undefined });
    onClose();
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-slate-400 -mt-1">
        연차별 사업비가 입력된 연차만 해당 연차의 수수료가 자동 산정됩니다. 0원인 연차는 저장 시 제외됩니다.
      </p>
      <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="text-left px-3 py-2 font-semibold text-slate-600">연차</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">연도</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-600">현금사업비 (원)</th>
              <th className="text-right px-3 py-2 font-semibold text-slate-600">현물사업비 (원)</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((r) => (
              <tr key={r.termNumber} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.termNumber}연차</td>
                <td className="px-3 py-2 text-slate-500">{r.termYear}</td>
                <td className="px-3 py-2">
                  <MoneyInput
                    disabled={!canEdit}
                    value={r.cashBudget}
                    onChange={(v) => setRow(r.termNumber, { cashBudget: v })}
                    className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
                <td className="px-3 py-2">
                  <MoneyInput
                    disabled={!canEdit}
                    value={r.inKindBudget}
                    onChange={(v) => setRow(r.termNumber, { inKindBudget: v })}
                    className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 disabled:bg-slate-50 disabled:text-slate-400"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          {canEdit ? "취소" : "닫기"}
        </button>
        {canEdit && (
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            저장
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 참여기관별 연차별 등급 입력 ──────────────────────────────
// 등급평가(정산면제리스트)는 연차마다 갱신될 수 있어, 특정 연차부터 등급이 바뀐 경우 여기서
// 그 연차 이후만 다르게 지정한다. 이미 확정(청구완료)된 연차는 잠겨서 여기서 바꿔도 반영되지 않는다.
function GradeOverrideEditor({
  member,
  project,
  lockedTermNumbers,
  canEdit,
  onClose,
}: {
  member: ProjectMember;
  project: Project;
  lockedTermNumbers: Set<number>;
  canEdit: boolean;
  onClose: () => void;
}) {
  const totalTerms = project.totalTerms ?? 1;
  const baseGrade = member.institutionGrade ?? "일반";
  const [rows, setRows] = useState(() =>
    Array.from({ length: totalTerms }, (_, i) => {
      const termNumber = i + 1;
      const override = member.gradeOverrides?.find((g) => g.termNumber === termNumber);
      return { termNumber, grade: override?.grade ?? baseGrade };
    })
  );

  function setRowGrade(termNumber: number, grade: NonNullable<ProjectMember["institutionGrade"]>) {
    setRows((prev) => prev.map((r) => (r.termNumber === termNumber ? { ...r, grade } : r)));
  }

  function handleSave() {
    // 기본값(institutionGrade)과 같은 연차는 굳이 오버라이드로 남기지 않는다.
    const overrides = rows
      .filter((r) => r.grade !== baseGrade)
      .map((r) => ({ termNumber: r.termNumber, grade: r.grade }));
    updateProjectMember(member.id, { gradeOverrides: overrides.length > 0 ? overrides : undefined });
    onClose();
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-slate-400 -mt-1">
        기본 등급은 <span className="font-medium text-slate-600">{baseGrade}</span>입니다. 특정 연차부터 등급이 바뀐 경우에만 그 연차를 다르게 지정하세요.
        이미 확정(청구완료)되었거나 수동조정된 연차는 잠겨서 여기서 바꿔도 계산에 반영되지 않습니다.
      </p>
      <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="text-left px-3 py-2 font-semibold text-slate-600">연차</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">등급</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">상태</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((r) => {
              const locked = lockedTermNumbers.has(r.termNumber);
              return (
                <tr key={r.termNumber} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.termNumber}연차</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={!canEdit || locked}
                      value={r.grade}
                      onChange={(e) => setRowGrade(r.termNumber, e.target.value as NonNullable<ProjectMember["institutionGrade"]>)}
                      className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="최우수(S)">최우수 (S)</option>
                      <option value="우수(A)">우수 (A)</option>
                      <option value="우수(B)">우수 (B)</option>
                      <option value="우수(C)">우수 (C)</option>
                      <option value="일반">일반</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {locked ? <span className="text-amber-600 font-medium">확정됨</span> : <span className="text-slate-300">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          {canEdit ? "취소" : "닫기"}
        </button>
        {canEdit && (
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            저장
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 참여기관별 연차별 정산구분 입력 ──────────────────────────
// 참여기관의 위탁/자체 정산 여부는 계약 변경 등으로 연차 중간에 바뀔 수 있어, 여기서 그 연차
// 이후만 다르게 지정한다. 이미 확정(청구완료)된 연차는 잠겨서 여기서 바꿔도 반영되지 않는다.
function SettlementTypeOverrideEditor({
  member,
  project,
  defaultSettlementType,
  lockedTermNumbers,
  canEdit,
  onClose,
}: {
  member: ProjectMember;
  project: Project;
  defaultSettlementType: "위탁정산" | "자체정산";
  lockedTermNumbers: Set<number>;
  canEdit: boolean;
  onClose: () => void;
}) {
  const totalTerms = project.totalTerms ?? 1;
  const baseSettlementType = member.settlementType ?? defaultSettlementType;
  const [rows, setRows] = useState(() =>
    Array.from({ length: totalTerms }, (_, i) => {
      const termNumber = i + 1;
      const override = member.settlementTypeOverrides?.find((g) => g.termNumber === termNumber);
      return { termNumber, settlementType: override?.settlementType ?? baseSettlementType };
    })
  );

  function setRowSettlementType(termNumber: number, settlementType: "위탁정산" | "자체정산") {
    setRows((prev) => prev.map((r) => (r.termNumber === termNumber ? { ...r, settlementType } : r)));
  }

  function handleSave() {
    // 기본값(settlementType)과 같은 연차는 굳이 오버라이드로 남기지 않는다.
    const overrides = rows
      .filter((r) => r.settlementType !== baseSettlementType)
      .map((r) => ({ termNumber: r.termNumber, settlementType: r.settlementType }));
    updateProjectMember(member.id, { settlementTypeOverrides: overrides.length > 0 ? overrides : undefined });
    onClose();
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-slate-400 -mt-1">
        기본 정산구분은 <span className="font-medium text-slate-600">{baseSettlementType}</span>입니다. 특정 연차부터 정산구분이 바뀐 경우에만 그 연차를 다르게 지정하세요.
        이미 확정(청구완료)되었거나 수동조정된 연차는 잠겨서 여기서 바꿔도 계산에 반영되지 않습니다.
      </p>
      <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-100 border-b border-slate-300">
              <th className="text-left px-3 py-2 font-semibold text-slate-600">연차</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">정산구분</th>
              <th className="text-left px-3 py-2 font-semibold text-slate-600">상태</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {rows.map((r) => {
              const locked = lockedTermNumbers.has(r.termNumber);
              return (
                <tr key={r.termNumber} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.termNumber}연차</td>
                  <td className="px-3 py-2">
                    <select
                      disabled={!canEdit || locked}
                      value={r.settlementType}
                      onChange={(e) => setRowSettlementType(r.termNumber, e.target.value as "위탁정산" | "자체정산")}
                      className="text-xs border border-slate-300 rounded px-2 py-1.5 bg-white text-slate-700 disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="위탁정산">위탁정산</option>
                      <option value="자체정산">자체정산</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {locked ? <span className="text-amber-600 font-medium">확정됨</span> : <span className="text-slate-300">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          {canEdit ? "취소" : "닫기"}
        </button>
        {canEdit && (
          <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            저장
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 참여기관 추가 폼 ──────────────────────────────────────────
function AddMemberForm({
  projectId,
  projectNumber,
  startDate,
  totalTerms,
  institutions,
  existingInstitutionIds,
  onClose,
}: {
  projectId: string;
  projectNumber: string;
  startDate: string;
  totalTerms: number;
  institutions: Institution[];
  existingInstitutionIds: Set<string>;
  onClose: () => void;
}) {
  const [institutionId, setInstitutionId] = useState("");
  const [role, setRole] = useState<"LEAD" | "PARTICIPANT" | "ENTRUSTED">("PARTICIPANT");
  const [grade, setGrade] = useState<NonNullable<ProjectMember["institutionGrade"]>>("일반");
  const [settlementType, setSettlementType] = useState<"위탁정산" | "자체정산">("위탁정산");
  // 연차별 사업비 — AnnualBudgetEditor와 동일한 구조로 처음부터 연차별 입력을 받는다.
  const [rows, setRows] = useState(() =>
    Array.from({ length: Math.max(1, totalTerms) }, (_, i) => {
      const termNumber = i + 1;
      return { termNumber, termYear: termNumberToYear(startDate, termNumber), cashBudget: 0, inKindBudget: 0 };
    })
  );
  const [error, setError] = useState("");

  const availableInstitutions = institutions.filter((i) => !existingInstitutionIds.has(i.id));

  function setRow(termNumber: number, patch: Partial<{ cashBudget: number; inKindBudget: number }>) {
    setRows((prev) => prev.map((r) => (r.termNumber === termNumber ? { ...r, ...patch } : r)));
  }

  function submit() {
    const inst = institutions.find((i) => i.id === institutionId);
    if (!inst) { setError("기관을 선택하세요."); return; }
    const annualBudgets = rows
      .filter((r) => r.cashBudget > 0 || r.inKindBudget > 0)
      .map((r) => ({ termYear: r.termYear, termNumber: r.termNumber, cashBudget: r.cashBudget, inKindBudget: r.inKindBudget }));
    const totalCashBudget = rows.reduce((s, r) => s + r.cashBudget, 0);
    const totalInKindBudget = rows.reduce((s, r) => s + r.inKindBudget, 0);
    addProjectMember({
      projectId,
      projectNumber,
      institutionId,
      institutionName: inst.name,
      institutionType: inst.type,
      role,
      budget: totalCashBudget + totalInKindBudget,
      feeRate: 0,
      calculatedFee: 0,
      institutionGrade: grade,
      settlementType,
      cashBudget: totalCashBudget,
      inKindBudget: totalInKindBudget,
      annualBudgets: annualBudgets.length > 0 ? annualBudgets : undefined,
    });
    onClose();
  }

  return (
    <div className="px-5 py-4 border-b border-slate-100 bg-blue-50/30 space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <InstitutionQuickAdd label="기관" value={institutionId} onChange={setInstitutionId} institutions={availableInstitutions} />
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">역할</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <button type="button" onClick={() => setRole("LEAD")}
              className={`flex-1 px-2 py-1.5 transition-colors ${role === "LEAD" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>주관</button>
            <button type="button" onClick={() => setRole("PARTICIPANT")}
              className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${role === "PARTICIPANT" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>공동</button>
            <button type="button" onClick={() => setRole("ENTRUSTED")}
              className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${role === "ENTRUSTED" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>위탁</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">등급</label>
          <select className={sel} value={grade} onChange={(e) => setGrade(e.target.value as NonNullable<ProjectMember["institutionGrade"]>)}>
            <option value="최우수(S)">최우수 (S)</option>
            <option value="우수(A)">우수 (A)</option>
            <option value="우수(B)">우수 (B)</option>
            <option value="우수(C)">우수 (C)</option>
            <option value="일반">일반</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">정산형태</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <button type="button" onClick={() => setSettlementType("위탁정산")}
              className={`flex-1 px-2 py-1.5 transition-colors ${settlementType === "위탁정산" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>위탁정산</button>
            <button type="button" onClick={() => setSettlementType("자체정산")}
              className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${settlementType === "자체정산" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>자체정산</button>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">연차별 사업비</label>
        <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300">
                <th className="text-left px-3 py-2 font-semibold text-slate-600">연차</th>
                <th className="text-left px-3 py-2 font-semibold text-slate-600">연도</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">현금사업비 (원)</th>
                <th className="text-right px-3 py-2 font-semibold text-slate-600">현물사업비 (원)</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {rows.map((r) => (
                <tr key={r.termNumber} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-slate-700 whitespace-nowrap">{r.termNumber}연차</td>
                  <td className="px-3 py-2 text-slate-500">{r.termYear}</td>
                  <td className="px-3 py-2">
                    <MoneyInput
                      value={r.cashBudget}
                      onChange={(v) => setRow(r.termNumber, { cashBudget: v })}
                      className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <MoneyInput
                      value={r.inKindBudget}
                      onChange={(v) => setRow(r.termNumber, { inKindBudget: v })}
                      className="w-full text-right bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          사업비가 입력된 연차만 참여로 등록되어 그 연차의 수수료가 자동 산정됩니다. 0원으로 둔 연차는
          참여하지 않은 것으로 저장됩니다 — 예를 들어 3연차부터만 채우면 1·2연차는 참여 안 함으로 처리됩니다.
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={submit} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">추가</button>
      </div>
    </div>
  );
}

// ─── 수수료(적용) 금액 직접 수정 셀 ───────────────────────────
// 자동산정된 값을 그대로 청구하기 어려운 협의 건이 있어, 담당자가 최종 청구액을 직접 조정할 수
// 있게 한다. 한번 직접 수정하면(manualOverride) "수수료 재계산"을 눌러도 이 값은 보존된다.
// ─── 적용액이 0원(미적용)인 이유 설명 ───────────────────────────
// "왜 0원이지?"에 답하기 위해, 실제 계산 로직(fee-calculator의 완전제외 조건)과 동일한 기준으로
// 이유를 되짚어본다. 정책상 제외가 아니면 사업비 미입력/직접수정 등 다른 이유를 순서대로 확인한다.
function zeroFeeReasons(f: TermFee, role: string | undefined, grade: string, policy: FeePolicy | null | undefined): string[] {
  const reasons: string[] = [];
  if (policy?.excludeLeadFromCalc === true && role === "LEAD") {
    reasons.push("주관기관은 이 전담기관 정책상 산정기준액에서 완전히 제외됩니다.");
  }
  if (policy && isExcludedMember(grade, f.institutionType, policy)) {
    reasons.push(`${GRADE_LABEL[grade] ?? grade} 등급 비영리기관은 이 전담기관 정책상 산정기준액에서 완전히 제외됩니다(면제등급 완전제외 정책).`);
  }
  if (reasons.length === 0 && f.manualOverride) {
    reasons.push("담당자가 금액을 0원으로 직접 수정했습니다.");
  }
  if (reasons.length === 0 && f.budget === 0) {
    reasons.push("이 연차에 입력된 사업비가 없어 수수료가 발생하지 않았습니다.");
  }
  if (reasons.length === 0) {
    reasons.push("사업비 대비 산정된 수수료가 0원입니다(최저금액 미만이거나 계산 결과가 0원).");
  }
  return reasons;
}

function AppliedFeeCell({ fee, canEdit, projectId, zeroReasons }: { fee: TermFee; canEdit: boolean; projectId: string; zeroReasons: string[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(fee.appliedFee);
  const [showReason, setShowReason] = useState(false);
  const [reasonPos, setReasonPos] = useState<{ top: number; left: number } | null>(null);
  const reasonBtnRef = useRef<HTMLButtonElement>(null);

  // 말풍선을 fixed로 body에 직접 그린다 — 표가 overflow-x-auto로 가로 스크롤되는 컨테이너 안에
  // 있어서, absolute로 표 안에 그리면 스크롤 영역 경계에서 잘려 보인다.
  function toggleReason() {
    if (!showReason && reasonBtnRef.current) {
      const rect = reasonBtnRef.current.getBoundingClientRect();
      const width = 256; // w-64
      setReasonPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
    }
    setShowReason((v) => !v);
  }

  function startEdit() {
    setDraft(fee.appliedFee);
    setEditing(true);
  }
  function save() {
    updateTermFee(fee.id, { appliedFee: draft, manualOverride: true });
    setEditing(false);
  }
  function revert() {
    updateTermFee(fee.id, { manualOverride: false });
    autoGenerateTermFees(projectId);
  }

  const canEditThis = canEdit && fee.status !== "BILLED";

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        <MoneyInput
          value={draft}
          onChange={setDraft}
          autoFocus
          className="w-28 text-right text-xs border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <button type="button" onClick={save} className="text-green-600 hover:text-green-700" title="저장">
          <FiCheck size={13} />
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600" title="취소">
          <FiX size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5 group">
      {fee.manualOverride && (
        <button type="button" onClick={revert} title="자동 재계산 값으로 되돌리기"
          className="text-[9px] text-purple-500 hover:text-purple-700 hover:underline whitespace-nowrap">
          직접수정됨 · 되돌리기
        </button>
      )}
      {fee.appliedFee === 0 ? (
        <>
          <button
            ref={reasonBtnRef}
            type="button"
            onClick={toggleReason}
            className="text-amber-500 font-normal underline decoration-dotted underline-offset-2 hover:text-amber-600"
          >
            미적용
          </button>
          {showReason && reasonPos && createPortal(
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowReason(false)} />
              <div
                className="fixed z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg px-3 py-2.5 text-left"
                style={{ top: reasonPos.top, left: reasonPos.left }}
              >
                <p className="text-[10px] font-semibold text-slate-400 tracking-wide mb-1 break-keep">왜 미적용(0원)인가요?</p>
                <ul className="text-[11px] text-slate-600 space-y-1 list-disc list-inside break-keep">
                  {zeroReasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            </>,
            document.body
          )}
        </>
      ) : (
        <span className="text-slate-800">{fmtWonFull(fee.appliedFee)}</span>
      )}
      {canEditThis && (
        <button type="button" onClick={startEdit} title="금액 직접 수정"
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity">
          <FiEdit2 size={11} />
        </button>
      )}
    </div>
  );
}

// ─── 연차 수수료 집계(공급가액/합계) 직접 수정 ───────────────────
// 개별 기관 행은 AppliedFeeCell로 조정하지만, 협의 금액을 부가세 포함/별도 기준으로 한 번에
// 맞추고 싶을 때가 있어 집계 박스에서도 공급가액·합계를 직접 조정할 수 있게 한다. 여러 기관이
// 걸친 연차는 조정분을 기존 적용액 비율대로 나눠 각 기관 행(TermFee.appliedFee)에 반영한다.
function FeeAggregateSummary({ group, canEdit, projectId }: { group: TermGroup; canEdit: boolean; projectId: string }) {
  const { auditLog } = useStore();
  const [editing, setEditing] = useState(false);
  const [supplyDraft, setSupplyDraft] = useState(0);
  const [reason, setReason] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const { supplyAmount: aggSupply, taxAmount: aggTax } = splitVatInclusive(group.totalApplied);
  const overriddenFee = group.fees.find((f) => f.manualOverride && f.manualOverrideReason);
  // 세금계산서가 이미 발행된(BILLED) 연차는 청구액을 여기서 더 건드릴 수 없다 — 발행 취소 후 수정.
  const canEditThis = canEdit && group.termStatus !== "BILLED";

  // 합계는 공급가액에서 파생되는 값이라(합계 = 공급가액 × 1.1) 공급가액만 입력받으면 충분하다 —
  // 둘 다 입력란으로 두면 어느 쪽이 기준인지 헷갈리고 서로 어긋난 값을 입력할 여지가 생긴다.
  const totalDraft = Math.round(supplyDraft * 1.1);

  // 수정이력 — TermFee.manualOverrideReason은 값을 덮어쓰므로 화면엔 최신 사유만 남지만, 실제 변경
  // 기록은 updateTermFee가 매번 감사로그(auditLog)에 남긴다. 그걸 모아 이 연차의 직접수정 이력으로 보여준다.
  // 저장 1회가 기관별 TermFee 여러 건을 동시에 갱신해 항목마다 로그가 따로 남으므로, 같은 저장에서
  // 나온 항목은 일시+사유로 묶어 하나의 이력 줄로 합친다.
  const feeIds = new Set(group.fees.map((f) => f.id));
  const overrideEntries = auditLog.filter(
    (e) => e.entityType === "termFee" && feeIds.has(e.entityId) && e.changedFields?.manualOverrideReason
  );
  const historySeen = new Set<string>();
  const overrideHistory = overrideEntries
    .filter((e) => {
      const reasonAfter = String(e.changedFields!.manualOverrideReason!.after ?? "");
      const dedupeKey = `${e.performedAt}|${reasonAfter}`;
      if (historySeen.has(dedupeKey)) return false;
      historySeen.add(dedupeKey);
      return true;
    })
    .sort((a, b) => b.performedAt.localeCompare(a.performedAt));

  function startEdit() {
    setSupplyDraft(aggSupply);
    setReason("");
    setEditing(true);
  }
  function changeSupply(v: number) {
    setSupplyDraft(v);
  }
  function save() {
    if (!reason.trim()) return;
    const fees = group.fees;
    const oldTotal = fees.reduce((s, f) => s + f.appliedFee, 0);
    let allocated = 0;
    fees.forEach((f, i) => {
      const isLast = i === fees.length - 1;
      const share = isLast
        ? totalDraft - allocated
        : Math.round(totalDraft * (oldTotal > 0 ? f.appliedFee / oldTotal : 1 / fees.length));
      if (!isLast) allocated += share;
      updateTermFee(f.id, { appliedFee: share, manualOverride: true, manualOverrideReason: reason.trim() });
    });
    setEditing(false);
  }
  function revert() {
    group.fees.forEach((f) => updateTermFee(f.id, { manualOverride: false, manualOverrideReason: undefined }));
    autoGenerateTermFees(projectId);
  }

  if (editing) {
    return (
      <div className="border-t border-slate-200 px-5 py-3 bg-blue-50/40 space-y-3">
        <div className="flex items-center justify-end gap-6">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 mb-1">공 급 가 액</p>
            <MoneyInput value={supplyDraft} onChange={changeSupply}
              className="w-36 text-right text-sm border border-blue-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
          </div>
          <div className="text-right">
            <p className="text-[10px] text-slate-400 mb-1">부 가 세</p>
            <p className="text-sm font-semibold text-slate-500 py-1.5">{fmtWonFull(totalDraft - supplyDraft)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold text-slate-500 mb-1 tracking-widest uppercase">합 계</p>
            <p className="text-sm font-bold text-slate-800 py-1.5">{fmtWonFull(totalDraft)}</p>
          </div>
        </div>
        <div>
          <label className="block text-[10px] text-slate-500 mb-1">수정 사유 (필수)</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
            placeholder="예: 협의에 따라 청구액을 일부 조정함"
            className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
          <button onClick={save} disabled={!reason.trim()}
            className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <FiCheck size={12} /> 저장
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50/60">
      <div className="px-5 py-3 flex items-center justify-end gap-10">
        {overriddenFee && (
          <div className="text-left mr-auto max-w-md">
            <div className="flex items-center gap-2">
              <button type="button" onClick={revert} className="text-[10px] text-purple-500 hover:text-purple-700 hover:underline">
                합계 직접수정됨 · 되돌리기
              </button>
              {overrideHistory.length > 1 && (
                <button type="button" onClick={() => setShowHistory((v) => !v)}
                  className="text-[10px] text-slate-400 hover:text-slate-600 hover:underline">
                  수정이력 {overrideHistory.length}건 {showHistory ? "숨기기" : "보기"}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">사유: {overriddenFee.manualOverrideReason}</p>
          </div>
        )}
        <div className="text-right">
          <p className="text-[10px] text-slate-400 mb-0.5">공 급 가 액</p>
          <p className="text-sm font-semibold text-slate-700">{fmtWonFull(aggSupply)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400 mb-0.5">부 가 세</p>
          <p className="text-sm font-semibold text-slate-700">{fmtWonFull(aggTax)}</p>
        </div>
        <div className="border-l border-slate-300 pl-10 text-right flex items-center gap-2">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 mb-0.5 tracking-widest uppercase">합  계</p>
            <p className="text-lg font-bold text-slate-900">{fmtWonFull(group.totalApplied)}</p>
          </div>
          {canEditThis && (
            <button type="button" onClick={startEdit} title="합계·공급가액 직접 수정"
              className="text-slate-400 hover:text-blue-600 transition-colors">
              <FiEdit2 size={13} />
            </button>
          )}
        </div>
      </div>
      {showHistory && overrideHistory.length > 0 && (
        <div className="px-5 pb-3">
          <ul className="border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white overflow-hidden">
            {overrideHistory.map((e) => (
              <li key={e.id} className="px-3 py-2 text-[11px] flex items-start gap-3">
                <span className="font-mono text-slate-400 whitespace-nowrap">{e.performedAt}</span>
                <span className="text-slate-500 whitespace-nowrap">{e.performedBy}</span>
                <span className="text-slate-600 flex-1">{String(e.changedFields!.manualOverrideReason!.after ?? "")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── 세금계산서 + 공문발송 + 수금 (BillingUnit 단위로 렌더링) ─────
function BillingBlock({
  unit, projectNumber, project, termYear, termNumber, termLabel, members,
  canEditInvoices, canEditReceivables, canEditEmails, emailDispatches,
}: {
  unit: BillingUnit;
  projectNumber: string;
  project: Project;
  termYear: number;
  termNumber: number;
  termLabel: string;
  members: ProjectMember[];
  canEditInvoices: boolean;
  canEditReceivables: boolean;
  canEditEmails: boolean;
  emailDispatches: EmailDispatch[];
}) {
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [invForm, setInvForm] = useState({
    issuedAt: new Date().toISOString().slice(0, 10),
    ...splitVatInclusive(unit.amount),
    totalAmount: unit.amount,
  });
  const [editingRv, setEditingRv] = useState(false);
  const [rvForm, setRvForm] = useState({
    paidAmount: unit.receivable?.paidAmount ?? 0,
  });

  // 발행구분 — 연차(TermFee)마다 다르게 발행될 수 있어 TermFee.billingType을 우선 쓰고, 이 연차에
  // 아직 값이 없으면 과제 단위 기본값(project.billingType, 엑셀 업로드 등으로 들어온 값)으로 대체한다.
  // RDA2처럼 연차를 기관별로 쪼개 발행하는 unit(institutionId 있음)은 이 화면에서는 표시하지 않는다
  // (cancelInvoice의 기존 가드와 동일한 이유 — 기관마다 따로 관리하려면 별도 UI가 더 필요함).
  const showBillingType = unit.institutionId === null;
  const billingType = unit.billingType ?? project.billingType ?? "정발행";
  const isNoBill = showBillingType && (billingType === "대상아님" || billingType === "면제");

  // 공문 수신자 — 분리단위(RDA2)면 그 기관, 아니면 주관기관의 참여기관 레코드에서 담당자 정보를 가져온다.
  // 연차별로 담당자가 바뀔 수 있어(recipientOverrides) 이 연차(termNumber) 기준으로 조회·저장한다.
  const recipientMember = members.find((m) => m.institutionId === unit.billingInstitutionId);
  const recipient = recipientMember ? resolveMemberRecipientForTerm(recipientMember, termNumber) : null;
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState({ recipientName: "", recipientEmail: "", recipientPhone: "" });

  function startEditRecipient() {
    if (!recipient) return;
    setRecipientDraft(recipient);
    setEditingRecipient(true);
  }

  function saveRecipient() {
    if (!recipientMember) return;
    const others = (recipientMember.recipientOverrides ?? []).filter((r) => r.termNumber !== termNumber);
    const isDefault =
      recipientDraft.recipientName === (recipientMember.contactName ?? "") &&
      recipientDraft.recipientEmail === (recipientMember.contactEmail ?? "") &&
      recipientDraft.recipientPhone === (recipientMember.contactPhone ?? "");
    const next = isDefault
      ? others
      : [...others, {
          termNumber,
          recipientName: recipientDraft.recipientName || undefined,
          recipientEmail: recipientDraft.recipientEmail || undefined,
          recipientPhone: recipientDraft.recipientPhone || undefined,
        }];
    updateProjectMember(recipientMember.id, { recipientOverrides: next.length > 0 ? next : undefined });
    setEditingRecipient(false);
  }

  function openInvoiceForm() {
    // 기존 발행 건을 "수정"하는 경우엔 그 값을 그대로 불러오고, 새로 발행하는 경우에만 기본값을 채운다.
    setInvForm(
      unit.invoice
        ? {
            issuedAt: unit.invoice.issuedAt || new Date().toISOString().slice(0, 10),
            supplyAmount: unit.invoice.supplyAmount,
            taxAmount: unit.invoice.taxAmount,
            totalAmount: unit.invoice.totalAmount,
          }
        : {
            issuedAt: new Date().toISOString().slice(0, 10),
            ...splitVatInclusive(unit.amount),
            totalAmount: unit.amount,
          }
    );
    setIssuingInvoice(true);
  }

  // 합계(=산정된 수수료)는 고정, 공급가액을 조정하면 부가세가 차액만큼 재계산된다
  function handleSupplyChange(v: number) {
    const tax = unit.amount - v;
    setInvForm((p) => ({ ...p, supplyAmount: v, taxAmount: tax, totalAmount: unit.amount }));
  }

  function saveInvoice() {
    // 이미 발행된 계산서가 있으면 새로 만들지 않고 그 레코드를 갱신한다 — 여기서 매번 addTaxInvoice로
    // 새 레코드를 만들면 같은 연차에 계산서가 여러 건 쌓이고, 다른 화면의 taxInvoices.find()는 가장
    // 먼저 생성된(오래된) 레코드를 집어오기 때문에 재발행해도 취소된 옛 건이 계속 보이는 문제가 있었다.
    if (unit.invoice) {
      updateTaxInvoice(unit.invoice.id, {
        issuedAt: invForm.issuedAt,
        supplyAmount: invForm.supplyAmount,
        taxAmount: invForm.taxAmount,
        totalAmount: invForm.totalAmount,
        status: "ISSUED",
      });
    } else {
      const now = new Date();
      addTaxInvoice({
        invoiceNumber: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`,
        projectNumber,
        projectName: project.projectName,
        termYear,
        termNumber,
        leadInstitutionId: unit.billingInstitutionId,
        leadInstitutionName: unit.billingLabel,
        institutionId: unit.institutionId ?? undefined,
        issuedAt: invForm.issuedAt,
        supplyAmount: invForm.supplyAmount,
        taxAmount: invForm.taxAmount,
        totalAmount: invForm.totalAmount,
        status: "ISSUED",
      });
    }
    // 실제로 청구서를 받는 기관만 청구완료(BILLED) 처리하고, 나머지(연차 통합 케이스에서 참여기관처럼
    // 개별 청구되지 않은 쪽)는 확정(CONFIRMED)까지만 반영한다.
    unit.billedFees.forEach((f) => { if (f.status !== "BILLED") updateTermFee(f.id, { status: "BILLED" }); });
    unit.confirmedFees.forEach((f) => { if (f.status === "DRAFT" || f.status === "SCHEDULED") updateTermFee(f.id, { status: "CONFIRMED" }); });
    setIssuingInvoice(false);
  }

  function cancelInvoice() {
    if (!unit.invoice) return;
    if (!window.confirm("세금계산서 발행을 취소할까요? 발행일이 삭제되고 상태가 '취소'로 변경됩니다.")) return;
    updateTaxInvoice(unit.invoice.id, { issuedAt: "", status: "CANCELED" });
    // billingType이 이 연차에 "정발행"으로 저장되어 있으면 취소 후에도 목록에서 계속 그 표시가
    // 남으므로 초기화한다. (기관별 개별 청구 단위는 이 화면에서 다루지 않으므로 건드리지 않는다.)
    if (unit.institutionId === null && unit.billingType === "정발행") {
      setTermBillingType(projectNumber, termYear, termNumber, undefined);
    }
  }

  function openRvForm() {
    setRvForm({ paidAmount: unit.receivable?.paidAmount ?? 0 });
    setEditingRv(true);
  }

  function saveReceivable() {
    const inv = unit.invoice;
    if (!inv) return;
    const remaining = Math.max(0, inv.totalAmount - rvForm.paidAmount);
    // 미입금 상태의 기본값은 "미수"(OVERDUE) — 만기일(청구일+3개월)이 지나기 전까진 isOverdueByRule이
    // 화면에 "미수"로만 보여주고, 만기일이 지나면 자동으로 "연체"로 승격된다.
    const status: Receivable["status"] = rvForm.paidAmount >= inv.totalAmount
      ? "PAID" : rvForm.paidAmount > 0 ? "PARTIAL" : "OVERDUE";
    const dueDate = addMonths(inv.issuedAt, 3);
    if (unit.receivable) {
      updateReceivable(unit.receivable.id, {
        paidAmount: rvForm.paidAmount,
        receivableAmount: remaining,
        dueDate: unit.receivable.dueDate || dueDate,
        status,
      });
    } else {
      addReceivable({
        invoiceNumber: inv.invoiceNumber,
        projectNumber,
        projectName: project.projectName,
        termYear,
        termNumber,
        leadInstitutionId: unit.billingInstitutionId,
        leadInstitutionName: unit.billingLabel,
        institutionId: unit.institutionId ?? undefined,
        billedAt: inv.issuedAt,
        billedAmount: inv.totalAmount,
        paidAmount: rvForm.paidAmount,
        receivableAmount: remaining,
        dueDate,
        status,
      });
    }
    setEditingRv(false);
  }

  // 공문 발송 — 기관별 개별 청구 단위는 그 기관 앞으로 간 발송 이력만(recipientEmail 기준) "마지막 발송"으로 잡는다.
  const sentEmails = emailDispatches.filter((e) =>
    e.subject.includes(projectNumber) && e.subject.includes(termLabel) &&
    (unit.institutionId ? unit.recipients.some((r) => !!r.email && r.email === e.recipientEmail) : true)
  );
  const lastSent = [...sentEmails].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];

  function sendLetter() {
    const batchId = `BATCH-${Date.now()}`;
    const sentAt = new Date().toISOString().replace("T", " ").slice(0, 16);
    unit.recipients.forEach((r) => {
      addEmailDispatch({
        batchId,
        sentAt,
        senderName: getCurrentUser()?.name ?? "시스템",
        recipientInstitution: r.institutionName,
        recipientEmail: r.email,
        subject: `[${projectNumber}] ${termLabel} 수수료 청구서${unit.institutionId ? ` (${unit.billingLabel})` : ""}`,
        emailType: "TAX_INVOICE",
        feeCategory: "ANNUAL",
        attachments: [`청구서_${projectNumber}_${termLabel}.pdf`],
        status: "SUCCESS",
      });
    });
  }

  return (
    <div className="border-t border-slate-100 px-5 py-4 space-y-4">
      {unit.institutionId && (
        <p className="text-xs font-semibold text-slate-500">{unit.billingLabel}</p>
      )}

      {/* 수신자 — 공문 발송 대상 담당자명·이메일·연락처. 연차별로 담당자가 다를 수 있어 이 연차에만
          적용되는 값으로 저장한다(연차별 오버라이드가 없으면 참여기관의 기본 담당자 정보를 그대로 보여준다). */}
      {recipientMember && recipient && (
        <div className="flex items-start gap-3">
          <span className="text-xs font-semibold text-slate-600 w-24 shrink-0 pt-1.5">수신자</span>
          {editingRecipient ? (
            <div className="flex-1 flex flex-wrap items-center gap-2">
              <input
                value={recipientDraft.recipientName}
                onChange={(e) => setRecipientDraft((p) => ({ ...p, recipientName: e.target.value }))}
                placeholder="담당자명"
                className="w-28 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={recipientDraft.recipientEmail}
                onChange={(e) => setRecipientDraft((p) => ({ ...p, recipientEmail: e.target.value }))}
                placeholder="email@example.com"
                className="w-48 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <input
                value={recipientDraft.recipientPhone}
                onChange={(e) => setRecipientDraft((p) => ({ ...p, recipientPhone: e.target.value }))}
                placeholder="수신자 연락처"
                className="w-32 text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <button onClick={() => setEditingRecipient(false)}
                className="px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveRecipient}
                className="px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
            </div>
          ) : (
            <div className="flex-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
              <span>{recipient.recipientName || "-"}</span>
              <span className="text-slate-300">·</span>
              <span>{recipient.recipientEmail || "-"}</span>
              <span className="text-slate-300">·</span>
              <span>{recipient.recipientPhone || "-"}</span>
              {canEditInvoices && (
                <button type="button" onClick={startEditRecipient} className="text-slate-400 hover:text-blue-600 transition-colors">
                  <FiEdit2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 발행구분 — 연차(TermFee) 단위로 저장되어 연차마다 다르게 설정할 수 있다 */}
      {showBillingType && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600 w-24 shrink-0">발행구분</span>
          <select
            value={billingType}
            disabled={!canEditInvoices}
            onChange={(e) => setTermBillingType(projectNumber, termYear, termNumber, e.target.value as TermFee["billingType"])}
            className={`text-xs font-medium border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed ${BILLING_TYPE_COLOR[billingType] ?? "bg-white text-slate-700"}`}
          >
            {BILLING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="text-[11px] text-slate-400">
            {BILLING_OPTIONS.find((o) => o.value === billingType)?.desc}
          </span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-600 w-24 shrink-0 pt-1">세금계산서</span>
        {unit.invoice ? (
          <div className="flex-1 flex flex-wrap items-center gap-3">
            <span className="font-mono text-xs text-slate-700">{unit.invoice.invoiceNumber}</span>
            <span className="text-xs text-slate-500">{fmtDate(unit.invoice.issuedAt)}</span>
            <span className="text-xs text-slate-500">공급가 {fmtWonFull(unit.invoice.supplyAmount)}</span>
            <span className="text-xs text-slate-500">부가세 {fmtWonFull(unit.invoice.taxAmount)}</span>
            <span className="text-sm font-bold text-slate-800">{fmtWonFull(unit.invoice.totalAmount)}</span>
            <StatusBadge label={INVOICE_STATUS[unit.invoice.status].label} color={INVOICE_STATUS[unit.invoice.status].color} />
            {/* 공문 발송 - 세금계산서와 동일 행 */}
            <div className="ml-auto flex items-center gap-2">
              {lastSent && (
                <span className="text-xs text-slate-400">마지막 발송 {lastSent.sentAt}</span>
              )}
              {canEditEmails && (
                <button onClick={sendLetter}
                  title={unit.recipients.length > 1 ? `${unit.recipients.length}곳으로 발송됩니다` : "발송됩니다"}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                  <FiSend size={12} /> 공문 발송{unit.recipients.length > 1 ? ` (${unit.recipients.length}곳)` : ""}
                </button>
              )}
              {canEditInvoices && (
                <button onClick={() => { openInvoiceForm(); setIssuingInvoice(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                  <FiEdit2 size={12} /> 수정
                </button>
              )}
              {canEditInvoices && unit.invoice.status !== "CANCELED" && (
                <button onClick={cancelInvoice}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
                  <FiX size={12} /> 발행 취소
                </button>
              )}
            </div>
          </div>
        ) : isNoBill ? (
          <span className="text-xs text-amber-600">
            {BILLING_OPTIONS.find((o) => o.value === billingType)?.label} — 세금계산서 발행이 필요하지 않습니다
          </span>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">발행 전</span>
            {canEditInvoices && !issuingInvoice && (
              <button onClick={openInvoiceForm}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <FiPlus size={12} /> 세금계산서 발행
              </button>
            )}
          </div>
        )}
      </div>

      {/* 세금계산서 발행 인라인 폼 */}
      {issuingInvoice && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/30 px-4 py-4 space-y-3">
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">세금계산서일자</label>
              <DateInput className="w-full" value={invForm.issuedAt}
                onChange={(v) => setInvForm((p) => ({ ...p, issuedAt: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">공급가액 (원)</label>
              <MoneyInput className={`${inp} w-full`} value={invForm.supplyAmount}
                onChange={(v) => handleSupplyChange(v)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">부가세 (자동)</label>
              <div className="text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-600">{fmtWonFull(invForm.taxAmount)}</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">합계</label>
              <div className="text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-slate-50 font-bold text-slate-700">{fmtWonFull(invForm.totalAmount)}</div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">발행 후 <strong>공문 발송</strong> 버튼으로 즉시 발송할 수 있습니다</p>
            <div className="flex gap-2">
              <button onClick={() => setIssuingInvoice(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveInvoice}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
                <FiCheck size={12} /> 저장 &amp; 발행
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 수금 정보 ── */}
      <div className="flex items-start gap-3">
        <span className="text-xs font-semibold text-slate-600 w-24 shrink-0 pt-1">수금 정보</span>
        {unit.receivable ? (
          <div className="flex-1 flex flex-wrap items-center gap-4">
            <span className="text-xs text-slate-500">청구 {fmtWonFull(unit.receivable.billedAmount)}</span>
            <span className="text-xs text-green-700 font-medium">납부 {fmtWonFull(unit.receivable.paidAmount)}</span>
            <span className={`text-sm font-bold ${unit.receivable.receivableAmount > 0 ? "text-red-600" : "text-slate-400"}`}>
              미수금 {fmtWonFull(unit.receivable.receivableAmount)}
            </span>
            <StatusBadge label={RECEIVABLE_STATUS[unit.receivable.status].label} color={RECEIVABLE_STATUS[unit.receivable.status].color} />
            {canEditReceivables && (
              <button onClick={openRvForm}
                className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <FiEdit2 size={12} /> 수금 입력
              </button>
            )}
          </div>
        ) : unit.invoice ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">수금 내역 없음</span>
            {canEditReceivables && (
              <button onClick={openRvForm}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
                <FiPlus size={12} /> 수금 등록
              </button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-300 italic">세금계산서 발행 후 등록 가능</span>
        )}
      </div>

      {/* 수금 인라인 폼 */}
      {editingRv && (
        <div className="rounded-xl border border-green-200 bg-green-50/30 px-4 py-4">
          <div className="flex items-end gap-4">
            <div className="w-52">
              <label className="block text-xs font-medium text-slate-600 mb-1">입금액 (원)</label>
              <MoneyInput className={`${inp} w-full`} value={rvForm.paidAmount}
                autoFocus
                onChange={(v) => setRvForm({ paidAmount: v })} />
            </div>
            <div className="pb-0.5">
              <p className="text-xs text-slate-400 mb-1">미수금 (자동)</p>
              <p className={`text-sm font-bold ${Math.max(0, (unit.invoice?.totalAmount ?? 0) - rvForm.paidAmount) > 0 ? "text-red-600" : "text-slate-400"}`}>
                {fmtWonFull(Math.max(0, (unit.invoice?.totalAmount ?? 0) - rvForm.paidAmount))}
              </p>
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => setEditingRv(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveReceivable}
                className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors">
                <FiCheck size={12} /> 저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Term section (per-연차 card in Tab 2) ───────────────────
function TermSection({ group, allFees, project, projectNumber, agencyId, leadInstitutionId, leadInstitutionName, members, isSettlement, taxInvoices, receivables }: {
  group: TermGroup;
  allFees: TermFee[];
  project: Project;
  projectNumber: string;
  agencyId: string;
  leadInstitutionId: string;
  leadInstitutionName: string;
  members: ProjectMember[];
  isSettlement: boolean;
  taxInvoices: TaxInvoice[];
  receivables: Receivable[];
}) {
  const canEditInvoices = useCanWrite('tax-invoices');
  const canEditReceivables = useCanWrite('receivables');
  const canEditEmails = useCanWrite('emails');
  const canEditUnclaimed = useCanWrite('unclaimed');
  const canEditFees = useCanWrite('fees');
  const canManageOtherFirm = useCanWrite('fees-other-firm');
  const { institutions, emailDispatches, fundingAgencies, feePolicies } = useStore();
  const policy = resolvePolicy(project.agencyId, feePolicies, project.programType ?? "GENERAL");
  // 이 연차를 타회계법인이 진행했는지 여부 — 연차 내 기관별 행 전체에 동일하게 반영되므로 첫 행 값을 대표로 사용
  const otherFirmHandled = group.fees[0]?.otherFirmHandled ?? false;
  function toggleOtherFirmHandled(checked: boolean) {
    setTermOtherFirmHandled(projectNumber, group.termYear, group.termNumber, checked);
  }
  const leadInst = institutions.find((i) => i.id === leadInstitutionId);
  // 전담기관 설정에 따라 공문을 주관기관만 받을지, 참여기관까지 다 받을지 결정
  const sendToAllInstitutions = fundingAgencies.find((a) => a.id === agencyId)?.noticeRecipientScope === "LEAD_AND_PARTICIPANTS";

  const [expanded, setExpanded] = useState(false);
  const [showFeeDetail, setShowFeeDetail] = useState(false);

  // 연차 기간 직접 지정 — 값이 있으면(TermFee.termStartDate/termEndDate) 자동계산(resolveTermDateRange)
  // 대신 이 값을 쓴다. 기관마다 1행씩인 TermFee 전체에 동일하게 반영해야 하므로 setTermDates로 일괄 저장한다.
  const manualTermStart = group.fees.find((f) => f.termStartDate)?.termStartDate;
  const manualTermEnd = group.fees.find((f) => f.termEndDate)?.termEndDate;
  const autoTermRange = resolveTermDateRange(project, group.termNumber);
  const effectiveTermStart = manualTermStart ?? autoTermRange.start;
  const effectiveTermEnd = manualTermEnd ?? autoTermRange.end;
  const termStage = project.stages?.find((s) => group.termNumber >= s.startTermNumber && group.termNumber <= s.endTermNumber);
  const termDateMismatch = !!(
    manualTermStart && manualTermEnd && termStage?.stageStartDate && termStage.stageEndDate &&
    (manualTermStart < termStage.stageStartDate || manualTermEnd > termStage.stageEndDate)
  );
  const [editingTermDates, setEditingTermDates] = useState(false);
  const [draftTermStart, setDraftTermStart] = useState(effectiveTermStart);
  const [draftTermEnd, setDraftTermEnd] = useState(effectiveTermEnd);
  function startEditTermDates() {
    setDraftTermStart(effectiveTermStart);
    setDraftTermEnd(effectiveTermEnd);
    setEditingTermDates(true);
  }
  function saveTermDates() {
    setTermDates(projectNumber, group.termYear, group.termNumber, draftTermStart || null, draftTermEnd || null);
    setEditingTermDates(false);
  }
  function resetTermDates() {
    setTermDates(projectNumber, group.termYear, group.termNumber, null, null);
    setEditingTermDates(false);
  }

  // 이 연차까지(포함) 그 기관 자신의 미청구수수료 누적 — 연차별 세부표의 "미청구수수료 누적" 열에 사용.
  // 일반기관은 정산 연차에 그동안 미뤄온 몫을 전액 청구·회수하므로(그 정산 연차 자신의 unclaimedFee가 0),
  // 그 시점에 누적을 0으로 리셋한다. 반면 자체정산을 유지하는 면제기관은 정산 연차에도 15%를 못 걷고
  // 매몰비용으로 남으므로(그 정산 연차의 unclaimedFee가 0이 아님) 리셋하지 않고 계속 누적한다.
  function getCumulativeUnclaimed(institutionId: string): number {
    const feesForInst = allFees
      .filter((af) => af.projectNumber === projectNumber && af.institutionId === institutionId && af.termNumber <= group.termNumber)
      .sort((a, b) => a.termNumber - b.termNumber);
    let running = 0;
    for (const af of feesForInst) {
      const u = af.unclaimedFee ?? 0;
      const resolvedAtSettlement = isSettlementTerm(project, af.termNumber) && u === 0;
      running = resolvedAtSettlement ? 0 : running + u;
    }
    return running;
  }
  const termLabel = `${group.termYear}년 ${group.termNumber}연차`;

  // RDA2는 참여기관마다 세금계산서/공문발송/수금을 따로 관리해야 하므로, 연차 전체를 하나로
  // 묶는 대신 실제 수수료가 발생하는(appliedFee > 0) 기관마다 별도의 BillingUnit을 만든다.
  // 그 외 전담기관은 지금까지와 동일하게 연차 전체를 통합 1건으로 처리한다.
  const isRda2 = project.agencyId === "fa-006";
  const feeRef = (f: TermFee) => ({ id: f.id, status: f.status });

  const billingUnits: BillingUnit[] = isRda2
    ? group.fees.filter((f) => f.appliedFee > 0).map((f) => ({
        key: `${group.key}|${f.institutionId}`,
        institutionId: f.institutionId,
        billingInstitutionId: f.institutionId,
        billingLabel: f.institutionName,
        recipients: [{
          institutionName: f.institutionName,
          email: institutions.find((i) => i.id === f.institutionId)?.contactEmail ?? "",
        }],
        amount: f.appliedFee,
        billedFees: [feeRef(f)],
        confirmedFees: [],
        billingType: f.billingType,
        invoice: taxInvoices.find((t) =>
          t.projectNumber === projectNumber && t.termYear === group.termYear && t.termNumber === group.termNumber && t.institutionId === f.institutionId
        ) ?? null,
        receivable: receivables.find((r) =>
          r.projectNumber === projectNumber && r.termYear === group.termYear && r.termNumber === group.termNumber && r.institutionId === f.institutionId
        ) ?? null,
      }))
    : [{
        key: `${group.key}|combined`,
        institutionId: null,
        billingInstitutionId: leadInstitutionId,
        billingLabel: leadInstitutionName,
        // 주관기관만 발송 대상인 전담기관은 주관기관 앞으로만 공문을 보내고, 아니면 참여기관까지 전부 보낸다.
        recipients: sendToAllInstitutions
          ? group.fees.map((f) => ({
              institutionName: f.institutionName,
              email: institutions.find((i) => i.id === f.institutionId)?.contactEmail ?? "",
            }))
          : [{ institutionName: leadInstitutionName, email: leadInst?.contactEmail ?? "" }],
        amount: group.totalApplied,
        // 실제로 청구서를 받는 기관(주관, 혹은 전체)만 BILLED, 나머지는 CONFIRMED까지만.
        billedFees: (sendToAllInstitutions ? group.fees : group.fees.filter((f) => f.institutionId === leadInstitutionId)).map(feeRef),
        confirmedFees: (sendToAllInstitutions ? [] : group.fees.filter((f) => f.institutionId !== leadInstitutionId)).map(feeRef),
        billingType: group.fees[0]?.billingType,
        invoice: group.invoice,
        receivable: group.receivable,
      }];

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* Term header row */}
      <div
        className="px-5 py-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <button className="p-1 text-slate-400 hover:text-slate-600 shrink-0">
          {expanded ? <FiChevronUp size={15} /> : <FiChevronDown size={15} />}
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{termLabel}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
              isSettlement ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
            }`}>
              {isSettlement ? "정산" : "연차상시"}
            </span>
            <StatusBadge label={FEE_STATUS[group.termStatus].label} color={FEE_STATUS[group.termStatus].color} />
            {otherFirmHandled && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">
                타회계법인 진행
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{group.fees.length}개 기관</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            {editingTermDates ? (
              <>
                <DateInput value={draftTermStart} onChange={setDraftTermStart} className="w-32 text-xs" />
                <span className="text-slate-300 text-xs">~</span>
                <DateInput value={draftTermEnd} onChange={setDraftTermEnd} className="w-32 text-xs" />
                <button onClick={saveTermDates} className="text-green-600 hover:text-green-700" title="저장">
                  <FiCheck size={12} />
                </button>
                <button onClick={() => setEditingTermDates(false)} className="text-slate-400 hover:text-slate-600" title="취소">
                  <FiX size={12} />
                </button>
                {manualTermStart && (
                  <button onClick={resetTermDates} className="text-[10px] text-purple-500 hover:text-purple-700 hover:underline ml-1">
                    자동계산으로 되돌리기
                  </button>
                )}
              </>
            ) : (
              <>
                <span className={`text-[11px] ${manualTermStart ? "text-slate-600 font-medium" : "text-slate-400"}`}>
                  연차기간 {fmtDate(effectiveTermStart)} ~ {fmtDate(effectiveTermEnd)}
                  {manualTermStart && <span className="ml-1 text-purple-500">(직접지정)</span>}
                </span>
                {termDateMismatch && (
                  <span
                    className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700"
                    title="이 연차에 직접 지정한 날짜가 소속 단계 기간 밖으로 벗어났습니다 — 단계 날짜 변경 후 확인이 필요합니다"
                  >
                    ⚠ 단계 기간 밖
                  </span>
                )}
                {canEditFees && (
                  <button onClick={startEditTermDates} className="text-slate-300 hover:text-blue-600 transition-colors" title="연차 기간 직접 지정">
                    <FiEdit2 size={11} />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        <label
          className={`flex items-center gap-1.5 text-xs shrink-0 ${canManageOtherFirm ? "cursor-pointer text-slate-600" : "text-slate-300 cursor-not-allowed"}`}
          onClick={(e) => e.stopPropagation()}
          title={canManageOtherFirm ? undefined : "시스템관리자·회계담당자만 설정할 수 있습니다"}
        >
          <input
            type="checkbox"
            checked={otherFirmHandled}
            disabled={!canManageOtherFirm}
            onChange={(e) => toggleOtherFirmHandled(e.target.checked)}
            className="rounded border-slate-300 text-orange-600 focus:ring-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          타회계법인 진행
        </label>
        <div className="flex items-center gap-6 text-xs text-slate-500 mr-2">
          {otherFirmHandled ? (
            <>
              <span className="text-orange-600 font-medium">85% 금액 비공개(타회계법인 진행)</span>
              {/* 85%(당해 청구액)는 타회계법인 몫이라 숨기지만, 이후 정산 연차에 삼화가 걷어야 할
                  15% 미청구 몫은 계속 추적해야 하므로 그대로 노출한다. */}
              {!isSettlement && (() => {
                const termUnclaimed = group.fees.reduce((s, f) => s + (f.unclaimedFee ?? 0), 0);
                return termUnclaimed > 0 ? (
                  <span className="text-amber-600 font-semibold">당해 미청구액(15%) <strong className="ml-1">{fmtWonFull(termUnclaimed)}</strong></span>
                ) : null;
              })()}
            </>
          ) : (
            <>
              <span>산정 <strong className="text-slate-700 ml-1">{fmtWonFull(group.totalCalculated)}</strong></span>
              <span>당해 청구액 <strong className="text-slate-700 ml-1">{fmtWonFull(group.totalApplied)}</strong></span>
              {/* 연차상시만 해당 — 85% 청구 후 이번 연차에 걷지 않고 남겨두는 15% 몫. 발행 대상은 아니고
                  정산 연차에 함께 걷힐 금액을 미리 확인만 할 수 있게 표시한다. */}
              {!isSettlement && (() => {
                const termUnclaimed = group.fees.reduce((s, f) => s + (f.unclaimedFee ?? 0), 0);
                return termUnclaimed > 0 ? (
                  <span className="text-amber-600 font-semibold">당해 미청구액 <strong className="ml-1">{fmtWonFull(termUnclaimed)}</strong></span>
                ) : null;
              })()}
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          {otherFirmHandled && (
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-lg border border-orange-200 bg-orange-50/60 px-4 py-3 text-xs text-orange-700 leading-relaxed">
                이 연차({termLabel})는 <strong>타회계법인</strong>에서 진행하여 실제 수수료(85%)의 산정·청구·수금 금액은 본 시스템에 표시되지 않습니다.
                다만 정산 연차에 삼화가 걷어야 할 <strong>미청구수수료(15%)</strong>는 계속 추적할 수 있도록 아래에 표시합니다.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                      <th className="text-left px-4 py-2.5">기관명</th>
                      <th className="text-center px-4 py-2.5">역할</th>
                      <th className="text-center px-4 py-2.5">구분</th>
                      <th className="text-right px-4 py-2.5">사업비</th>
                      <th className="text-right px-4 py-2.5">미청구수수료(15%)</th>
                      <th className="text-right px-4 py-2.5">미청구수수료 누적</th>
                      <th className="text-center px-4 py-2.5">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.fees.map((f) => {
                      const gradeMember = members.find((m) => m.institutionId === f.institutionId);
                      const rawGrade = gradeMember ? resolveMemberGradeForTerm(gradeMember, f.termNumber) : "일반";
                      const grade = normalizeGrade(rawGrade);
                      const cumulativeUnclaimed = getCumulativeUnclaimed(f.institutionId);
                      return (
                        <tr key={f.id} className="border-b border-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{f.institutionName}</td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <StatusBadge
                              label={ROLE_LABEL[gradeMember?.role ?? "PARTICIPANT"]}
                              color={gradeMember?.role === "LEAD" ? "blue" : gradeMember?.role === "ENTRUSTED" ? "amber" : "slate"}
                            />
                          </td>
                          <td className="px-4 py-2.5 text-center whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${GRADE_COLOR[grade] ?? GRADE_COLOR["일반"]}`}>
                              {GRADE_LABEL[grade] ?? grade}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtWonFull(f.budget)}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            {(f.unclaimedFee ?? 0) === 0
                              ? <span className="text-slate-300">-</span>
                              : <span className="text-amber-600 font-medium">{fmtWonFull(f.unclaimedFee ?? 0)}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            {cumulativeUnclaimed === 0
                              ? <span className="text-slate-300">-</span>
                              : <span className="text-amber-700 font-medium">{fmtWonFull(cumulativeUnclaimed)}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-center text-orange-600">타회계법인 진행</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-100">
                      <td colSpan={2} className="px-4 py-2 text-right text-xs text-slate-400">합계</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                        {fmtWonFull(group.fees.reduce((s, f) => s + f.budget, 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-amber-600 font-medium">
                        {fmtWonFull(group.fees.reduce((s, f) => s + (f.unclaimedFee ?? 0), 0))}
                      </td>
                      <td className="px-4 py-2 text-right text-xs text-amber-700 font-medium">
                        {fmtWonFull(group.fees.reduce((s, f) => s + getCumulativeUnclaimed(f.institutionId), 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
          {!otherFirmHandled && (<>
          <div className="px-4 pt-2.5 flex justify-end">
            <button onClick={() => setShowFeeDetail((v) => !v)}
              className="text-[11px] text-slate-500 hover:text-blue-600 transition-colors">
              {showFeeDetail ? "표준·미청구 숨기기 ▲" : "표준·미청구 수수료 표시 ▼"}
            </button>
          </div>
          {/* Institution fee table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <th className="text-left px-4 py-2.5">기관명</th>
                  <th className="text-center px-4 py-2.5">역할</th>
                  <th className="text-center px-4 py-2.5">구분</th>
                  <th className="text-right px-4 py-2.5">사업비</th>
                  <th className="text-center px-4 py-2.5">요율</th>
                  {showFeeDetail && <th className="text-right px-4 py-2.5">표준수수료</th>}
                  <th className="text-right px-4 py-2.5">표준액(산정)</th>
                  <th className="text-right px-4 py-2.5">조정액</th>
                  <th className="text-right px-4 py-2.5">수수료(적용)</th>
                  {showFeeDetail && <th className="text-right px-4 py-2.5">미청구수수료</th>}
                  {showFeeDetail && <th className="text-right px-4 py-2.5">미청구수수료 누적</th>}
                  <th className="text-center px-4 py-2.5">상태</th>
                </tr>
              </thead>
              <tbody>
                {group.fees.map((f) => {
                  const adj = f.appliedFee === 0 ? 0 : f.appliedFee - f.calculatedFee;
                  const gradeMember = members.find((m) => m.institutionId === f.institutionId);
                  const rawGrade = gradeMember ? resolveMemberGradeForTerm(gradeMember, f.termNumber) : "일반";
                  const grade = normalizeGrade(rawGrade);
                  const cumulativeUnclaimed = getCumulativeUnclaimed(f.institutionId);
                  return (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{f.institutionName}</td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <StatusBadge
                          label={ROLE_LABEL[gradeMember?.role ?? "PARTICIPANT"]}
                          color={gradeMember?.role === "LEAD" ? "blue" : gradeMember?.role === "ENTRUSTED" ? "amber" : "slate"}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center whitespace-nowrap">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${GRADE_COLOR[grade] ?? GRADE_COLOR["일반"]}`}>
                          {GRADE_LABEL[grade] ?? grade}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtWonFull(f.budget)}</td>
                      <td className="px-4 py-2.5 text-center text-blue-700 font-medium">{f.feeRate}%</td>
                      {showFeeDetail && (
                        <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{fmtWonFull(f.standardFee ?? f.calculatedFee)}</td>
                      )}
                      <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmtWonFull(f.calculatedFee)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {adj === 0
                          ? <span className="text-slate-300">-</span>
                          : <span className={adj > 0 ? "text-blue-600 font-medium" : "text-red-500 font-medium"}>
                              {adj > 0 ? "+" : ""}{fmtWonFull(adj)}
                            </span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                        <AppliedFeeCell
                          fee={f}
                          canEdit={canEditFees}
                          projectId={project.id}
                          zeroReasons={f.appliedFee === 0 ? zeroFeeReasons(f, gradeMember?.role, grade, policy) : []}
                        />
                      </td>
                      {showFeeDetail && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {(f.unclaimedFee ?? 0) === 0
                            ? <span className="text-slate-300">-</span>
                            : <span className="text-amber-600 font-medium">{fmtWonFull(f.unclaimedFee ?? 0)}</span>}
                        </td>
                      )}
                      {showFeeDetail && (
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          {cumulativeUnclaimed === 0
                            ? <span className="text-slate-300">-</span>
                            : <span className="text-amber-700 font-medium">{fmtWonFull(cumulativeUnclaimed)}</span>}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge label={FEE_STATUS[f.status].label} color={FEE_STATUS[f.status].color} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 border-t border-slate-100">
                  <td colSpan={3} className="px-4 py-2 text-right text-xs text-slate-400">합계</td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-slate-600 whitespace-nowrap">
                    {fmtWonFull(group.fees.reduce((s, f) => s + f.budget, 0))}
                  </td>
                  <td />
                  {showFeeDetail && (
                    <td className="px-4 py-2 text-right text-xs text-slate-500">
                      {fmtWonFull(group.fees.reduce((s, f) => s + (f.standardFee ?? f.calculatedFee), 0))}
                    </td>
                  )}
                  <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700">{fmtWonFull(group.totalCalculated)}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {(() => {
                      const adj = group.totalApplied - group.totalCalculated;
                      if (adj === 0) return <span className="text-slate-300">-</span>;
                      return <span className={adj > 0 ? "text-blue-600 font-medium" : "text-red-500 font-medium"}>
                        {adj > 0 ? "+" : ""}{fmtWonFull(adj)}
                      </span>;
                    })()}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-bold text-slate-800">{fmtWonFull(group.totalApplied)}</td>
                  {showFeeDetail && (
                    <td className="px-4 py-2 text-right text-xs text-amber-600 font-medium">
                      {fmtWonFull(group.fees.reduce((s, f) => s + (f.unclaimedFee ?? 0), 0))}
                    </td>
                  )}
                  {showFeeDetail && (
                    <td className="px-4 py-2 text-right text-xs text-amber-700 font-medium">
                      {fmtWonFull(group.fees.reduce((s, f) => s + getCumulativeUnclaimed(f.institutionId), 0))}
                    </td>
                  )}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 수수료 집계: 공급가액 / 부가세 / 합계 — 산정된 수수료는 부가세 포함 금액이므로 분리해서 표시.
              필요 시 합계·공급가액을 직접 조정할 수 있고, 그때는 사유 입력이 필수다. */}
          {group.totalApplied > 0 && (
            <FeeAggregateSummary group={group} canEdit={canEditFees} projectId={project.id} />
          )}

          {/* ── 세금계산서 + 공문발송 + 수금 (RDA2는 기관별로 여러 블록, 그 외엔 통합 1블록) ── */}
          {billingUnits.map((unit) => (
            <BillingBlock
              key={unit.key}
              unit={unit}
              projectNumber={projectNumber}
              project={project}
              termYear={group.termYear}
              termNumber={group.termNumber}
              termLabel={termLabel}
              members={members}
              canEditInvoices={canEditInvoices}
              canEditReceivables={canEditReceivables}
              canEditEmails={canEditEmails}
              emailDispatches={emailDispatches}
            />
          ))}

          {/* ── 미청구액 ── */}
          {group.unclaimed && (
            <div className="border-t border-amber-100 bg-amber-50/30 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-amber-800">미청구액</span>
                <span className="text-sm font-bold text-amber-600">{fmtWonFull(group.unclaimed.amount)}</span>
                <span className="text-xs text-amber-600">발생 {fmtDate(group.unclaimed.occurredAt)}</span>
                <StatusBadge label={UNCLAIMED_STATUS[group.unclaimed.status].label} color={UNCLAIMED_STATUS[group.unclaimed.status].color} />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <label className="text-slate-500 flex items-center gap-1">
                  <input type="checkbox" checked={group.unclaimed.carriedOver}
                    disabled={!canEditUnclaimed}
                    onChange={(e) => updateUnclaimedFee(group.unclaimed!.id, { carriedOver: e.target.checked })}
                    className="rounded disabled:opacity-50 disabled:cursor-not-allowed" />
                  이월처리
                </label>
                <select value={group.unclaimed.status}
                  disabled={!canEditUnclaimed}
                  onChange={(e) => updateUnclaimedFee(group.unclaimed!.id, { status: e.target.value as UnclaimedFee["status"] })}
                  className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value="PENDING">대기중</option>
                  <option value="CARRIED_OVER">이월됨</option>
                  <option value="RESOLVED">해소됨</option>
                </select>
              </div>
            </div>
          )}
          </>)}
        </div>
      )}
    </div>
  );
}

// ─── Tab 2: 수수료 관리 ──────────────────────────────────────
function FeeManagementTab({ projectId }: { projectId: string }) {
  const { projects, termFees, taxInvoices, receivables, unclaimedFees, projectMembers } = useStore();
  const canRecalc = useCanWrite('fees');
  const [recalculated, setRecalculated] = useState(false);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const members = projectMembers.filter((m) => m.projectId === projectId);

  // 참여기관 추가/사업비 수정 시엔 이미 자동 재계산되지만, 시딩된 데이터처럼 그 경로를 거치지
  // 않은 과제는 탭을 열 때 한 번 맞춰줘야 누락된 연차가 버튼 없이도 바로 보인다.
  useEffect(() => {
    if (!projectId || !canRecalc) return;
    autoGenerateTermFees(projectId);
  }, [projectId, canRecalc]);

  function recalc() {
    autoGenerateTermFees(projectId);
    setRecalculated(true);
    setTimeout(() => setRecalculated(false), 2000);
  }

  // useMemo must be called before any conditional return
  const termGroups = useMemo<TermGroup[]>(() => {
    if (!project) return [];
    const projectNumber = project.projectNumber;
    const myFees = termFees.filter((f) => f.projectNumber === projectNumber);
    const grouped = new Map<string, TermFee[]>();
    myFees.forEach((f) => {
      const k = `${f.termYear}|${f.termNumber}`;
      if (!grouped.has(k)) grouped.set(k, []);
      grouped.get(k)!.push(f);
    });
    return Array.from(grouped.entries()).map(([key, fees]) => {
      const [y, n] = key.split("|").map(Number);
      const totalApplied = fees.reduce((s, f) => s + f.appliedFee, 0);
      const totalCalculated = fees.reduce((s, f) => s + f.calculatedFee, 0);
      const termStatus: TermFee["status"] = fees.some((f) => f.status === "DRAFT")
        ? "DRAFT" : fees.every((f) => f.status === "BILLED") ? "BILLED" : "CONFIRMED";
      const invoice = taxInvoices.find(
        (t) => t.projectNumber === projectNumber && t.termYear === y && t.termNumber === n
      ) ?? null;
      const receivable = receivables.find(
        (r) => r.projectNumber === projectNumber && r.termYear === y && r.termNumber === n
      ) ?? null;
      const unclaimed = unclaimedFees.find(
        (u) => u.projectNumber === projectNumber && u.termYear === y && u.termNumber === n
      ) ?? null;
      return { key, termYear: y, termNumber: n, fees, totalApplied, totalCalculated, invoice, receivable, unclaimed, termStatus };
    }).sort((a, b) => b.termYear !== a.termYear ? b.termYear - a.termYear : b.termNumber - a.termNumber);
  }, [project, termFees, taxInvoices, receivables, unclaimedFees]);

  if (!project) return null;

  const recalcButton = canRecalc && (
    <div className="flex items-center justify-end gap-2">
      {recalculated && <span className="text-xs text-green-600 font-medium">재계산 완료</span>}
      <button onClick={recalc}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
        <FiEdit2 size={12} /> 수수료 재계산
      </button>
    </div>
  );

  if (termGroups.length === 0) {
    return (
      <div className="space-y-3">
        {recalcButton}
        <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
          <p className="text-sm text-slate-400">연차별 수수료 내역이 없습니다</p>
          <p className="text-xs text-slate-300 mt-1">수수료 관리 메뉴에서 연차 수수료를 먼저 생성해 주세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recalcButton}
      {termGroups.map((group) => (
        <TermSection
          key={group.key}
          group={group}
          allFees={termFees}
          project={project}
          projectNumber={project.projectNumber}
          agencyId={project.agencyId}
          leadInstitutionId={project.leadInstitutionId}
          leadInstitutionName={project.leadInstitutionName}
          members={members}
          isSettlement={isSettlementTerm(project, group.termNumber)}
          taxInvoices={taxInvoices}
          receivables={receivables}
        />
      ))}
    </div>
  );
}

// ─── 정산절차 안내 공문 발송 모달 ───────────────────────────
function SettlementNoticeModal({
  project,
  agencyLabel,
  templates,
  statusRows,
  feeRows,
  recipientEmail,
  docNumber,
  issuedDate,
  senderUser,
  onClose,
}: {
  project: Project;
  agencyLabel: string;
  templates: AgencyNoticeTemplateEntry[];
  statusRows: NoticeStatusRow[];
  feeRows: NoticeStatusRow[];
  recipientEmail: string;
  docNumber: string;
  issuedDate: string;
  senderUser: SystemUser | null;
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [toEmail, setToEmail] = useState(recipientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? templates[0];
  const template = selectedTemplate?.content ?? EMPTY_NOTICE_TEMPLATE;

  const canSendMail = !!senderUser?.hiworksEmail && !!senderUser?.hiworksMailPassword;

  async function send() {
    if (!senderUser?.hiworksEmail || !senderUser?.hiworksMailPassword) {
      setSendError("발신 계정(하이웍스)이 등록되어 있지 않습니다. 관리자 > 사용자 관리에서 먼저 등록해주세요.");
      return;
    }
    setSending(true);
    setSendError("");
    const subject = `[${project.projectNumber}] ${template.title || "정산절차 안내 및 수수료 청구"}`;
    const html = buildNoticeEmailHtml({ template, statusRows, feeRows, docNumber, issuedDate });

    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    try {
      const res = await fetch("/api/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: senderUser.hiworksEmail,
          senderPassword: senderUser.hiworksMailPassword,
          senderName: senderUser.name,
          to: [toEmail],
          subject,
          html,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        status = "FAILED";
        setSendError(json.error || "메일 발송에 실패했습니다.");
      }
    } catch {
      status = "FAILED";
      setSendError("메일 발송 중 네트워크 오류가 발생했습니다.");
    }

    addEmailDispatch({
      batchId: `BATCH-${Date.now()}`,
      sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      senderName: senderUser.name,
      recipientInstitution: project.leadInstitutionName,
      recipientEmail: toEmail,
      subject,
      emailType: "SETTLEMENT_NOTICE",
      attachments: template.attachments.map((a) => a.name),
      status,
      noticeSnapshot: { template, statusRows, feeRows, docNumber, issuedDate },
    });
    setSending(false);
    if (status === "SUCCESS") setSent(true);
  }

  if (sent) {
    return (
      <div className="p-6 flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <FiSend size={22} className="text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">발송 완료</p>
          <p className="text-xs text-slate-500 mt-1">{toEmail}</p>
        </div>
        <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          닫기
        </button>
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <p className="text-sm text-slate-600">
          {agencyLabel}에 등록된 공문 템플릿이 없습니다. &quot;공문 양식 관리&quot; 메뉴에서 먼저 템플릿을 등록해주세요.
        </p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold px-2 py-1 rounded bg-purple-100 text-purple-700">
          {agencyLabel} · 정산절차 안내 공문
        </span>
        <span className="text-xs text-slate-500">{project.projectNumber}</span>
      </div>

      {templates.length > 1 && (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">템플릿 선택</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="max-h-[50vh] overflow-y-auto border border-slate-100 rounded-xl p-4 bg-slate-50/50">
        <NoticeLetterPreview template={template} statusRows={statusRows} feeRows={feeRows} docNumber={docNumber} issuedDate={issuedDate} />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">수신 이메일</label>
        <input
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="recipient@institution.co.kr"
        />
      </div>

      <p className="text-[11px] text-slate-400">
        발신 계정: {canSendMail ? senderUser!.hiworksEmail : <span className="text-red-500">등록된 하이웍스 계정이 없습니다 (관리자 &gt; 사용자 관리에서 등록)</span>}
      </p>
      {sendError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{sendError}</p>}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={send}
          disabled={!toEmail.trim() || sending || !canSendMail}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FiSend size={14} />
          {sending ? "발송 중..." : "발송"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { projects, fundingAgencies, agencyNoticeTemplates, projectMembers, emailDispatches, users, termFees } = useStore();
  const canEditProjects = useCanWrite('projects');
  const canSendNotice = useCanWrite('emails');
  const [activeTab, setActiveTab] = useState<"info" | "fees">("info");
  const [showNotice, setShowNotice] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">과제를 찾을 수 없습니다</p>
        <Link href="/projects" className="text-xs text-blue-600 hover:underline">← 과제 목록으로</Link>
      </div>
    );
  }

  const noticeAgency = fundingAgencies.find((a) => a.id === project.agencyId);
  // agencyNoticeTemplates는 이제 정산절차 안내 공문 전용이다 — 수수료 청구서 양식은 feeInvoiceTemplates로 분리됐다.
  const noticeAgencyTemplates = noticeAgency
    ? agencyNoticeTemplates.filter((t) => t.agencyShortName === noticeAgency.shortName)
    : [];
  const leadMember = projectMembers.find((m) => m.projectId === project.id && m.role === "LEAD");
  const coInstitutionCount = projectMembers.filter((m) => m.projectId === project.id && m.role !== "LEAD").length;
  // 단계별 시작/종료일은 이제 협약 구조(stages) 표에서 단계마다 입력받으므로, 현재 연차가
  // 속한 단계의 날짜를 우선 쓰고 없으면 옛 방식(과제 단위 단일 필드)으로 대체한다.
  const currentStage = project.stages?.find((s) => project.currentTerm >= s.startTermNumber && project.currentTerm <= s.endTermNumber);
  const currentStageStartDate = currentStage?.stageStartDate ?? project.stageStartDate ?? project.startDate;
  const currentStageEndDate = currentStage?.stageEndDate ?? project.stageEndDate ?? project.endDate;
  const noticeStatusRows: NoticeStatusRow[] = [
    { label: "과제번호 (RCMS)", value: project.projectCode || project.projectNumber },
    { label: "과제명", value: project.projectName },
    { label: "단계연구개발기간", value: `${fmtDate(currentStageStartDate)} ~ ${fmtDate(currentStageEndDate)}` },
    { label: "대상기간", value: `${fmtDate(project.firstStartDate ?? project.startDate)} ~ ${fmtDate(project.finalEndDate ?? project.endDate)}` },
    { label: "정산구분", value: leadMember?.settlementType ?? "위탁정산" },
    { label: "주관연구개발기관", value: project.leadInstitutionName },
    { label: "연구책임자", value: project.researchLead ?? "—" },
    { label: "공동연구개발기관수", value: `${coInstitutionCount}개` },
  ];
  const noticeSeq = emailDispatches.filter((e) => e.emailType === "SETTLEMENT_NOTICE").length + 1;
  const noticeDocNumber = `${COMPANY_INFO.docNumberPrefix} ${new Date().getFullYear()}-${String(noticeSeq).padStart(4, "0")}`;
  const noticeIssuedDate = new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  // getCurrentUser()는 로그인 시점의 스냅샷이라 이후 등록된 하이웍스 계정 정보가 반영되지 않으므로,
  // 실시간 store에서 같은 id의 사용자 레코드를 다시 찾아 발신 계정으로 사용한다.
  const senderUser = users.find((u) => u.id === getCurrentUser()?.id) ?? null;
  const projectTermFees = termFees.filter((tf) => tf.projectNumber === project.projectNumber);
  // 정산절차 안내 공문 "■ 수수료" 섹션에 자동으로 채워 넣을, 지금 진행 중인 연차의 산정·청구 요약.
  const noticeFeeRows: NoticeStatusRow[] = buildNoticeFeeRows(project, projectTermFees, project.currentTerm);
  const dateMismatch = hasStageTermDateMismatch(project, projectTermFees);

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link href="/projects" className="text-xs text-slate-400 hover:text-slate-600">← 과제 목록</Link>
        <span className="text-xs text-slate-300">/</span>
        <span className="text-xs text-slate-600 font-medium truncate max-w-xs">{project.projectName}</span>
      </div>

      {/* Project header */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-slate-400">{project.projectNumber}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <h2 className="text-base font-bold text-slate-800">{project.projectName}</h2>
              {dateMismatch && (
                <span
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 whitespace-nowrap"
                  title="특정 연차에 직접 지정한 날짜가, 그 뒤 단계 날짜 변경으로 단계 기간 밖으로 벗어났습니다. 아래 수수료 관리 탭에서 확인해주세요."
                >
                  ⚠ 단계·연차 날짜 불일치
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{project.leadInstitutionName} · {project.agency}</p>
          </div>
          <div className="flex items-center gap-2">
            {noticeAgency && canSendNotice && (
              <button
                onClick={() => setShowNotice(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <FiFileText size={12} /> 정산절차 안내 공문
              </button>
            )}
            {canEditProjects && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
              >
                <FiTrash2 size={12} /> 과제 삭제
              </button>
            )}
            <StatusBadge label={PROJECT_STATUS[project.status].label} color={PROJECT_STATUS[project.status].color} />
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <Modal title="과제 삭제" onClose={() => setShowDeleteConfirm(false)}>
          <div className="p-5 space-y-4">
            <p className="text-sm text-slate-700">
              <strong className="font-semibold">{project.projectName}</strong> ({project.projectNumber}) 과제를 삭제하시겠습니까?
            </p>
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 space-y-1">
              <p className="font-medium">함께 삭제되는 데이터 (되돌릴 수 없습니다)</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>참여기관 정보</li>
                <li>연차별 수수료 산정·청구 내역</li>
                <li>이슈/메모</li>
                <li>미청구액·미수금 내역</li>
                <li>세금계산서 내역</li>
              </ul>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button
                onClick={() => { deleteProject(project.id); router.push("/projects"); }}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                삭제
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-slate-200">
        {([
          { key: "info" as const, label: "과제 정보" },
          { key: "fees" as const, label: "수수료 관리" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "info" ? (
        <ProjectInfoTab projectId={id} />
      ) : (
        <FeeManagementTab projectId={id} />
      )}

      {showNotice && noticeAgency && (
        <Modal title="정산절차 안내 공문" onClose={() => setShowNotice(false)} size="xl">
          <SettlementNoticeModal
            project={project}
            agencyLabel={`${noticeAgency.name} (${noticeAgency.shortName})`}
            templates={noticeAgencyTemplates}
            statusRows={noticeStatusRows}
            feeRows={noticeFeeRows}
            recipientEmail={leadMember?.contactEmail ?? ""}
            docNumber={noticeDocNumber}
            issuedDate={noticeIssuedDate}
            senderUser={senderUser}
            onClose={() => setShowNotice(false)}
          />
        </Modal>
      )}
    </div>
  );
}
