import { useSyncExternalStore } from "react";
import { getCurrentUser } from "./auth";
import { calcTermFee, resolvePolicy, normalizeGrade, getMemberAmount, isSettlementTerm, type CalcMember } from "./fee-calculator";
import {
  institutions as initialInstitutions,
  projects as initialProjects,
  projectMembers as initialProjectMembers,
  feePolicies as initialFeePolicies,
  termFees as initialTermFees,
  termFeeCalcs as initialTermFeeCalcs,
  unclaimedFees as initialUnclaimed,
  receivables as initialReceivables,
  settlements as initialSettlements,
  taxInvoices as initialInvoices,
  emailDispatches as initialEmails,
  systemUsers as initialUsers,
  projectIssues as initialIssues,
  fundingAgencies as initialFundingAgencies,
  agencyNoticeTemplates as initialAgencyNoticeTemplates,
  notices as initialNotices,
  standardAttachments as initialStandardAttachments,
  type Institution,
  type Project,
  type ProjectMember,
  type FeePolicy,
  type TermFee,
  type TermFeeCalc,
  type FeeOverride,
  type UnclaimedFee,
  type Receivable,
  type Settlement,
  type TaxInvoice,
  type EmailDispatch,
  type SystemUser,
  type ProjectIssue,
  type FundingAgency,
  type AgencyGuideTab,
  type AgencyNoticeTemplate,
  type AgencyNoticeTemplateEntry,
  type Notice,
  type StandardAttachment,
} from "./mock";

export type { TermFeeCalc, FeeOverride };

// ============================================================
// Audit
// ============================================================

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  changedFields?: Record<string, { before: unknown; after: unknown }>;
  performedBy: string;
  performedAt: string;
}

export { type FundingAgency };

export const ENTITY_NAMES: Record<string, string> = {
  fundingAgency: "전담기관",
  institution: "기관",
  project: "과제",
  projectMember: "참여기관",
  feePolicy: "수수료정책",
  termFee: "연차수수료",
  unclaimed: "미청구액",
  receivable: "미수금",
  settlement: "정산",
  taxInvoice: "세금계산서",
  user: "사용자",
  projectIssue: "이슈/메모",
  notice: "공지사항",
  standardAttachment: "표준 첨부서류",
};

// ============================================================
// Store State
// ============================================================

interface StoreState {
  fundingAgencies: FundingAgency[];
  institutions: Institution[];
  projects: Project[];
  projectMembers: ProjectMember[];
  feePolicies: FeePolicy[];
  termFees: TermFee[];
  termFeeCalcs: TermFeeCalc[];
  unclaimedFees: UnclaimedFee[];
  receivables: Receivable[];
  settlements: Settlement[];
  taxInvoices: TaxInvoice[];
  emailDispatches: EmailDispatch[];
  users: SystemUser[];
  projectIssues: ProjectIssue[];
  notices: Notice[];
  notificationState: Record<string, { readIds: string[]; dismissedIds: string[] }>;
  auditLog: AuditEntry[];
  agencyGuides: Record<string, AgencyGuideTab[]>;
  agencyNoticeTemplates: AgencyNoticeTemplateEntry[];
  standardAttachments: StandardAttachment[];
}

const INITIAL_AUDIT_LOG: AuditEntry[] = [
  {
    id: "audit-init-001",
    entityType: "project",
    entityId: "p-001",
    entityLabel: "초분산 탄성 에너지 저장 소재 기반 인공근육 시스템 개발",
    action: "CREATE",
    performedBy: "김관리",
    performedAt: "2024-03-05 09:12:00",
  },
  {
    id: "audit-init-002",
    entityType: "project",
    entityId: "p-002",
    entityLabel: "고성능 전고체 배터리 핵심소재 개발 및 실증",
    action: "CREATE",
    performedBy: "김관리",
    performedAt: "2024-03-10 10:30:00",
  },
  {
    id: "audit-init-003",
    entityType: "projectMember",
    entityId: "pm-001",
    entityLabel: "삼화전자(주) — RS-2024-00214837",
    action: "UPDATE",
    changedFields: {
      institutionGrade: { before: "일반", after: "A~C" },
      budget: { before: 450000000, after: 520000000 },
    },
    performedBy: "이회계",
    performedAt: "2024-04-02 14:05:00",
  },
  {
    id: "audit-init-004",
    entityType: "termFee",
    entityId: "tf-p001-2024-1",
    entityLabel: "RS-2024-00214837 · 2024년 1연차",
    action: "UPDATE",
    changedFields: {
      status: { before: "DRAFT", after: "CONFIRMED" },
      appliedFee: { before: 0, after: 18200000 },
    },
    performedBy: "김관리",
    performedAt: "2024-05-15 11:20:00",
  },
  {
    id: "audit-init-005",
    entityType: "taxInvoice",
    entityId: "inv-2024-001",
    entityLabel: "RS-2024-00214837 · 2024년 1연차 세금계산서",
    action: "CREATE",
    performedBy: "김관리",
    performedAt: "2024-05-20 09:45:00",
  },
  {
    id: "audit-init-006",
    entityType: "receivable",
    entityId: "rv-2024-001",
    entityLabel: "RS-2024-00214837 · 2024년 1연차 수금",
    action: "UPDATE",
    changedFields: {
      paidAmount: { before: 0, after: 10010000 },
      status: { before: "PENDING", after: "PARTIAL" },
    },
    performedBy: "이회계",
    performedAt: "2024-07-08 13:30:00",
  },
  {
    id: "audit-init-007",
    entityType: "projectIssue",
    entityId: "pi-001",
    entityLabel: "RS-2024-00214837 이슈 등록",
    action: "CREATE",
    performedBy: "김관리",
    performedAt: "2024-11-20 14:30:00",
  },
  {
    id: "audit-init-008",
    entityType: "project",
    entityId: "p-001",
    entityLabel: "초분산 탄성 에너지 저장 소재 기반 인공근육 시스템 개발",
    action: "UPDATE",
    changedFields: {
      status: { before: "ACTIVE", after: "ACTIVE" },
      currentTerm: { before: 1, after: 2 },
    },
    performedBy: "김관리",
    performedAt: "2025-01-10 10:00:00",
  },
  {
    id: "audit-init-009",
    entityType: "projectIssue",
    entityId: "pi-003",
    entityLabel: "RS-2024-00198321 이슈",
    action: "UPDATE",
    changedFields: {
      status: { before: "OPEN", after: "IN_PROGRESS" },
      priority: { before: "HIGH", after: "HIGH" },
    },
    performedBy: "이회계",
    performedAt: "2025-02-14 16:55:00",
  },
  {
    id: "audit-init-010",
    entityType: "unclaimed",
    entityId: "unc-001",
    entityLabel: "RS-2024-00214837 · 2024년 1연차 미청구액",
    action: "UPDATE",
    changedFields: {
      carriedOver: { before: false, after: true },
      status: { before: "PENDING", after: "CARRIED_OVER" },
    },
    performedBy: "김관리",
    performedAt: "2025-03-03 09:20:00",
  },
];

let _state: StoreState = {
  fundingAgencies: [...initialFundingAgencies],
  institutions: [...initialInstitutions],
  projects: [...initialProjects],
  projectIssues: [...initialIssues],
  projectMembers: [...initialProjectMembers],
  feePolicies: [...initialFeePolicies],
  termFees: [...initialTermFees],
  termFeeCalcs: [...initialTermFeeCalcs],
  unclaimedFees: [...initialUnclaimed],
  receivables: [...initialReceivables],
  settlements: [...initialSettlements],
  taxInvoices: [...initialInvoices],
  emailDispatches: [...initialEmails],
  users: [...initialUsers],
  notices: [...initialNotices],
  notificationState: {},
  auditLog: [...INITIAL_AUDIT_LOG],
  agencyGuides: {},
  agencyNoticeTemplates: [...initialAgencyNoticeTemplates],
  standardAttachments: [...initialStandardAttachments],
};

const _listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return _state;
}

function notify(): void {
  _listeners.forEach((l) => l());
}

let _idSeq = 0;
function genId(prefix: string): string {
  _idSeq += 1;
  return `${prefix}-${Date.now()}-${_idSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

function diff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { before: unknown; after: unknown }> | undefined {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "id") continue;
    if (String(before[k]) !== String(after[k])) {
      changes[k] = { before: before[k], after: after[k] };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

function record(
  entityType: string,
  entityId: string,
  entityLabel: string,
  action: AuditEntry["action"],
  changedFields?: AuditEntry["changedFields"]
): void {
  const entry: AuditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    entityType,
    entityId,
    entityLabel,
    action,
    changedFields,
    performedBy: getCurrentUser()?.name ?? "시스템",
    performedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  _state = { ..._state, auditLog: [entry, ..._state.auditLog] };
}

// ============================================================
// FUNDING AGENCIES (전담기관)
// ============================================================

export function addFundingAgency(data: Omit<FundingAgency, "id">): FundingAgency {
  const item: FundingAgency = { ...data, id: genId("fa") };
  _state = { ..._state, fundingAgencies: [..._state.fundingAgencies, item] };
  record("fundingAgency", item.id, item.name, "CREATE");
  notify();
  return item;
}

export function updateFundingAgency(id: string, data: Partial<FundingAgency>): void {
  const before = _state.fundingAgencies.find((a) => a.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, fundingAgencies: _state.fundingAgencies.map((a) => (a.id === id ? after : a)) };
  record("fundingAgency", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

export function deleteFundingAgency(id: string): void {
  const item = _state.fundingAgencies.find((a) => a.id === id);
  if (!item) return;
  _state = { ..._state, fundingAgencies: _state.fundingAgencies.filter((a) => a.id !== id) };
  record("fundingAgency", id, item.name, "DELETE");
  notify();
}

// ============================================================
// INSTITUTIONS (통합 기관)
// ============================================================

export function addInstitution(data: Omit<Institution, "id">): Institution {
  const item: Institution = { ...data, id: genId("inst") };
  _state = { ..._state, institutions: [..._state.institutions, item] };
  record("institution", item.id, item.name, "CREATE");
  notify();
  return item;
}

export function updateInstitution(id: string, data: Partial<Institution>): void {
  const before = _state.institutions.find((i) => i.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, institutions: _state.institutions.map((i) => (i.id === id ? after : i)) };
  record("institution", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

export function deleteInstitution(id: string): void {
  const item = _state.institutions.find((i) => i.id === id);
  if (!item) return;
  _state = { ..._state, institutions: _state.institutions.filter((i) => i.id !== id) };
  record("institution", id, item.name, "DELETE");
  notify();
}

// ============================================================
// PROJECTS
// ============================================================

// 주관기관은 산정기준액(전체 사업비)에 포함되어야 하므로 참여기관 목록에도 role "LEAD"로 있어야 한다.
// 기본정보의 주관기관과 참여기관 목록이 어긋나지 않도록, 아직 목록에 없으면 예산 0원짜리 행으로 자동 추가한다
// (담당자가 이후 등급·연차별 사업비를 채워 넣으면 된다).
function ensureLeadMember(project: Project): void {
  if (!project.leadInstitutionId) return;
  const alreadyMember = _state.projectMembers.some(
    (m) => m.projectId === project.id && m.institutionId === project.leadInstitutionId,
  );
  if (alreadyMember) return;
  const inst = _state.institutions.find((i) => i.id === project.leadInstitutionId);
  addProjectMember({
    projectId: project.id,
    projectNumber: project.projectNumber,
    institutionId: project.leadInstitutionId,
    institutionName: project.leadInstitutionName || inst?.name || "",
    institutionType: inst?.type ?? "중소기업",
    role: "LEAD",
    budget: 0,
    feeRate: 0,
    calculatedFee: 0,
    institutionGrade: "일반",
    settlementType: "위탁정산",
    cashBudget: 0,
    inKindBudget: 0,
  });
}

export function addProject(data: Omit<Project, "id">): Project {
  const item: Project = { registeredAt: new Date().toISOString().slice(0, 10), ...data, id: genId("p") };
  _state = { ..._state, projects: [..._state.projects, item] };
  record("project", item.id, item.projectName, "CREATE");
  ensureLeadMember(item);
  notify();
  return item;
}

// 수수료 산정에 영향을 주는 필드 — 변경 시 해당 과제의 연차별 수수료를 자동 재산정한다.
const PROJECT_FEE_AFFECTING_FIELDS = ["agencyId", "startDate", "totalTerms", "agreementType", "stages", "projectType"] as const;

export function updateProject(id: string, data: Partial<Project>): void {
  const before = _state.projects.find((p) => p.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, projects: _state.projects.map((p) => (p.id === id ? after : p)) };
  record("project", id, after.projectName, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  if (PROJECT_FEE_AFFECTING_FIELDS.some((f) => f in data)) {
    autoGenerateTermFees(id);
  }
  if ("leadInstitutionId" in data) {
    ensureLeadMember(after);
  }
  notify();
}

// 과제 삭제 시 연결된 참여기관·수수료·이슈·미청구액·미수금·세금계산서까지 함께 정리해
// 존재하지 않는 과제를 참조하는 레코드가 남지 않도록 한다 (발송 이력은 과거 발송 사실 자체를 보존하기 위해 남겨둔다).
export function deleteProject(id: string): void {
  const item = _state.projects.find((p) => p.id === id);
  if (!item) return;
  const num = item.projectNumber;
  _state = {
    ..._state,
    projects: _state.projects.filter((p) => p.id !== id),
    projectMembers: _state.projectMembers.filter((m) => m.projectId !== id),
    termFees: _state.termFees.filter((f) => f.projectNumber !== num),
    termFeeCalcs: _state.termFeeCalcs.filter((c) => c.projectNumber !== num),
    projectIssues: _state.projectIssues.filter((i) => i.projectId !== id),
    unclaimedFees: _state.unclaimedFees.filter((u) => u.projectNumber !== num),
    receivables: _state.receivables.filter((r) => r.projectNumber !== num),
    taxInvoices: _state.taxInvoices.filter((t) => t.projectNumber !== num),
  };
  record("project", id, item.projectName, "DELETE");
  notify();
}

// 참여기관 사업비 합계로 과제의 총사업비를 다시 맞춘다 (감사로그를 남기지 않는 파생값 재계산 —
// 엑셀 일괄등록처럼 참여기관을 프로그램적으로 추가/갱신한 뒤 사후 정리 용도).
export function recalcProjectTotalBudget(projectId: string): void {
  const project = _state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const total = _state.projectMembers
    .filter((m) => m.projectId === projectId)
    .reduce((s, m) => s + (m.cashBudget ?? 0) + (m.inKindBudget ?? 0), 0);
  if (total === project.totalBudget) return;
  _state = { ..._state, projects: _state.projects.map((p) => (p.id === projectId ? { ...p, totalBudget: total } : p)) };
  notify();
}

// ============================================================
// PROJECT MEMBERS (참여기관)
// ============================================================

export function addProjectMember(data: Omit<ProjectMember, "id">): ProjectMember {
  const item: ProjectMember = { ...data, id: genId("pm") };
  _state = { ..._state, projectMembers: [..._state.projectMembers, item] };
  record("projectMember", item.id, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  autoGenerateTermFees(item.projectId);
  notify();
  return item;
}

// 수수료 산정에 영향을 주는 필드 — 변경 시 해당 과제의 연차별 수수료를 자동 재산정한다.
const FEE_AFFECTING_FIELDS = ["budget", "cashBudget", "inKindBudget", "institutionGrade", "settlementType", "annualBudgets", "role"] as const;

export function updateProjectMember(id: string, data: Partial<ProjectMember>): void {
  const before = _state.projectMembers.find((m) => m.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, projectMembers: _state.projectMembers.map((m) => (m.id === id ? after : m)) };
  record("projectMember", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  if (FEE_AFFECTING_FIELDS.some((f) => f in data)) {
    autoGenerateTermFees(before.projectId);
  }
  notify();
}

export function deleteProjectMember(id: string): void {
  const item = _state.projectMembers.find((m) => m.id === id);
  if (!item) return;
  _state = { ..._state, projectMembers: _state.projectMembers.filter((m) => m.id !== id) };
  record("projectMember", id, `${item.projectNumber} · ${item.institutionName}`, "DELETE");
  autoGenerateTermFees(item.projectId);
  notify();
}

// ============================================================
// FEE POLICIES (수수료 기준 정책 — 버전 이력 포함)
// ============================================================

export function addFeePolicy(data: Omit<FeePolicy, "id">): FeePolicy {
  const item: FeePolicy = { ...data, id: genId("pol") };
  _state = { ..._state, feePolicies: [..._state.feePolicies, item] };
  record("feePolicy", item.id, item.name, "CREATE");
  recalcProjectsUsingPolicy(item.id);
  notify();
  return item;
}

export function updateFeePolicy(id: string, data: Partial<FeePolicy>): void {
  const before = _state.feePolicies.find((p) => p.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, feePolicies: _state.feePolicies.map((p) => (p.id === id ? after : p)) };
  record("feePolicy", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  recalcProjectsUsingPolicy(id);
  notify();
}

// 정책 변경이 실제로 적용되는(resolvePolicy가 이 정책으로 귀결되는) 과제들만 골라 연차별 수수료를 재산정한다.
// CONFIRMED/BILLED로 확정된 연차는 autoGenerateTermFees 내부에서 보존되므로 여기서도 그대로 안전하다.
function recalcProjectsUsingPolicy(policyId: string): void {
  for (const project of _state.projects) {
    const resolved = resolvePolicy(project.agencyId, _state.feePolicies, project.programType ?? "GENERAL");
    if (resolved?.id === policyId) autoGenerateTermFees(project.id);
  }
}

// ============================================================
// TERM FEE CALCS (과제단위 수수료 산정 내역)
// ============================================================

export function addTermFeeCalc(data: Omit<TermFeeCalc, "id">): TermFeeCalc {
  const item: TermFeeCalc = { ...data, id: genId("tfc") };
  _state = { ..._state, termFeeCalcs: [..._state.termFeeCalcs, item] };
  record("termFeeCalc", item.id, `${item.projectNumber} · ${item.termYear}년 ${item.termNumber}연차`, "CREATE");
  notify();
  return item;
}

export function updateTermFeeCalc(id: string, data: Partial<TermFeeCalc>): void {
  const before = _state.termFeeCalcs.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data, updatedAt: new Date().toISOString().slice(0, 10) };
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === id ? after : f)) };
  record("termFeeCalc", id, `${after.projectNumber} · ${after.termYear}년 ${after.termNumber}연차`, "UPDATE",
    diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

export function addTermFeeCalcOverride(
  id: string,
  override: FeeOverride,
): void {
  const before = _state.termFeeCalcs.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, overrides: [...before.overrides, override], updatedAt: new Date().toISOString().slice(0, 10) };
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === id ? after : f)) };
  record("termFeeCalc", id, `${after.projectNumber} 오버라이드 추가`, "UPDATE");
  notify();
}

export function deleteTermFeeCalc(id: string): void {
  const item = _state.termFeeCalcs.find((f) => f.id === id);
  if (!item) return;
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.filter((f) => f.id !== id) };
  record("termFeeCalc", id, item.projectNumber, "DELETE");
  notify();
}

// ============================================================
// TERM FEES (연차별 수수료 산정 내역)
// ============================================================

export function addTermFee(data: Omit<TermFee, "id">): TermFee {
  const item: TermFee = { ...data, id: genId("tf") };
  _state = { ..._state, termFees: [..._state.termFees, item] };
  record("termFee", item.id, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  notify();
  return item;
}

export function updateTermFee(id: string, data: Partial<TermFee>): void {
  const before = _state.termFees.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, termFees: _state.termFees.map((f) => (f.id === id ? after : f)) };
  record("termFee", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ============================================================
// UNCLAIMED FEES
// ============================================================

export function addUnclaimedFee(data: Omit<UnclaimedFee, "id">): UnclaimedFee {
  const item: UnclaimedFee = { ...data, id: genId("uc") };
  _state = { ..._state, unclaimedFees: [..._state.unclaimedFees, item] };
  record("unclaimed", item.id, `${item.projectNumber} · ${item.leadInstitutionName}`, "CREATE");
  notify();
  return item;
}

export function updateUnclaimedFee(id: string, data: Partial<UnclaimedFee>): void {
  const before = _state.unclaimedFees.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, unclaimedFees: _state.unclaimedFees.map((f) => (f.id === id ? after : f)) };
  record("unclaimed", id, `${after.projectNumber} · ${after.leadInstitutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ============================================================
// RECEIVABLES
// ============================================================

export function addReceivable(data: Omit<Receivable, "id">): Receivable {
  const item: Receivable = { ...data, id: genId("rv") };
  _state = { ..._state, receivables: [..._state.receivables, item] };
  record("receivable", item.id, `${item.projectNumber} · ${item.leadInstitutionName}`, "CREATE");
  notify();
  return item;
}

export function updateReceivable(id: string, data: Partial<Receivable>): void {
  const before = _state.receivables.find((r) => r.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, receivables: _state.receivables.map((r) => (r.id === id ? after : r)) };
  record("receivable", id, `${after.projectNumber} · ${after.leadInstitutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ============================================================
// SETTLEMENTS
// ============================================================

export function addSettlement(data: Omit<Settlement, "id">): Settlement {
  const item: Settlement = { ...data, id: genId("st") };
  _state = { ..._state, settlements: [..._state.settlements, item] };
  record("settlement", item.id, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  notify();
  return item;
}

export function updateSettlement(id: string, data: Partial<Settlement>): void {
  const before = _state.settlements.find((s) => s.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, settlements: _state.settlements.map((s) => (s.id === id ? after : s)) };
  record("settlement", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ============================================================
// PROJECT ISSUES (이슈/메모)
// ============================================================

export function addProjectIssue(data: Omit<ProjectIssue, "id">): ProjectIssue {
  const item: ProjectIssue = { ...data, id: genId("pi") };
  _state = { ..._state, projectIssues: [..._state.projectIssues, item] };
  record("projectIssue", item.id, `${item.projectNumber} 이슈`, "CREATE");
  notify();
  return item;
}

export function updateProjectIssue(id: string, changes: Partial<Omit<ProjectIssue, "id">>): void {
  _state = {
    ..._state,
    projectIssues: _state.projectIssues.map((i) => (i.id === id ? { ...i, ...changes } : i)),
  };
  record("projectIssue", id, "이슈 업데이트", "UPDATE");
  notify();
}

export function deleteProjectIssue(id: string): void {
  _state = { ..._state, projectIssues: _state.projectIssues.filter((i) => i.id !== id) };
  record("projectIssue", id, "이슈 삭제", "DELETE");
  notify();
}

// ============================================================
// NOTICES (공지사항)
// ============================================================

export function addNotice(data: Omit<Notice, "id">): Notice {
  const item: Notice = { ...data, id: genId("notice") };
  _state = { ..._state, notices: [item, ..._state.notices] };
  record("notice", item.id, item.title, "CREATE");
  notify();
  return item;
}

export function deleteNotice(id: string): void {
  const item = _state.notices.find((n) => n.id === id);
  if (!item) return;
  _state = { ..._state, notices: _state.notices.filter((n) => n.id !== id) };
  record("notice", id, item.title, "DELETE");
  notify();
}

// ============================================================
// NOTIFICATION STATE (사용자별 알림 읽음/삭제 상태 — 감사로그 기록 안 함)
// ============================================================

function getNotifState(userId: string): { readIds: string[]; dismissedIds: string[] } {
  return _state.notificationState[userId] ?? { readIds: [], dismissedIds: [] };
}

export function markNotificationRead(userId: string, id: string): void {
  const cur = getNotifState(userId);
  if (cur.readIds.includes(id)) return;
  _state = {
    ..._state,
    notificationState: { ..._state.notificationState, [userId]: { ...cur, readIds: [...cur.readIds, id] } },
  };
  notify();
}

export function markAllNotificationsRead(userId: string, ids: string[]): void {
  const cur = getNotifState(userId);
  const merged = Array.from(new Set([...cur.readIds, ...ids]));
  _state = {
    ..._state,
    notificationState: { ..._state.notificationState, [userId]: { ...cur, readIds: merged } },
  };
  notify();
}

export function dismissNotification(userId: string, id: string): void {
  const cur = getNotifState(userId);
  if (cur.dismissedIds.includes(id)) return;
  _state = {
    ..._state,
    notificationState: { ..._state.notificationState, [userId]: { ...cur, dismissedIds: [...cur.dismissedIds, id] } },
  };
  notify();
}

// ============================================================
// TAX INVOICES
// ============================================================

export function addTaxInvoice(data: Omit<TaxInvoice, "id">): TaxInvoice {
  const item: TaxInvoice = { ...data, id: genId("ti") };
  _state = { ..._state, taxInvoices: [..._state.taxInvoices, item] };
  record("taxInvoice", item.id, item.invoiceNumber, "CREATE");
  notify();
  return item;
}

export function updateTaxInvoice(id: string, data: Partial<TaxInvoice>): void {
  const before = _state.taxInvoices.find((t) => t.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, taxInvoices: _state.taxInvoices.map((t) => (t.id === id ? after : t)) };
  record("taxInvoice", id, after.invoiceNumber, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ─── 세금계산서 미발행 연차 집계 (연차별 청구액 확정 O, 세금계산서 발행 X) ───
export interface UnissuedInvoiceGroup {
  key: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  termYear: number;
  termNumber: number;
  amount: number; // 미발행 공급가액 (연차 신청수수료 합계)
  currentTerm: number;
  projectStatus: Project["status"];
  fees: TermFee[];
}

export function getUnissuedInvoiceGroups(
  projects: Project[],
  termFees: TermFee[],
  taxInvoices: TaxInvoice[],
): UnissuedInvoiceGroup[] {
  const grouped = new Map<string, TermFee[]>();
  termFees.forEach((f) => {
    const k = `${f.projectNumber}|${f.termYear}|${f.termNumber}`;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(f);
  });

  const result: UnissuedInvoiceGroup[] = [];
  grouped.forEach((fees, key) => {
    const amount = fees.reduce((s, f) => s + f.appliedFee, 0);
    if (amount <= 0) return;
    const [projectNumber, yStr, nStr] = key.split("|");
    const termYear = Number(yStr);
    const termNumber = Number(nStr);
    const hasInvoice = taxInvoices.some(
      (t) => t.projectNumber === projectNumber && t.termYear === termYear && t.termNumber === termNumber,
    );
    if (hasInvoice) return;
    const project = projects.find((p) => p.projectNumber === projectNumber);
    if (!project) return;
    result.push({
      key,
      projectId: project.id,
      projectNumber,
      projectName: fees[0].projectName,
      leadInstitutionName: project.leadInstitutionName,
      termYear,
      termNumber,
      amount,
      currentTerm: project.currentTerm,
      projectStatus: project.status,
      fees,
    });
  });

  return result.sort((a, b) =>
    b.termYear !== a.termYear ? b.termYear - a.termYear : b.termNumber - a.termNumber,
  );
}

// ============================================================
// EMAIL DISPATCHES
// ============================================================

export function addEmailDispatch(data: Omit<EmailDispatch, "id">): EmailDispatch {
  const item: EmailDispatch = { ...data, id: genId("em") };
  _state = { ..._state, emailDispatches: [..._state.emailDispatches, item] };
  notify();
  return item;
}

// ============================================================
// STANDARD ATTACHMENTS (공문 표준 첨부서류 — 사업자등록증 등 일괄 관리)
// ============================================================

export function updateStandardAttachment(id: string, data: Partial<Omit<StandardAttachment, "id">>): void {
  const before = _state.standardAttachments.find((a) => a.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, standardAttachments: _state.standardAttachments.map((a) => (a.id === id ? after : a)) };
  record("standardAttachment", id, after.name, "UPDATE");
  notify();
}

// ============================================================
// USERS
// ============================================================

export function addUser(data: Omit<SystemUser, "id">): SystemUser {
  const item: SystemUser = { ...data, id: genId("u") };
  _state = { ..._state, users: [..._state.users, item] };
  record("user", item.id, item.name, "CREATE");
  notify();
  return item;
}

export function updateUser(id: string, data: Partial<SystemUser>): void {
  const before = _state.users.find((u) => u.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, users: _state.users.map((u) => (u.id === id ? after : u)) };
  record("user", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

/** 하이웍스 메일 연동 정보 저장. 조회 전용(VIEWER) 계정은 대상에서 제외되며,
 *  비밀번호 값은 변경이력에 원문이 남지 않도록 마스킹해서 기록한다. */
export function updateUserHiworksCredentials(
  id: string,
  data: { hiworksEmail?: string; hiworksMailPassword?: string }
): void {
  const before = _state.users.find((u) => u.id === id);
  if (!before || before.role === "VIEWER") return;

  const after = { ...before, ...data };
  _state = { ..._state, users: _state.users.map((u) => (u.id === id ? after : u)) };

  const changedFields: Record<string, { before: unknown; after: unknown }> = {};
  if (data.hiworksEmail !== undefined && data.hiworksEmail !== before.hiworksEmail) {
    changedFields.hiworksEmail = { before: before.hiworksEmail ?? "미등록", after: data.hiworksEmail };
  }
  if (data.hiworksMailPassword !== undefined && data.hiworksMailPassword !== before.hiworksMailPassword) {
    changedFields.hiworksMailPassword = { before: before.hiworksMailPassword ? "등록됨" : "미등록", after: "등록됨" };
  }
  record("user", id, after.name, "UPDATE", Object.keys(changedFields).length > 0 ? changedFields : undefined);
  notify();
}

export function deleteUser(id: string): void {
  const item = _state.users.find((u) => u.id === id);
  if (!item) return;
  _state = { ..._state, users: _state.users.filter((u) => u.id !== id) };
  record("user", id, item.name, "DELETE");
  notify();
}

// ============================================================
// AGENCY GUIDES (전담기관 운용 안내)
// ============================================================

export function updateAgencyGuide(shortName: string, tabs: AgencyGuideTab[]): void {
  _state = { ..._state, agencyGuides: { ..._state.agencyGuides, [shortName]: tabs } };
  record("fundingAgency", shortName, `${shortName} 운용 안내`, "UPDATE");
  notify();
}

// ============================================================
// AGENCY NOTICE TEMPLATES (전담기관 공문 템플릿)
// ============================================================

export function addAgencyNoticeTemplate(
  agencyShortName: string,
  name: string,
  content: AgencyNoticeTemplate
): AgencyNoticeTemplateEntry {
  const item: AgencyNoticeTemplateEntry = { id: genId("ant"), agencyShortName, name, content };
  _state = { ..._state, agencyNoticeTemplates: [..._state.agencyNoticeTemplates, item] };
  record("fundingAgency", agencyShortName, `${agencyShortName} 공문 템플릿 등록 (${name})`, "CREATE");
  notify();
  return item;
}

export function updateAgencyNoticeTemplate(
  id: string,
  data: Partial<Pick<AgencyNoticeTemplateEntry, "name" | "content">>
): void {
  const before = _state.agencyNoticeTemplates.find((t) => t.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.map((t) => (t.id === id ? after : t)) };
  record("fundingAgency", after.agencyShortName, `${after.agencyShortName} 공문 템플릿 수정 (${after.name})`, "UPDATE");
  notify();
}

export function deleteAgencyNoticeTemplate(id: string): void {
  const item = _state.agencyNoticeTemplates.find((t) => t.id === id);
  if (!item) return;
  _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.filter((t) => t.id !== id) };
  record("fundingAgency", item.agencyShortName, `${item.agencyShortName} 공문 템플릿 삭제 (${item.name})`, "DELETE");
  notify();
}

// ============================================================
// 연차 수수료 자동 산정
// ============================================================

export function autoGenerateTermFees(projectId: string): void {
  const project = _state.projects.find((p) => p.id === projectId);
  if (!project) return;
  // 완료된 과제는 정책·기관정보가 바뀌어도 재산정 대상에서 제외 — 과거 확정 내역을 그대로 보존한다.
  if (project.status === "COMPLETED") return;

  const members = _state.projectMembers.filter((m) => m.projectId === projectId);
  const policy = resolvePolicy(project.agencyId, _state.feePolicies, project.programType ?? "GENERAL");
  if (!policy) return;

  const today = new Date().toISOString().slice(0, 10);
  const startDate = new Date(project.startDate);

  // 협약 유형 파악
  const isBatch = !project.agreementType || project.agreementType === "BATCH";
  const stages = project.stages ?? [];

  // 연차 → 단계 매핑 헬퍼
  function getStageNumber(termNumber: number): number {
    if (isBatch) return 0;
    const stage = stages.find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
    return stage?.stageNumber ?? 1;
  }

  // CONFIRMED/BILLED로 확정된 연차별 항목은 자동/수동 생성 여부와 무관하게 보존한다.
  const keptFees = _state.termFees.filter(
    (tf) => tf.projectNumber !== project.projectNumber ||
      tf.status === "CONFIRMED" || tf.status === "BILLED"
  );
  // 이미 확정되어 보존되는 기관×연차 조합 — 아래 생성 루프에서 덮어쓰지 않도록 건너뛴다.
  const lockedKeys = new Set(
    keptFees
      .filter((tf) => tf.projectNumber === project.projectNumber)
      .map((tf) => `${tf.termYear}|${tf.termNumber}|${tf.institutionId}`)
  );
  const keptCalcs = _state.termFeeCalcs.filter(
    (c) => !(c.projectNumber === project.projectNumber && c.status === "DRAFT")
  );

  const newFees: TermFee[] = [];
  const newCalcs: TermFeeCalc[] = [];

  // 단계별 미청구 누적 (단계가 바뀌면 리셋 — 정산 시 이전 단계 미청구 반영)
  // stageUnclaimed: 단계 전체 합계(집계 표시용, TermFeeCalc에 그대로 저장).
  // stageUnclaimedByInst: 기관별 누적분 — 정산 연차에 "그 기관 자신이 미뤄온 몫"만 정확히 청구하기 위해
  // 별도로 추적한다. 합계만 쌓아두고 정산 연차 시점의 사업비 비율로 재배분하면, 기관별 사업비 비중이
  // 연차마다 달라지는 경우 실제로 미뤘던 기관과 다른 기관이 그 몫을 떠안는 오류가 생긴다.
  const stageUnclaimed: Record<number, number> = {};
  const stageUnclaimedByInst: Record<number, Record<string, number>> = {};
  // stageExemptUnclaimedByInst: 면제기관(DISCOUNT 모드 자체정산)이 연차상시 동안 미뤄온 몫(연차상시엔
  // 청구하지 않고 매출비용으로 소멸시키는 게 기본).단, 정산 연차에 그 기관이 위탁정산으로 전환해
  // 일반기관 취급을 받게 되면(exemptBreakdown에서 빠지고 nonExempt로 재분류), 자체정산이던 동안 쌓인
  // 미청구분을 그제서야 함께 청구해야 한다 — 그렇지 않으면 전환 시점에 과거 미청구분이 그냥 사라진다.
  const stageExemptUnclaimedByInst: Record<number, Record<string, number>> = {};

  for (let termNumber = 1; termNumber <= project.totalTerms; termNumber++) {
    const termStartDate = new Date(startDate);
    termStartDate.setFullYear(startDate.getFullYear() + termNumber - 1);
    const termStartStr = termStartDate.toISOString().slice(0, 10);
    const termYear = termStartDate.getFullYear();

    const isActive = termStartStr <= today;
    const feeStatus: TermFee["status"] = isActive ? "DRAFT" : "SCHEDULED";
    const stageNumber = getStageNumber(termNumber);
    const workType: "ANNUAL" | "SETTLEMENT" = isSettlementTerm(project, termNumber) ? "SETTLEMENT" : "ANNUAL";

    // 단계 내 누적 미청구 계산
    const carriedOverUnclaimed = stageUnclaimed[stageNumber] ?? 0;

    // 이 연차에 예산이 있는 기관만 추출
    const calcMembers: CalcMember[] = [];
    for (const m of members) {
      const ab = m.annualBudgets?.find((b) => b.termNumber === termNumber);
      if (!ab || ab.cashBudget <= 0) continue;
      calcMembers.push({
        institutionId: m.institutionId,
        institutionName: m.institutionName,
        role: m.role,
        grade: normalizeGrade(m.institutionGrade ?? "일반"),
        institutionType: m.institutionType,
        settlementType: m.settlementType ?? policy.defaultSettlementType ?? "자체정산",
        cashBudget: ab.cashBudget,
        inKindBudget: ab.inKindBudget,
      });
    }
    if (calcMembers.length === 0) continue;

    const result = calcTermFee({
      members: calcMembers,
      workType,
      policy,
      projectType: project.projectType ?? "GENERAL",
      carriedOverUnclaimed,
    });

    // 면제기관 / 완전제외기관 ID 집합
    const exemptIds = new Set(result.exemptBreakdown.map((e) => e.institutionId));
    const excludedIds = new Set(result.excludedInstitutionIds);
    const feeBasis = policy.feeBasis ?? "CASH";
    const nonExemptMembers = calcMembers.filter(
      (m) => !exemptIds.has(m.institutionId) && !excludedIds.has(m.institutionId)
    );
    const totalNonExemptCash = nonExemptMembers.reduce((s, m) => s + getMemberAmount(m, feeBasis), 0);

    // 이번 연차에 기관별로 새로 미뤄지는 몫(ANNUAL일 때만 채움) — 연차 루프가 끝난 뒤
    // stageUnclaimedByInst에 합산한다.
    const instAnnualUnclaimed: Record<string, number> = {};
    // 면제기관이 이번 연차(ANNUAL)에 새로 미루는 몫 — 연차 루프가 끝난 뒤 stageExemptUnclaimedByInst에 합산한다.
    const instAnnualExemptUnclaimed: Record<string, number> = {};
    // 이번 정산 연차에 "면제기관 → 일반기관 전환"으로 과거 미청구분을 함께 걷은 총액(집계용 totalBillingFee 보정에 사용).
    let exemptCarryoverBilledThisTerm = 0;

    // 기관별 TermFee 생성 — 이미 확정(CONFIRMED/BILLED)되어 보존 중인 기관×연차는 새로 생성하지 않는다.
    // 단, 이월액 집계(instAnnualUnclaimed → stageUnclaimedByInst)는 확정 여부와 무관하게 항상 계산해야 한다 —
    // 그렇지 않으면 그 연차가 확정되는 순간 해당 기관들의 미청구 몫이 이후 정산 연차 집계에서 통째로 빠지는 오류가 생긴다.
    for (const cm of calcMembers) {
      const isLocked = lockedKeys.has(`${termYear}|${termNumber}|${cm.institutionId}`);

      const member = members.find((m) => m.institutionId === cm.institutionId);
      const ab = member?.annualBudgets?.find((b) => b.termNumber === termNumber);

      let instCalcFee: number;
      let instAppliedFee: number;

      const perInst = result.perInstitutionFees?.find((e) => e.institutionId === cm.institutionId);

      if (excludedIds.has(cm.institutionId)) {
        // exemptionMode "EXCLUDE" 등급(또는 excludeLeadFromCalc 주관기관) — 산정기준액에서 완전히 빠지므로 수수료 없음
        instCalcFee = 0;
        instAppliedFee = 0;
      } else if (perInst) {
        // calcMode "PER_INSTITUTION" — 기관별로 각자의 사업비를 구간표에 대입해 개별 산정한 값을 그대로 사용
        instCalcFee = perInst.calculatedFee;
        instAppliedFee = perInst.billingFee;
      } else if (exemptIds.has(cm.institutionId)) {
        const ed = result.exemptBreakdown.find((e) => e.institutionId === cm.institutionId);
        instCalcFee = ed?.calculatedFee ?? 0;
        instAppliedFee = ed?.billingFee ?? 0;
        // 면제기관이 연차상시 동안 미루는 몫만 추적한다 — 정산 연차까지 자체정산을 유지해 계속
        // 면제기관으로 남으면(이 분기 자체), 그 미청구분은 매출비용으로 소멸시키는 게 기본 처리라
        // 더 이상 추적하지 않는다(정산 연차에 도달한 시점엔 stageExemptUnclaimedByInst가 리셋된다).
        if (workType === "ANNUAL") {
          instAnnualExemptUnclaimed[cm.institutionId] = ed?.unclaimedFee ?? 0;
        }
      } else {
        // 이 기관의 일반수수료(generalFee) 몫 — 반올림 전 값으로 유지해야 아래 이월액 계산이
        // 반올림 오차 없이 정확해진다.
        const ratio = totalNonExemptCash > 0 ? getMemberAmount(cm, feeBasis) / totalNonExemptCash : 0;
        const instShare = result.generalFee * ratio;
        instCalcFee = Math.round(instShare);

        if (workType === "SETTLEMENT") {
          // 정산 연차: 이 기관 자신이 그동안 미뤄온 몫(stageUnclaimedByInst)만 더해서 청구한다.
          // (전체를 합쳐서 이번 연차 비율로 재배분하면, 기관별 사업비 비중이 연차마다 달라질 때
          //  실제로 미뤘던 기관과 다른 기관이 그 몫을 떠안는 오류가 생긴다.)
          const ownCarried = stageUnclaimedByInst[stageNumber]?.[cm.institutionId] ?? 0;
          // 이 기관이 연차상시 동안엔 면제기관(자체정산)이었다가 정산 연차에 위탁정산으로 전환해
          // 일반기관 취급을 받는 경우 — 자체정산이던 동안 쌓인 미청구분을 여기서 함께 청구한다.
          // (그대로 두면 전환 시점에 그 미청구분이 아무 데도 반영되지 않고 사라진다.)
          const ownExemptCarried = stageExemptUnclaimedByInst[stageNumber]?.[cm.institutionId] ?? 0;
          instAppliedFee = Math.round(instShare + ownCarried + ownExemptCarried);
          exemptCarryoverBilledThisTerm += ownExemptCarried;
        } else {
          instAppliedFee = Math.round(instShare * result.billingRatio);
          instAnnualUnclaimed[cm.institutionId] = instShare - instShare * result.billingRatio;
        }
      }

      if (isLocked) continue;

      newFees.push({
        id: genId("tf"),
        projectNumber: project.projectNumber,
        projectName: project.projectName,
        termYear,
        termNumber,
        institutionId: cm.institutionId,
        institutionName: cm.institutionName,
        institutionType: member?.institutionType ?? "",
        budget: (ab?.cashBudget ?? 0) + (ab?.inKindBudget ?? 0),
        feeRate: policy.standardRate,
        calculatedFee: instCalcFee,
        appliedFee: instAppliedFee,
        status: feeStatus,
        isAutoGenerated: true,
      });
    }

    // TermFeeCalc 생성
    newCalcs.push({
      id: genId("tfc"),
      projectId: project.id,
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      agencyId: project.agencyId,
      termYear,
      termNumber,
      stageNumber,
      workType,
      totalCashBudget: result.totalCashBudget,
      coInstCount: result.coInstCount,
      baseFee: result.baseFee,
      addonFee: result.addonFee,
      standardFee: result.standardFee,
      nonExemptCashBudget: result.nonExemptCashBudget,
      nonExemptCoInstCount: result.nonExemptCoInstCount,
      nonExemptBaseFee: result.nonExemptBaseFee,
      nonExemptAddonFee: result.nonExemptAddonFee,
      generalFee: result.generalFee,
      exemptFeeTotal: result.exemptFeeTotal,
      exemptBreakdown: result.exemptBreakdown,
      calculatedFee: result.calculatedFee,
      generalCalcFee: result.generalCalcFee,
      generalBillingFee: result.generalBillingFee,
      generalUnclaimedFee: result.generalUnclaimedFee,
      carriedOverUnclaimed: result.carriedOverUnclaimed,
      // calcTermFee는 기관별 면제→일반 전환 이월분(exemptCarryoverBilledThisTerm)을 알지 못하므로
      // (그 계산은 이 함수에서 기관별로 사후 처리한다) 여기서 더해 기관별 합계와 어긋나지 않게 한다.
      totalBillingFee: result.totalBillingFee + exemptCarryoverBilledThisTerm,
      overrides: [],
      status: "DRAFT",
      createdAt: new Date().toISOString().slice(0, 10),
    });

    // 다음 연차로 단계 내 미청구 누적 (정산 연차면 해당 단계 미청구 리셋)
    if (isActive) {
      if (workType === "SETTLEMENT") {
        stageUnclaimed[stageNumber] = 0;
        stageUnclaimedByInst[stageNumber] = {};
        stageExemptUnclaimedByInst[stageNumber] = {};
      } else {
        stageUnclaimed[stageNumber] = (stageUnclaimed[stageNumber] ?? 0) + result.generalUnclaimedFee;
        stageUnclaimedByInst[stageNumber] = stageUnclaimedByInst[stageNumber] ?? {};
        for (const [instId, amt] of Object.entries(instAnnualUnclaimed)) {
          stageUnclaimedByInst[stageNumber][instId] = (stageUnclaimedByInst[stageNumber][instId] ?? 0) + amt;
        }
        stageExemptUnclaimedByInst[stageNumber] = stageExemptUnclaimedByInst[stageNumber] ?? {};
        for (const [instId, amt] of Object.entries(instAnnualExemptUnclaimed)) {
          stageExemptUnclaimedByInst[stageNumber][instId] = (stageExemptUnclaimedByInst[stageNumber][instId] ?? 0) + amt;
        }
      }
    }
  }

  _state = {
    ..._state,
    termFees: [...keptFees, ...newFees],
    termFeeCalcs: [...keptCalcs, ...newCalcs],
  };
  notify();
}

// ============================================================
// React Hook
// ============================================================

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
