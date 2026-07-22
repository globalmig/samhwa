"use client";

import { use, useState, useMemo, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FiEdit2, FiCheck, FiX, FiPlus, FiSend, FiChevronDown, FiChevronUp, FiTrash2, FiFileText,
} from "react-icons/fi";
import {
  useStore, updateProject, addProjectIssue, updateProjectIssue, deleteProjectIssue, addTaxInvoice,
  addReceivable, updateReceivable, addEmailDispatch, updateTermFee, updateUnclaimedFee,
  updateProjectMember, autoGenerateTermFees, addProjectMember, deleteProjectMember, deleteProject,
} from "@/lib/store";
import { type TaxInvoice, type Receivable, type TermFee, type UnclaimedFee, type Project, type ProjectMember, type Institution, type IssueRecipientGroup, type AgencyNoticeTemplateEntry, EMPTY_NOTICE_TEMPLATE, COMPANY_INFO } from "@/lib/mock";
import { calcTermFee, resolvePolicy, normalizeGrade, getMemberAmount, isSettlementTerm, isNonProfitInstitution, resolveRdaAgencyId, type CalcMember } from "@/lib/fee-calculator";
import { fmtWonFull, fmtDate, splitVatInclusive, addMonths } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import MoneyInput from "@/components/common/MoneyInput";
import DateInput from "@/components/common/DateInput";
import NoticeLetterPreview, { type NoticeStatusRow } from "@/components/common/NoticeLetterPreview";
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
  "A~C": "bg-green-100 text-green-700",
  일반: "bg-slate-100 text-slate-500",
};
const GRADE_LABEL: Record<string, string> = { S: "최우수(S)", "A~C": "우수(A~C)", 일반: "일반" };

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

// ─── Tab 1: 과제 정보 ────────────────────────────────────────
function ProjectInfoTab({ projectId }: { projectId: string }) {
  const canEditProjects = useCanWrite('projects');
  const canEditIssues = useCanWrite('issues');
  const canManageIssues = useCanWrite('issues-manage');
  const { projects, projectMembers, institutions, projectIssues, auditLog, fundingAgencies, feePolicies, termFeeCalcs, users } = useStore();
  const selectableUsers = users.filter((u) => u.status === "ACTIVE");

  const project = projects.find((p) => p.id === projectId) ?? null;

  // All hooks before conditional return
  const [draft, setDraft] = useState<Project>(() => project ?? {
    id: "", projectNumber: "", projectName: "", agencyId: "", agency: "",
    leadInstitutionId: "", leadInstitutionName: "",
    totalBudget: 0, startDate: "", endDate: "",
    totalTerms: 1, currentTerm: 1, status: "ACTIVE",
  });
  const [savedMsg, setSavedMsg] = useState(false);
  const [editingMembers, setEditingMembers] = useState(false);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, Partial<ProjectMember>>>({});
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, { cashBudget: number; inKindBudget: number }>>({});
  const [budgetMismatchError, setBudgetMismatchError] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingBudgetMember, setEditingBudgetMember] = useState<ProjectMember | null>(null);
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

  if (!project) return null;

  const members = projectMembers.filter((m) => m.projectId === projectId);
  const issues = [...projectIssues.filter((i) => i.projectId === projectId)]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const history = auditLog
    .filter((e) => e.entityType === "project" && e.entityId === projectId)
    .slice(0, 10);

  // KEIT 수수료 산정 (현재 연차 기준)
  const currentTerm = project.currentTerm ?? 1;

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

  const policy = resolvePolicy(project.agencyId, feePolicies, project.programType ?? "GENERAL");
  const defaultSettlementType = policy?.defaultSettlementType ?? "자체정산";
  const calcMembers: CalcMember[] = policy ? members.flatMap((m) => {
    const { cashBudget, inKindBudget } = getCurrentTermBudget(m);
    const amount = policy.feeBasis === "CASH_PLUS_INKIND" ? cashBudget + inKindBudget : cashBudget;
    if (amount <= 0) return [];
    return [{
      institutionId: m.institutionId,
      institutionName: m.institutionName,
      role: m.role as "LEAD" | "PARTICIPANT",
      grade: normalizeGrade(m.institutionGrade ?? "일반"),
      institutionType: m.institutionType,
      settlementType: (m.settlementType ?? defaultSettlementType) as "위탁정산" | "자체정산",
      cashBudget,
      inKindBudget,
    }];
  }) : [];

  const currentWorkType: "ANNUAL" | "SETTLEMENT" = isSettlementTerm(project, currentTerm) ? "SETTLEMENT" : "ANNUAL";
  // 정산 연차는 이전 연차들의 일반 미청구 누적액도 이번에 함께 걷어야 하므로, 자동산정 시 저장해둔
  // TermFeeCalc.carriedOverUnclaimed(단계 내 누적)를 그대로 가져와 반영한다 — 0으로 고정하면 안 됨.
  const carriedOverUnclaimed = termFeeCalcs.find(
    (c) => c.projectNumber === project.projectNumber && c.termNumber === currentTerm
  )?.carriedOverUnclaimed ?? 0;
  const feeResult = policy && calcMembers.length > 0
    ? calcTermFee({
        members: calcMembers,
        workType: currentWorkType,
        policy,
        projectType: project.projectType ?? "GENERAL",
        carriedOverUnclaimed,
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

  function saveEdit() {
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
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  const annualBudget = (draft.govGrant ?? 0) + (draft.privateCash ?? 0) + (draft.privateInKind ?? 0);

  const totalCashBudget = members.reduce((s, m) => s + getMemberBudgetVal(m, "cashBudget"), 0);
  const totalInKindBudget = members.reduce((s, m) => s + getMemberBudgetVal(m, "inKindBudget"), 0);
  const budgetMatchesAnnual = totalCashBudget + totalInKindBudget === annualBudget;

  function startMemberEdit() { setMemberDrafts({}); setBudgetDrafts({}); setBudgetMismatchError(""); setEditingMembers(true); }
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
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">기본 정보</h3>
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
          {/* 과제명 + 상태 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">과제명</label>
              <input className={`${inp} w-full`} value={draft.projectName}
                onChange={(e) => setDraft((p) => ({ ...p, projectName: e.target.value }))} />
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

          {/* 주관기관 + 지원기관 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <InstitutionQuickAdd
                label="주관기관"
                value={draft.leadInstitutionId}
                onChange={(id) => setDraft((p) => ({ ...p, leadInstitutionId: id }))}
                institutions={institutions}
              />
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

          {/* 사업비 구분 (총사업비 / 현금사업비 / 현물사업비) */}
          <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
            <p className="text-xs font-semibold text-slate-600">사업비 구분 (총사업비 / 현금사업비 / 현물사업비)</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 정부출연금 (원)</label>
                <MoneyInput className={`${inp} w-full`} value={draft.govGrant ?? 0}
                  onChange={(v) => setDraft((p) => ({ ...p, govGrant: v }))} />
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
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현금 (원)</label>
                <MoneyInput className={`${inp} w-full`} value={draft.privateCash ?? 0}
                  onChange={(v) => setDraft((p) => ({ ...p, privateCash: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">공동기관 수</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white text-slate-500">
                  {members.filter((m) => m.role === "PARTICIPANT").length}개
                </div>
                <p className="text-[10px] text-slate-400 mt-1">참여기관 목록에서 기관을 추가·삭제하면 자동 반영됩니다</p>
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

          {/* 과제 전체 기간 */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">최초시작일</label>
              <DateInput className="w-full" value={draft.firstStartDate ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, firstStartDate: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">최종종료일</label>
              <DateInput className="w-full" value={draft.finalEndDate ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, finalEndDate: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">단계시작일</label>
              <DateInput className="w-full" value={draft.stageStartDate ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, stageStartDate: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">단계종료일</label>
              <DateInput className="w-full" value={draft.stageEndDate ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, stageEndDate: v }))} />
            </div>
          </div>

          {/* 당해 기간 + 연차 + 과제구분 + 자율성트랙 */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">당해시작일</label>
              <DateInput className="w-full" value={draft.startDate}
                onChange={(v) => setDraft((p) => ({ ...p, startDate: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">당해종료일</label>
              <DateInput className="w-full" value={draft.endDate}
                onChange={(v) => setDraft((p) => ({ ...p, endDate: v }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">과제 구분</label>
              <select className={`${sel} w-full`} value={draft.projectCategory ?? "연차상시"}
                onChange={(e) => setDraft((p) => ({ ...p, projectCategory: e.target.value }))}>
                <option value="연차상시">연차상시</option>
                <option value="정산">정산</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">총연차</label>
              <input className={`${inp} w-full`} type="number" min={1} value={draft.totalTerms}
                onChange={(e) => setDraft((p) => ({ ...p, totalTerms: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">현재연차</label>
              <input className={`${inp} w-full`} type="number" min={1} value={draft.currentTerm}
                onChange={(e) => setDraft((p) => ({ ...p, currentTerm: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">자율성트랙 여부</label>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
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
            {draft.agencyId === "fa-003" && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  사업 유형 <span className="text-slate-400 font-normal">· IITP 전용</span>
                </label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
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

          <AgreementStructureEditor
            agreementType={draft.agreementType}
            stages={draft.stages}
            totalTerms={draft.totalTerms}
            onChange={(agreementType, stages) => setDraft((p) => ({ ...p, agreementType, stages }))}
          />
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
              {currentTerm}연차 · {currentWorkType === "SETTLEMENT" ? "정산" : "연차상시"}
            </span>
            <span className={`text-xs ${budgetMatchesAnnual ? "text-slate-500" : "text-red-600 font-medium"}`}>
              현금+현물 합계 <strong className={budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}>{fmtWonFull(totalCashBudget + totalInKindBudget)}</strong>
              <span className="text-slate-400 mx-1">/</span>
              당해 사업비 {fmtWonFull(annualBudget)}
            </span>
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
            totalTerms={project.totalTerms ?? 1}
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
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">구분</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정 수수료 ({currentTerm}연차)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 w-24">연차별 사업비</th>
                {canEditProjects && <th className="px-4 py-3 w-10" />}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const rawGrade = (getMemberVal(m, "institutionGrade") ?? "일반") as string;
                const grade = normalizeGrade(rawGrade);
                const cashBudget = getMemberBudgetVal(m, "cashBudget");
                const inKindBudget = getMemberBudgetVal(m, "inKindBudget");
                return (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/institutions/${m.institutionId}`}
                        className="text-sm text-blue-600 hover:underline font-medium">{m.institutionName}</Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMembers ? (
                        <select
                          value={getMemberVal(m, "role")}
                          onChange={(e) => setMemberField(m.id, "role", e.target.value as ProjectMember["role"])}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="LEAD">주관</option>
                          <option value="PARTICIPANT">참여</option>
                        </select>
                      ) : (
                        <StatusBadge label={m.role === "LEAD" ? "주관" : "참여"} color={m.role === "LEAD" ? "blue" : "slate"} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {editingMembers ? (
                        <select
                          value={grade}
                          onChange={(e) => setMemberField(m.id, "institutionGrade", e.target.value as ProjectMember["institutionGrade"])}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="S">최우수 (S)</option>
                          <option value="A~C">우수 (A~C)</option>
                          <option value="일반">일반</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${GRADE_COLOR[grade] ?? GRADE_COLOR["일반"]}`}>
                          {GRADE_LABEL[grade] ?? grade}
                        </span>
                      )}
                      {grade !== "일반" && !isNonProfitInstitution(m.institutionType) && (
                        <p className="text-[10px] text-amber-600 mt-1 leading-tight" title="정산면제는 비영리기관(대학·정부출연연구소·공공기관)만 해당하여, 영리기업은 등급이 있어도 정산면제가 적용되지 않습니다.">
                          ⚠ 영리기관·면제불가
                        </p>
                      )}
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
                          (m.settlementType ?? defaultSettlementType) === "자체정산" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                        }`}>
                          {m.settlementType ?? defaultSettlementType}
                        </span>
                      )}
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
                            if (confirm(`"${m.institutionName}"을(를) 참여기관에서 제외하시겠습니까?`)) deleteProjectMember(m.id);
                          }}
                          className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
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
                <td className={`px-4 py-2.5 text-right font-bold ${budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}`}>
                  현금 {fmtWonFull(totalCashBudget)}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold ${budgetMatchesAnnual ? "text-slate-800" : "text-red-600"}`}>
                  현물 {fmtWonFull(totalInKindBudget)}
                </td>
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
                    {e.changedFields ? Object.keys(e.changedFields).join(", ") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [role, setRole] = useState<"LEAD" | "PARTICIPANT">("PARTICIPANT");
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
              className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${role === "PARTICIPANT" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>참여</button>
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
        <p className="text-[11px] text-slate-400 mt-1">사업비가 입력된 연차만 해당 연차의 수수료가 자동 산정됩니다.</p>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={submit} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">추가</button>
      </div>
    </div>
  );
}

// ─── Term section (per-연차 card in Tab 2) ───────────────────
function TermSection({ group, allFees, projectNumber, agencyId, leadInstitutionId, leadInstitutionName, members, isSettlement }: {
  group: TermGroup;
  allFees: TermFee[];
  projectNumber: string;
  agencyId: string;
  leadInstitutionId: string;
  leadInstitutionName: string;
  members: ProjectMember[];
  isSettlement: boolean;
}) {
  const canEditInvoices = useCanWrite('tax-invoices');
  const canEditReceivables = useCanWrite('receivables');
  const canEditEmails = useCanWrite('emails');
  const canEditUnclaimed = useCanWrite('unclaimed');
  const { institutions, emailDispatches, fundingAgencies } = useStore();
  const leadInst = institutions.find((i) => i.id === leadInstitutionId);
  // 전담기관 설정에 따라 공문을 주관기관만 받을지, 참여기관까지 다 받을지 결정
  const sendToAllInstitutions = fundingAgencies.find((a) => a.id === agencyId)?.noticeRecipientScope === "LEAD_AND_PARTICIPANTS";

  const [expanded, setExpanded] = useState(false);
  const [showFeeDetail, setShowFeeDetail] = useState(false);

  // 이 연차까지(포함) 그 기관 자신의 미청구수수료 누적 — 연차별 세부표의 "미청구수수료 누적" 열에 사용.
  function getCumulativeUnclaimed(institutionId: string): number {
    return allFees
      .filter((af) => af.projectNumber === projectNumber && af.institutionId === institutionId && af.termNumber <= group.termNumber)
      .reduce((s, af) => s + (af.unclaimedFee ?? 0), 0);
  }
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [invForm, setInvForm] = useState({
    issuedAt: new Date().toISOString().slice(0, 10),
    ...splitVatInclusive(group.totalApplied),
    totalAmount: group.totalApplied,
  });
  const [editingRv, setEditingRv] = useState(false);
  const [rvForm, setRvForm] = useState({
    paidAmount: group.receivable?.paidAmount ?? 0,
  });

  function openInvoiceForm() {
    setInvForm({
      issuedAt: new Date().toISOString().slice(0, 10),
      ...splitVatInclusive(group.totalApplied),
      totalAmount: group.totalApplied,
    });
    setIssuingInvoice(true);
  }

  // 합계(=산정된 수수료)는 고정, 공급가액을 조정하면 부가세가 차액만큼 재계산된다
  function handleSupplyChange(v: number) {
    const tax = group.totalApplied - v;
    setInvForm((p) => ({ ...p, supplyAmount: v, taxAmount: tax, totalAmount: group.totalApplied }));
  }

  function saveInvoice() {
    const now = new Date();
    addTaxInvoice({
      invoiceNumber: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(Date.now()).slice(-5)}`,
      projectNumber,
      projectName: group.fees[0]?.projectName ?? "",
      termYear: group.termYear,
      termNumber: group.termNumber,
      leadInstitutionId,
      leadInstitutionName,
      issuedAt: invForm.issuedAt,
      supplyAmount: invForm.supplyAmount,
      taxAmount: invForm.taxAmount,
      totalAmount: invForm.totalAmount,
      status: "ISSUED",
    });
    // 주관기관만 발송 대상인 전담기관은 실제로 청구서를 받는 주관기관만 청구완료 처리하고,
    // 참여기관은 개별 청구된 게 아니므로 확정(CONFIRMED)까지만 반영한다.
    group.fees.forEach((f) => {
      if (sendToAllInstitutions || f.institutionId === leadInstitutionId) {
        if (f.status !== "BILLED") updateTermFee(f.id, { status: "BILLED" });
      } else if (f.status === "DRAFT" || f.status === "SCHEDULED") {
        updateTermFee(f.id, { status: "CONFIRMED" });
      }
    });
    setIssuingInvoice(false);
  }

  function openRvForm() {
    setRvForm({ paidAmount: group.receivable?.paidAmount ?? 0 });
    setEditingRv(true);
  }

  function saveReceivable() {
    const inv = group.invoice;
    if (!inv) return;
    const remaining = Math.max(0, inv.totalAmount - rvForm.paidAmount);
    // 미입금 상태의 기본값은 "미수"(OVERDUE) — 만기일(청구일+3개월)이 지나기 전까진 isOverdueByRule이
    // 화면에 "미수"로만 보여주고, 만기일이 지나면 자동으로 "연체"로 승격된다.
    const status: Receivable["status"] = rvForm.paidAmount >= inv.totalAmount
      ? "PAID" : rvForm.paidAmount > 0 ? "PARTIAL" : "OVERDUE";
    const dueDate = addMonths(inv.issuedAt, 3);
    if (group.receivable) {
      updateReceivable(group.receivable.id, {
        paidAmount: rvForm.paidAmount,
        receivableAmount: remaining,
        dueDate: group.receivable.dueDate || dueDate,
        status,
      });
    } else {
      addReceivable({
        invoiceNumber: inv.invoiceNumber,
        projectNumber,
        projectName: group.fees[0]?.projectName ?? "",
        termYear: group.termYear,
        termNumber: group.termNumber,
        leadInstitutionId,
        leadInstitutionName,
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

  // 공문 발송
  const termLabel = `${group.termYear}년 ${group.termNumber}연차`;
  const sentEmails = emailDispatches.filter(
    (e) => e.subject.includes(projectNumber) && e.subject.includes(termLabel)
  );
  const lastSent = [...sentEmails].sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];

  function sendLetter() {
    const batchId = `BATCH-${Date.now()}`;
    const sentAt = new Date().toISOString().replace("T", " ").slice(0, 16);
    const recipients = sendToAllInstitutions
      ? group.fees.map((f) => ({
          institutionName: f.institutionName,
          email: institutions.find((i) => i.id === f.institutionId)?.contactEmail ?? "",
        }))
      : [{ institutionName: leadInstitutionName, email: leadInst?.contactEmail ?? "" }];

    recipients.forEach((r) => {
      addEmailDispatch({
        batchId,
        sentAt,
        senderName: getCurrentUser()?.name ?? "시스템",
        recipientInstitution: r.institutionName,
        recipientEmail: r.email,
        subject: `[${projectNumber}] ${termLabel} 수수료 청구서`,
        emailType: "TAX_INVOICE",
        feeCategory: "ANNUAL",
        attachments: [`청구서_${projectNumber}_${termLabel}.pdf`],
        status: "SUCCESS",
      });
    });
  }

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
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{group.fees.length}개 기관</p>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-500 mr-2">
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
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
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
                  const rawGrade = members.find((m) => m.institutionId === f.institutionId)?.institutionGrade ?? "일반";
                  const grade = normalizeGrade(rawGrade);
                  const cumulativeUnclaimed = getCumulativeUnclaimed(f.institutionId);
                  return (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{f.institutionName}</td>
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
                        <span className={f.appliedFee === 0 ? "text-amber-500 font-normal" : "text-slate-800"}>
                          {f.appliedFee === 0 ? "미적용" : fmtWonFull(f.appliedFee)}
                        </span>
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
                  <td colSpan={4} className="px-4 py-2 text-right text-xs text-slate-400">합계</td>
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

          {/* 수수료 집계: 공급가액 / 부가세 / 합계 — 산정된 수수료는 부가세 포함 금액이므로 분리해서 표시 */}
          {group.totalApplied > 0 && (() => {
            const { supplyAmount: aggSupply, taxAmount: aggTax } = splitVatInclusive(group.totalApplied);
            return (
              <div className="border-t border-slate-200 px-5 py-3 bg-slate-50/60 flex items-center justify-end gap-10">
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 mb-0.5">공 급 가 액</p>
                  <p className="text-sm font-semibold text-slate-700">{fmtWonFull(aggSupply)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 mb-0.5">부 가 세</p>
                  <p className="text-sm font-semibold text-slate-700">{fmtWonFull(aggTax)}</p>
                </div>
                <div className="border-l border-slate-300 pl-10 text-right">
                  <p className="text-[10px] font-semibold text-slate-500 mb-0.5 tracking-widest uppercase">합  계</p>
                  <p className="text-lg font-bold text-slate-900">{fmtWonFull(group.totalApplied)}</p>
                </div>
              </div>
            );
          })()}

          {/* ── 세금계산서 + 공문 발송 (같은 줄) ── */}
          <div className="border-t border-slate-100 px-5 py-4 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-slate-600 w-24 shrink-0 pt-1">세금계산서</span>
              {group.invoice ? (
                <div className="flex-1 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-slate-700">{group.invoice.invoiceNumber}</span>
                  <span className="text-xs text-slate-500">{fmtDate(group.invoice.issuedAt)}</span>
                  <span className="text-xs text-slate-500">공급가 {fmtWonFull(group.invoice.supplyAmount)}</span>
                  <span className="text-xs text-slate-500">부가세 {fmtWonFull(group.invoice.taxAmount)}</span>
                  <span className="text-sm font-bold text-slate-800">{fmtWonFull(group.invoice.totalAmount)}</span>
                  <StatusBadge label={INVOICE_STATUS[group.invoice.status].label} color={INVOICE_STATUS[group.invoice.status].color} />
                  {/* 공문 발송 - 세금계산서와 동일 행 */}
                  <div className="ml-auto flex items-center gap-2">
                    {lastSent && (
                      <span className="text-xs text-slate-400">마지막 발송 {lastSent.sentAt}</span>
                    )}
                    {canEditEmails && (
                      <button onClick={sendLetter}
                        title={sendToAllInstitutions ? `주관+참여기관 ${group.fees.length}곳으로 발송됩니다` : "주관기관으로 발송됩니다"}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                        <FiSend size={12} /> 공문 발송{sendToAllInstitutions ? ` (${group.fees.length}곳)` : ""}
                      </button>
                    )}
                    {canEditInvoices && (
                      <button onClick={() => { openInvoiceForm(); setIssuingInvoice(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                        <FiEdit2 size={12} /> 수정
                      </button>
                    )}
                  </div>
                </div>
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
                  <p className="text-xs text-slate-400">발행 후 <strong>공문 발송</strong> 버튼으로 주관기관에 즉시 발송할 수 있습니다</p>
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
              {group.receivable ? (
                <div className="flex-1 flex flex-wrap items-center gap-4">
                  <span className="text-xs text-slate-500">청구 {fmtWonFull(group.receivable.billedAmount)}</span>
                  <span className="text-xs text-green-700 font-medium">납부 {fmtWonFull(group.receivable.paidAmount)}</span>
                  <span className={`text-sm font-bold ${group.receivable.receivableAmount > 0 ? "text-red-600" : "text-slate-400"}`}>
                    미수금 {fmtWonFull(group.receivable.receivableAmount)}
                  </span>
                  <StatusBadge label={RECEIVABLE_STATUS[group.receivable.status].label} color={RECEIVABLE_STATUS[group.receivable.status].color} />
                  {canEditReceivables && (
                    <button onClick={openRvForm}
                      className="ml-auto flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                      <FiEdit2 size={12} /> 수금 입력
                    </button>
                  )}
                </div>
              ) : group.invoice ? (
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
                    <p className={`text-sm font-bold ${Math.max(0, (group.invoice?.totalAmount ?? 0) - rvForm.paidAmount) > 0 ? "text-red-600" : "text-slate-400"}`}>
                      {fmtWonFull(Math.max(0, (group.invoice?.totalAmount ?? 0) - rvForm.paidAmount))}
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
          projectNumber={project.projectNumber}
          agencyId={project.agencyId}
          leadInstitutionId={project.leadInstitutionId}
          leadInstitutionName={project.leadInstitutionName}
          members={members}
          isSettlement={isSettlementTerm(project, group.termNumber)}
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
  recipientEmail,
  docNumber,
  issuedDate,
  onClose,
}: {
  project: Project;
  agencyLabel: string;
  templates: AgencyNoticeTemplateEntry[];
  statusRows: NoticeStatusRow[];
  recipientEmail: string;
  docNumber: string;
  issuedDate: string;
  onClose: () => void;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [toEmail, setToEmail] = useState(recipientEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? templates[0];
  const template = selectedTemplate?.content ?? EMPTY_NOTICE_TEMPLATE;

  function send() {
    setSending(true);
    addEmailDispatch({
      batchId: `BATCH-${Date.now()}`,
      sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      senderName: getCurrentUser()?.name ?? "시스템",
      recipientInstitution: project.leadInstitutionName,
      recipientEmail: toEmail,
      subject: `[${project.projectNumber}] ${template.title || "정산절차 안내 및 수수료 청구"}`,
      emailType: "SETTLEMENT_NOTICE",
      attachments: template.attachments,
      status: "SUCCESS",
      noticeSnapshot: { template, statusRows, docNumber, issuedDate },
    });
    setSending(false);
    setSent(true);
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
        <NoticeLetterPreview template={template} statusRows={statusRows} docNumber={docNumber} issuedDate={issuedDate} />
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

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={send}
          disabled={!toEmail.trim() || sending}
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
  const { projects, fundingAgencies, agencyNoticeTemplates, projectMembers, emailDispatches } = useStore();
  const canEditProjects = useCanWrite('projects');
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
  const noticeAgencyTemplates = noticeAgency
    ? agencyNoticeTemplates.filter((t) => t.agencyShortName === noticeAgency.shortName)
    : [];
  const leadMember = projectMembers.find((m) => m.projectId === project.id && m.role === "LEAD");
  const coInstitutionCount = projectMembers.filter((m) => m.projectId === project.id && m.role === "PARTICIPANT").length;
  const noticeStatusRows: NoticeStatusRow[] = [
    { label: "과제번호 (RCMS)", value: project.projectCode || project.projectNumber },
    { label: "과제명", value: project.projectName },
    { label: "단계연구개발기간", value: `${fmtDate(project.stageStartDate ?? project.startDate)} ~ ${fmtDate(project.stageEndDate ?? project.endDate)}` },
    { label: "대상기간", value: `${fmtDate(project.firstStartDate ?? project.startDate)} ~ ${fmtDate(project.finalEndDate ?? project.endDate)}` },
    { label: "정산구분", value: leadMember?.settlementType ?? "위탁정산" },
    { label: "주관연구개발기관", value: project.leadInstitutionName },
    { label: "연구책임자", value: project.researchLead ?? "—" },
    { label: "공동연구개발기관수", value: `${coInstitutionCount}개` },
  ];
  const noticeSeq = emailDispatches.filter((e) => e.emailType === "SETTLEMENT_NOTICE").length + 1;
  const noticeDocNumber = `${COMPANY_INFO.docNumberPrefix} ${new Date().getFullYear()}-${String(noticeSeq).padStart(4, "0")}`;
  const noticeIssuedDate = new Date().toISOString().slice(0, 10).replace(/-/g, ".");

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
            <h2 className="text-base font-bold text-slate-800 mt-0.5">{project.projectName}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{project.leadInstitutionName} · {project.agency}</p>
          </div>
          <div className="flex items-center gap-2">
            {noticeAgency && (
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
            recipientEmail={leadMember?.contactEmail ?? ""}
            docNumber={noticeDocNumber}
            issuedDate={noticeIssuedDate}
            onClose={() => setShowNotice(false)}
          />
        </Modal>
      )}
    </div>
  );
}
