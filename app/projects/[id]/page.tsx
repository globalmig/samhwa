"use client";

import { use, useState, useMemo, type ReactNode } from "react";
import Link from "next/link";
import {
  FiEdit2, FiCheck, FiX, FiPlus, FiSend, FiChevronDown, FiChevronUp, FiTrash2,
} from "react-icons/fi";
import {
  useStore, updateProject, addProjectIssue, updateProjectIssue, deleteProjectIssue, addTaxInvoice,
  addReceivable, updateReceivable, addEmailDispatch, updateTermFee, updateUnclaimedFee,
  updateProjectMember,
} from "@/lib/store";
import { type TaxInvoice, type Receivable, type TermFee, type UnclaimedFee, type Project, type ProjectMember } from "@/lib/mock";
import { calcTermFee, resolvePolicy, normalizeGrade, type CalcMember } from "@/lib/fee-calculator";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import { useCanWrite } from "@/lib/permissions";

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
  const { projects, projectMembers, institutions, projectIssues, auditLog, fundingAgencies, feePolicies } = useStore();

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
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueContent, setIssueContent] = useState("");
  const [issuePriority, setIssuePriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [issueStatus, setIssueStatus] = useState<"OPEN" | "IN_PROGRESS" | "RESOLVED">("OPEN");
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editIssueDraft, setEditIssueDraft] = useState({ content: "", priority: "MEDIUM" as "HIGH" | "MEDIUM" | "LOW", status: "OPEN" as "OPEN" | "IN_PROGRESS" | "RESOLVED" });
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
  const policy = resolvePolicy(project.agencyId, feePolicies);
  const calcMembers: CalcMember[] = policy ? members.flatMap((m) => {
    const ab = m.annualBudgets?.find((a) => a.termNumber === currentTerm);
    const cashBudget = ab?.cashBudget ?? (m as unknown as { cashBudget?: number }).cashBudget ?? m.budget ?? 0;
    if (cashBudget <= 0) return [];
    return [{
      institutionId: m.institutionId,
      institutionName: m.institutionName,
      role: m.role as "LEAD" | "PARTICIPANT",
      grade: normalizeGrade(m.institutionGrade ?? "일반"),
      settlementType: (m.settlementType ?? "위탁정산") as "위탁정산" | "자체정산",
      cashBudget,
      inKindBudget: ab?.inKindBudget ?? 0,
    }];
  }) : [];

  const feeResult = policy && calcMembers.length > 0
    ? calcTermFee({
        members: calcMembers,
        workType: "ANNUAL",
        policy,
        projectType: (project as unknown as { projectType?: "GENERAL" | "AUTONOMY_TRACK" }).projectType ?? "GENERAL",
        carriedOverUnclaimed: 0,
      })
    : null;

  const exemptIds = new Set(feeResult?.exemptBreakdown.map((e) => e.institutionId) ?? []);
  const nonExemptCalcMembers = calcMembers.filter((m) => !exemptIds.has(m.institutionId));
  const totalNonExemptCash = nonExemptCalcMembers.reduce((s, m) => s + m.cashBudget, 0);

  const getInstCalcFee = (institutionId: string): number => {
    if (!feeResult) return 0;
    if (exemptIds.has(institutionId)) {
      return feeResult.exemptBreakdown.find((e) => e.institutionId === institutionId)?.calculatedFee ?? 0;
    }
    const cm = calcMembers.find((m) => m.institutionId === institutionId);
    if (!cm) return 0;
    const ratio = totalNonExemptCash > 0 ? cm.cashBudget / totalNonExemptCash : 0;
    return Math.round(feeResult.generalFee * ratio);
  };

  const totalCalcFee = feeResult?.calculatedFee ?? members.reduce((s, m) => s + m.calculatedFee, 0);

  function saveEdit() {
    const inst = institutions.find((i) => i.id === draft.leadInstitutionId);
    const annualBudget = (draft.govGrant ?? 0) + (draft.privateCash ?? 0) + (draft.privateInKind ?? 0);
    updateProject(projectId, {
      ...draft,
      leadInstitutionName: inst?.name ?? project!.leadInstitutionName,
      totalBudget: annualBudget > 0 ? annualBudget : draft.totalBudget,
    });
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  }

  const annualBudget = (draft.govGrant ?? 0) + (draft.privateCash ?? 0) + (draft.privateInKind ?? 0);

  function startMemberEdit() { setMemberDrafts({}); setEditingMembers(true); }
  function cancelMemberEdit() { setEditingMembers(false); setMemberDrafts({}); }
  function saveMemberEdits() {
    Object.entries(memberDrafts).forEach(([id, changes]) => {
      if (Object.keys(changes).length > 0) updateProjectMember(id, changes);
    });
    setEditingMembers(false);
    setMemberDrafts({});
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
    });
    setIssueContent("");
    setIssuePriority("MEDIUM");
    setIssueStatus("OPEN");
    setShowIssueForm(false);
  }

  const GRADE_COLOR: Record<string, string> = {
    S: "bg-blue-100 text-blue-700",
    "A~C": "bg-green-100 text-green-700",
    일반: "bg-slate-100 text-slate-500",
  };
  const GRADE_LABEL: Record<string, string> = { S: "최우수(S)", "A~C": "우수(A~C)", 일반: "일반" };

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
              <label className="block text-xs font-medium text-slate-500 mb-1">주관기관</label>
              <select className={`${sel} w-full`} value={draft.leadInstitutionId}
                onChange={(e) => setDraft((p) => ({ ...p, leadInstitutionId: e.target.value }))}>
                <option value="">선택하세요</option>
                {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
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
                <input className={`${inp} w-full`} type="number" value={draft.govGrant ?? 0}
                  onChange={(e) => setDraft((p) => ({ ...p, govGrant: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  사용실적 제출기한
                  <span className="ml-1 text-slate-400 font-normal">· 전담기관 사용실적보고서 기준</span>
                </label>
                <input className={`${inp} w-full`} type="date" value={draft.usageReportDeadline ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, usageReportDeadline: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간원금 (원)</label>
                <input className={`${inp} w-full`} type="number" value={draft.privateCash ?? 0}
                  onChange={(e) => setDraft((p) => ({ ...p, privateCash: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">참여 기관수</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white text-slate-500">
                  {members.length}개
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현물 (원)</label>
                <input className={`${inp} w-full`} type="number" value={draft.privateInKind ?? 0}
                  onChange={(e) => setDraft((p) => ({ ...p, privateInKind: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">전담기관 배정일자</label>
                <input className={`${inp} w-full`} type="date" value={draft.agencyAssignedAt ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, agencyAssignedAt: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">당해 사업비 (자동계산)</label>
                <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-white font-bold text-slate-700">
                  {fmtWon(annualBudget)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">내부 배정일</label>
                <input className={`${inp} w-full`} type="date" value={draft.internalAssignedAt ?? ""}
                  onChange={(e) => setDraft((p) => ({ ...p, internalAssignedAt: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* 기간 + 연차 + 과제구분 */}
          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">시작일</label>
              <input className={`${inp} w-full`} type="date" value={draft.startDate}
                onChange={(e) => setDraft((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">종료일</label>
              <input className={`${inp} w-full`} type="date" value={draft.endDate}
                onChange={(e) => setDraft((p) => ({ ...p, endDate: e.target.value }))} />
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
              <label className="block text-xs font-medium text-slate-500 mb-1">과제 구분</label>
              <select className={`${sel} w-full`} value={draft.projectCategory ?? "연차상시"}
                onChange={(e) => setDraft((p) => ({ ...p, projectCategory: e.target.value }))}>
                <option value="연차상시">연차상시</option>
                <option value="연차">연차</option>
                <option value="상시">상시</option>
                <option value="기타">기타</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 참여기관 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">참여기관 목록</h3>
            <p className="text-xs text-slate-400 mt-0.5">기관별 사업비 및 등급 수정 가능 · 예산 변경 시 수수료 재산정 반영</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              산정 수수료 합계 <strong className="text-slate-800 ml-1">{fmtWon(totalCalcFee)}</strong>
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
              <button onClick={startMemberEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                <FiEdit2 size={12} /> 기관 수정
              </button>
            ) : null}
          </div>
        </div>
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">참여기관 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">기관명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">역할</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">등급</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">배정예산 (원)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">구분</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정 수수료 ({currentTerm}연차)</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const rawGrade = (getMemberVal(m, "institutionGrade") ?? "일반") as string;
                const grade = normalizeGrade(rawGrade);
                const budget = getMemberVal(m, "budget") as number;
                return (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link href={`/institutions/${m.institutionId}`}
                        className="text-sm text-blue-600 hover:underline font-medium">{m.institutionName}</Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={m.role === "LEAD" ? "주관" : "참여"} color={m.role === "LEAD" ? "blue" : "slate"} />
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
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingMembers ? (
                        <input
                          type="number"
                          value={budget}
                          onChange={(e) => setMemberField(m.id, "budget", Number(e.target.value))}
                          className={`${inp} w-36 text-right`}
                        />
                      ) : (
                        <span className="text-sm text-slate-700">{fmtWon(budget)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {exemptIds.has(m.institutionId)
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-100 text-purple-700">면제</span>
                        : <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-500">일반</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      {feeResult
                        ? fmtWon(getInstCalcFee(m.institutionId))
                        : fmtWon(m.calculatedFee)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-2.5 text-right text-xs text-slate-400">합계</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fmtWon(totalCalcFee)}</td>
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
                <div className="flex gap-2 ml-auto">
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
                      <div className="flex gap-2 ml-auto">
                        <button onClick={() => setEditingIssueId(null)}
                          className="px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
                        <button
                          onClick={() => {
                            updateProjectIssue(issue.id, { content: editIssueDraft.content.trim(), priority: editIssueDraft.priority, status: editIssueDraft.status });
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
                    <p className="text-xs text-slate-400 mt-1">{issue.author} · {issue.createdAt}</p>
                  </div>
                  {canEditIssues ? (
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
                  {canEditIssues && (
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
                          onClick={() => { setEditingIssueId(issue.id); setEditIssueDraft({ content: issue.content, priority: issue.priority, status: issue.status ?? "OPEN" }); }}
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
    </div>
  );
}

// ─── Term section (per-연차 card in Tab 2) ───────────────────
function TermSection({ group, projectNumber, leadInstitutionId, leadInstitutionName }: {
  group: TermGroup;
  projectNumber: string;
  leadInstitutionId: string;
  leadInstitutionName: string;
}) {
  const canEditInvoices = useCanWrite('tax-invoices');
  const canEditReceivables = useCanWrite('receivables');
  const canEditEmails = useCanWrite('emails');
  const canEditUnclaimed = useCanWrite('unclaimed');
  const { institutions, emailDispatches } = useStore();
  const leadInst = institutions.find((i) => i.id === leadInstitutionId);

  const [expanded, setExpanded] = useState(false);
  const [issuingInvoice, setIssuingInvoice] = useState(false);
  const [invForm, setInvForm] = useState({
    issuedAt: new Date().toISOString().slice(0, 10),
    supplyAmount: group.totalApplied,
    taxAmount: Math.round(group.totalApplied * 0.1),
    totalAmount: Math.round(group.totalApplied * 1.1),
  });
  const [editingRv, setEditingRv] = useState(false);
  const [rvForm, setRvForm] = useState({
    paidAmount: group.receivable?.paidAmount ?? 0,
  });

  function openInvoiceForm() {
    setInvForm({
      issuedAt: new Date().toISOString().slice(0, 10),
      supplyAmount: group.totalApplied,
      taxAmount: Math.round(group.totalApplied * 0.1),
      totalAmount: Math.round(group.totalApplied * 1.1),
    });
    setIssuingInvoice(true);
  }

  function handleSupplyChange(v: number) {
    const tax = Math.round(v * 0.1);
    setInvForm((p) => ({ ...p, supplyAmount: v, taxAmount: tax, totalAmount: v + tax }));
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
    group.fees.forEach((f) => {
      if (f.status !== "BILLED") updateTermFee(f.id, { status: "BILLED" });
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
    const status: Receivable["status"] = rvForm.paidAmount >= inv.totalAmount
      ? "PAID" : rvForm.paidAmount > 0 ? "PARTIAL" : "PENDING";
    const today = new Date().toISOString().slice(0, 10);
    if (group.receivable) {
      updateReceivable(group.receivable.id, {
        paidAmount: rvForm.paidAmount,
        receivableAmount: remaining,
        dueDate: group.receivable.dueDate || today,
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
        dueDate: today,
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
    addEmailDispatch({
      batchId: `BATCH-${Date.now()}`,
      sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      recipientInstitution: leadInstitutionName,
      recipientEmail: leadInst?.contactEmail ?? "",
      subject: `[${projectNumber}] ${termLabel} 수수료 청구서`,
      emailType: "TAX_INVOICE",
      feeCategory: "ANNUAL",
      attachments: [`청구서_${projectNumber}_${termLabel}.pdf`],
      status: "SUCCESS",
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
            <StatusBadge label={FEE_STATUS[group.termStatus].label} color={FEE_STATUS[group.termStatus].color} />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{group.fees.length}개 기관</p>
        </div>
        <div className="flex items-center gap-6 text-xs text-slate-500 mr-2">
          <span>산정 <strong className="text-slate-700 ml-1">{fmtWon(group.totalCalculated)}</strong></span>
          <span>신청 <strong className="text-slate-700 ml-1">{fmtWon(group.totalApplied)}</strong></span>
          {group.receivable && (
            <span className={group.receivable.receivableAmount > 0 ? "text-red-600 font-semibold" : "text-green-700"}>
              미수금 {fmtWon(group.receivable.receivableAmount)}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100">
          {/* Institution fee table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-medium">
                  <th className="text-left px-4 py-2.5">기관명</th>
                  <th className="text-center px-4 py-2.5">유형</th>
                  <th className="text-right px-4 py-2.5">사업비</th>
                  <th className="text-center px-4 py-2.5">요율</th>
                  <th className="text-right px-4 py-2.5">표준액(산정)</th>
                  <th className="text-right px-4 py-2.5">조정액</th>
                  <th className="text-right px-4 py-2.5">수수료(적용)</th>
                  <th className="text-center px-4 py-2.5">상태</th>
                </tr>
              </thead>
              <tbody>
                {group.fees.map((f) => {
                  const adj = f.appliedFee === 0 ? 0 : f.appliedFee - f.calculatedFee;
                  return (
                    <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{f.institutionName}</td>
                      <td className="px-4 py-2.5 text-center text-slate-600 whitespace-nowrap">{f.institutionType}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtWon(f.budget)}</td>
                      <td className="px-4 py-2.5 text-center text-blue-700 font-medium">{f.feeRate}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmtWon(f.calculatedFee)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {adj === 0
                          ? <span className="text-slate-300">-</span>
                          : <span className={adj > 0 ? "text-blue-600 font-medium" : "text-red-500 font-medium"}>
                              {adj > 0 ? "+" : ""}{fmtWon(adj)}
                            </span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                        <span className={f.appliedFee === 0 ? "text-amber-500 font-normal" : "text-slate-800"}>
                          {f.appliedFee === 0 ? "미적용" : fmtWon(f.appliedFee)}
                        </span>
                      </td>
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
                  <td className="px-4 py-2 text-right text-xs font-semibold text-slate-700">{fmtWon(group.totalCalculated)}</td>
                  <td className="px-4 py-2 text-right text-xs">
                    {(() => {
                      const adj = group.totalApplied - group.totalCalculated;
                      if (adj === 0) return <span className="text-slate-300">-</span>;
                      return <span className={adj > 0 ? "text-blue-600 font-medium" : "text-red-500 font-medium"}>
                        {adj > 0 ? "+" : ""}{fmtWon(adj)}
                      </span>;
                    })()}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-bold text-slate-800">{fmtWon(group.totalApplied)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 수수료 집계: 공급가액 / 부가세 / 합계 */}
          {group.totalApplied > 0 && (
            <div className="border-t border-slate-200 px-5 py-3 bg-slate-50/60 flex items-center justify-end gap-10">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 mb-0.5">공 급 가 액</p>
                <p className="text-sm font-semibold text-slate-700">{fmtWon(group.totalApplied)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 mb-0.5">부 가 세 (10%)</p>
                <p className="text-sm font-semibold text-slate-700">{fmtWon(Math.round(group.totalApplied * 0.1))}</p>
              </div>
              <div className="border-l border-slate-300 pl-10 text-right">
                <p className="text-[10px] font-semibold text-slate-500 mb-0.5 tracking-widest uppercase">합  계</p>
                <p className="text-lg font-bold text-slate-900">{fmtWon(Math.round(group.totalApplied * 1.1))}</p>
              </div>
            </div>
          )}

          {/* ── 세금계산서 + 공문 발송 (같은 줄) ── */}
          <div className="border-t border-slate-100 px-5 py-4 space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-xs font-semibold text-slate-600 w-24 shrink-0 pt-1">세금계산서</span>
              {group.invoice ? (
                <div className="flex-1 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-xs text-slate-700">{group.invoice.invoiceNumber}</span>
                  <span className="text-xs text-slate-500">{fmtDate(group.invoice.issuedAt)}</span>
                  <span className="text-xs text-slate-500">공급가 {fmtWon(group.invoice.supplyAmount)}</span>
                  <span className="text-xs text-slate-500">부가세 {fmtWon(group.invoice.taxAmount)}</span>
                  <span className="text-sm font-bold text-slate-800">{fmtWon(group.invoice.totalAmount)}</span>
                  <StatusBadge label={INVOICE_STATUS[group.invoice.status].label} color={INVOICE_STATUS[group.invoice.status].color} />
                  {/* 공문 발송 - 세금계산서와 동일 행 */}
                  <div className="ml-auto flex items-center gap-2">
                    {lastSent && (
                      <span className="text-xs text-slate-400">마지막 발송 {lastSent.sentAt}</span>
                    )}
                    {canEditEmails && (
                      <button onClick={sendLetter}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">
                        <FiSend size={12} /> 공문 발송
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
                    <input className={`${inp} w-full`} type="date" value={invForm.issuedAt}
                      onChange={(e) => setInvForm((p) => ({ ...p, issuedAt: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">공급가액 (원)</label>
                    <input className={`${inp} w-full`} type="number" value={invForm.supplyAmount}
                      onChange={(e) => handleSupplyChange(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">부가세 (자동)</label>
                    <div className="text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-slate-50 text-slate-600">{fmtWon(invForm.taxAmount)}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">합계</label>
                    <div className="text-sm border border-slate-100 rounded-lg px-3 py-1.5 bg-slate-50 font-bold text-slate-700">{fmtWon(invForm.totalAmount)}</div>
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
                  <span className="text-xs text-slate-500">청구 {fmtWon(group.receivable.billedAmount)}</span>
                  <span className="text-xs text-green-700 font-medium">납부 {fmtWon(group.receivable.paidAmount)}</span>
                  <span className={`text-sm font-bold ${group.receivable.receivableAmount > 0 ? "text-red-600" : "text-slate-400"}`}>
                    미수금 {fmtWon(group.receivable.receivableAmount)}
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
                    <input className={`${inp} w-full`} type="number" min={0} value={rvForm.paidAmount}
                      autoFocus
                      onChange={(e) => setRvForm({ paidAmount: Number(e.target.value) })} />
                  </div>
                  <div className="pb-0.5">
                    <p className="text-xs text-slate-400 mb-1">미수금 (자동)</p>
                    <p className={`text-sm font-bold ${Math.max(0, (group.invoice?.totalAmount ?? 0) - rvForm.paidAmount) > 0 ? "text-red-600" : "text-slate-400"}`}>
                      {fmtWon(Math.max(0, (group.invoice?.totalAmount ?? 0) - rvForm.paidAmount))}
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
                <span className="text-sm font-bold text-amber-600">{fmtWon(group.unclaimed.amount)}</span>
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
  const { projects, termFees, taxInvoices, receivables, unclaimedFees } = useStore();

  const project = projects.find((p) => p.id === projectId) ?? null;

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

  if (termGroups.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 py-16 text-center">
        <p className="text-sm text-slate-400">연차별 수수료 내역이 없습니다</p>
        <p className="text-xs text-slate-300 mt-1">수수료 관리 메뉴에서 연차 수수료를 먼저 생성해 주세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {termGroups.map((group) => (
        <TermSection
          key={group.key}
          group={group}
          projectNumber={project.projectNumber}
          leadInstitutionId={project.leadInstitutionId}
          leadInstitutionName={project.leadInstitutionName}
        />
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { projects } = useStore();
  const [activeTab, setActiveTab] = useState<"info" | "fees">("info");

  const project = projects.find((p) => p.id === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">과제를 찾을 수 없습니다</p>
        <Link href="/projects" className="text-xs text-blue-600 hover:underline">← 과제 목록으로</Link>
      </div>
    );
  }

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
          <StatusBadge label={PROJECT_STATUS[project.status].label} color={PROJECT_STATUS[project.status].color} />
        </div>
      </div>

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
    </div>
  );
}
