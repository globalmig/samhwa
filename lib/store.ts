import { useSyncExternalStore } from "react";
import { getCurrentUser } from "./auth";
import { calcTermFee, resolvePolicy, normalizeGrade, getMemberAmount, isSettlementTerm, resolveMemberGradeForTerm, resolveMemberSettlementTypeForTerm, type CalcMember } from "./fee-calculator";
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
  feeInvoiceTemplates as initialFeeInvoiceTemplates,
  simpleNoticeTemplates as initialSimpleNoticeTemplates,
  notices as initialNotices,
  standardAttachments as initialStandardAttachments,
  COMPANY_INFO as initialCompanyInfo,
  type CompanyInfo,
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
  type FeeInvoiceTemplate,
  type FeeInvoiceTemplateEntry,
  type SimpleNoticeTemplate,
  type SimpleNoticeTemplateEntry,
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
  emailDispatch: "이메일 발송",
  user: "사용자",
  projectIssue: "이슈/메모",
  notice: "공지사항",
  standardAttachment: "표준 첨부서류",
  feeInvoiceTemplate: "수수료 청구서 양식",
  simpleNoticeTemplate: "간단 안내 메일 양식",
  companyInfo: "공문 발신 회사 정보",
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
  feeInvoiceTemplates: FeeInvoiceTemplateEntry[];
  simpleNoticeTemplates: SimpleNoticeTemplateEntry[];
  standardAttachments: StandardAttachment[];
  companyInfo: CompanyInfo;
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
      institutionGrade: { before: "일반", after: "우수(A)" },
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
  feeInvoiceTemplates: [...initialFeeInvoiceTemplates],
  simpleNoticeTemplates: [...initialSimpleNoticeTemplates],
  standardAttachments: [...initialStandardAttachments],
  companyInfo: { ...initialCompanyInfo },
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
  // 전담기관명은 과제(Project.agency)에 agencyId와 별개로 그대로 복사돼 있으므로 함께 갱신한다.
  if (data.name && data.name !== before.name) {
    const newName = data.name;
    _state = {
      ..._state,
      projects: _state.projects.map((p) => p.agencyId === id ? { ...p, agency: newName } : p),
    };
  }
  // 약칭(shortName)은 agencyGuides 딕셔너리의 키, AgencyNoticeTemplateEntry.agencyShortName의 값으로
  // 쓰이므로, 바뀌면 옛 약칭 아래 남아있던 안내탭·공문템플릿이 새 약칭으로 조회되지 않아 고아가 된다.
  if (data.shortName && data.shortName !== before.shortName) {
    const oldShortName = before.shortName;
    const newShortName = data.shortName;
    const { [oldShortName]: movedGuides, ...restGuides } = _state.agencyGuides;
    _state = {
      ..._state,
      agencyGuides: movedGuides ? { ...restGuides, [newShortName]: movedGuides } : _state.agencyGuides,
      agencyNoticeTemplates: _state.agencyNoticeTemplates.map((t) =>
        t.agencyShortName === oldShortName ? { ...t, agencyShortName: newShortName } : t
      ),
    };
  }
  record("fundingAgency", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// 참조 중인 과제·수수료정책·연차수수료산정이 하나라도 있으면 삭제를 막는다 — 참조를 그대로 두고
// 지우면 agencyId가 가리키는 대상이 없어져 조용히 고아 레코드가 된다. 반환값이 null이면 삭제 성공,
// 문자열이면 삭제를 막은 이유(화면에 그대로 안내 메시지로 보여준다).
export function deleteFundingAgency(id: string): string | null {
  const item = _state.fundingAgencies.find((a) => a.id === id);
  if (!item) return null;
  const reasons: string[] = [];
  const projectCount = _state.projects.filter((p) => p.agencyId === id).length;
  if (projectCount > 0) reasons.push(`배정된 과제 ${projectCount}건`);
  const feePolicyCount = _state.feePolicies.filter((p) => p.agencyId === id).length;
  if (feePolicyCount > 0) reasons.push(`수수료정책 ${feePolicyCount}건`);
  const termFeeCalcCount = _state.termFeeCalcs.filter((c) => c.agencyId === id).length;
  if (termFeeCalcCount > 0) reasons.push(`연차수수료산정 ${termFeeCalcCount}건`);
  if (reasons.length > 0) {
    return `"${item.name}"은(는) ${reasons.join(", ")}에서 참조 중이라 삭제할 수 없습니다. 삭제 대신 상태를 "비활성"으로 변경해주세요.`;
  }
  _state = { ..._state, fundingAgencies: _state.fundingAgencies.filter((a) => a.id !== id) };
  record("fundingAgency", id, item.name, "DELETE");
  notify();
  return null;
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
  // 기관명/유형은 과제·참여기관·연차수수료·미청구·미수금·세금계산서·정산·면제기관내역에 institutionId와
  // 별개로 그대로 복사돼 있으므로, 함께 갱신하지 않으면 이 레코드들이 옛 이름/유형을 보여준 채로 남는다
  // (updateProject의 projectNumber 전파와 동일한 이유).
  if (data.name && data.name !== before.name) {
    const newName = data.name;
    _state = {
      ..._state,
      projects: _state.projects.map((p) => p.leadInstitutionId === id ? { ...p, leadInstitutionName: newName } : p),
      projectMembers: _state.projectMembers.map((m) => m.institutionId === id ? { ...m, institutionName: newName } : m),
      termFees: _state.termFees.map((f) => f.institutionId === id ? { ...f, institutionName: newName } : f),
      unclaimedFees: _state.unclaimedFees.map((u) => u.leadInstitutionId === id ? { ...u, leadInstitutionName: newName } : u),
      receivables: _state.receivables.map((r) => r.leadInstitutionId === id ? { ...r, leadInstitutionName: newName } : r),
      taxInvoices: _state.taxInvoices.map((t) => t.leadInstitutionId === id ? { ...t, leadInstitutionName: newName } : t),
      settlements: _state.settlements.map((s) => s.institutionId === id ? { ...s, institutionName: newName } : s),
      termFeeCalcs: _state.termFeeCalcs.map((c) =>
        c.exemptBreakdown.some((e) => e.institutionId === id)
          ? { ...c, exemptBreakdown: c.exemptBreakdown.map((e) => e.institutionId === id ? { ...e, institutionName: newName } : e) }
          : c
      ),
    };
  }
  if (data.type && data.type !== before.type) {
    const newType = data.type;
    _state = {
      ..._state,
      projectMembers: _state.projectMembers.map((m) => m.institutionId === id ? { ...m, institutionType: newType } : m),
      termFees: _state.termFees.map((f) => f.institutionId === id ? { ...f, institutionType: newType } : f),
    };
  }
  record("institution", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// 참조 중인 과제·참여기관·미수금·세금계산서·정산이 하나라도 있으면 삭제를 막는다 — 참조를 그대로 두고
// 지우면 institutionId가 가리키는 대상이 없어져 조용히 고아 레코드가 된다. 반환값이 null이면 삭제 성공,
// 문자열이면 삭제를 막은 이유(화면에 그대로 안내 메시지로 보여준다). 등록만 해두고 한 번도 쓰이지 않은
// 기관은 이 조건에 걸리지 않으므로 그대로 삭제할 수 있다 — 실사용 중인 기관은 상태를 "비활성"으로
// 바꿔 목록에서 빼는 방식을 쓰도록 유도한다.
export function deleteInstitution(id: string): string | null {
  const item = _state.institutions.find((i) => i.id === id);
  if (!item) return null;
  const reasons: string[] = [];
  const participatingProjectCount = new Set(_state.projectMembers.filter((m) => m.institutionId === id).map((m) => m.projectId)).size;
  if (participatingProjectCount > 0) reasons.push(`참여 중인 과제 ${participatingProjectCount}건`);
  const leadProjectCount = _state.projects.filter((p) => p.leadInstitutionId === id).length;
  if (leadProjectCount > 0) reasons.push(`주관 과제 ${leadProjectCount}건`);
  const receivableCount = _state.receivables.filter((r) => r.leadInstitutionId === id || r.institutionId === id).length;
  if (receivableCount > 0) reasons.push(`미수금 ${receivableCount}건`);
  const invoiceCount = _state.taxInvoices.filter((t) => t.leadInstitutionId === id || t.institutionId === id).length;
  if (invoiceCount > 0) reasons.push(`세금계산서 ${invoiceCount}건`);
  const settlementCount = _state.settlements.filter((s) => s.institutionId === id).length;
  if (settlementCount > 0) reasons.push(`정산 ${settlementCount}건`);
  if (reasons.length > 0) {
    return `"${item.name}"은(는) ${reasons.join(", ")}에서 참조 중이라 삭제할 수 없습니다. 삭제 대신 상태를 "비활성"으로 변경해주세요.`;
  }
  _state = { ..._state, institutions: _state.institutions.filter((i) => i.id !== id) };
  record("institution", id, item.name, "DELETE");
  notify();
  return null;
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

// 과제코드(전담기관 약칭-순번, 예: KEIT-00001) — 사람이 엑셀에 입력한 값을 그대로 쓰던 방식을
// 버리고, 같은 전담기관 코드를 쓰는 기존 과제 중 가장 큰 순번 다음 번호를 시스템이 매긴다.
function nextProjectCode(agencyShortName: string): string {
  const prefix = `${agencyShortName}-`;
  let max = 0;
  for (const p of _state.projects) {
    if (!p.projectCode?.startsWith(prefix)) continue;
    const n = parseInt(p.projectCode.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(5, "0")}`;
}

export function addProject(data: Omit<Project, "id">): Project {
  const agency = _state.fundingAgencies.find((a) => a.id === data.agencyId);
  const projectCode = data.projectCode ?? (agency ? nextProjectCode(agency.shortName) : undefined);
  const item: Project = { registeredAt: new Date().toISOString().slice(0, 10), ...data, projectCode, id: genId("p") };
  _state = { ..._state, projects: [..._state.projects, item] };
  record("project", item.id, item.projectName, "CREATE");
  ensureLeadMember(item);
  notify();
  return item;
}

// 수수료 산정에 영향을 주는 필드 — 변경 시 해당 과제의 연차별 수수료를 자동 재산정한다.
// programType(IITP 전용 "일반 R&D" ↔ "ICT 기금사업")도 정책 자체를 통째로 바꾸는 필드다 — 구간표·
// 연차상시 청구비율·산정방식(calcMode)이 모두 달라지므로 여기 빠지면 값을 바꿔도 기존 연차수수료가
// 옛 정책 그대로 남는다.
const PROJECT_FEE_AFFECTING_FIELDS = ["agencyId", "startDate", "totalTerms", "agreementType", "stages", "projectType", "autonomySettlementType", "programType"] as const;

export function updateProject(id: string, data: Partial<Project>): void {
  const before = _state.projects.find((p) => p.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, projects: _state.projects.map((p) => (p.id === id ? after : p)) };
  // 과제번호는 참여기관·연차수수료·미청구·미수금·세금계산서·이슈에 참조키(projectNumber)로
  // 그대로 복사돼 있으므로, 확정 전 오타 등을 바로잡아 과제번호를 바꾸는 경우 함께 갱신하지
  // 않으면 이 레코드들이 옛 과제번호를 참조한 채로 고아가 된다.
  if (data.projectNumber && data.projectNumber !== before.projectNumber) {
    const oldNum = before.projectNumber;
    const newNum = data.projectNumber;
    _state = {
      ..._state,
      projectMembers: _state.projectMembers.map((m) => m.projectNumber === oldNum ? { ...m, projectNumber: newNum } : m),
      termFees: _state.termFees.map((f) => f.projectNumber === oldNum ? { ...f, projectNumber: newNum } : f),
      termFeeCalcs: _state.termFeeCalcs.map((c) => c.projectNumber === oldNum ? { ...c, projectNumber: newNum } : c),
      unclaimedFees: _state.unclaimedFees.map((u) => u.projectNumber === oldNum ? { ...u, projectNumber: newNum } : u),
      receivables: _state.receivables.map((r) => r.projectNumber === oldNum ? { ...r, projectNumber: newNum } : r),
      taxInvoices: _state.taxInvoices.map((t) => t.projectNumber === oldNum ? { ...t, projectNumber: newNum } : t),
      projectIssues: _state.projectIssues.map((i) => i.projectNumber === oldNum ? { ...i, projectNumber: newNum } : i),
      settlements: _state.settlements.map((s) => s.projectNumber === oldNum ? { ...s, projectNumber: newNum } : s),
    };
  }
  // 과제명도 위와 같은 이유로 연차수수료·연차수수료산정·미청구·미수금·세금계산서·정산에 복사돼 있으므로
  // 함께 갱신한다. projectNumber가 이 호출에서 함께 바뀌었을 수 있으므로 최신 번호(after.projectNumber)로 매칭한다.
  if (data.projectName && data.projectName !== before.projectName) {
    const newName = data.projectName;
    const num = after.projectNumber;
    _state = {
      ..._state,
      termFees: _state.termFees.map((f) => f.projectNumber === num ? { ...f, projectName: newName } : f),
      termFeeCalcs: _state.termFeeCalcs.map((c) => c.projectNumber === num ? { ...c, projectName: newName } : c),
      unclaimedFees: _state.unclaimedFees.map((u) => u.projectNumber === num ? { ...u, projectName: newName } : u),
      receivables: _state.receivables.map((r) => r.projectNumber === num ? { ...r, projectName: newName } : r),
      taxInvoices: _state.taxInvoices.map((t) => t.projectNumber === num ? { ...t, projectName: newName } : t),
      settlements: _state.settlements.map((s) => s.projectNumber === num ? { ...s, projectName: newName } : s),
    };
  }
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
    settlements: _state.settlements.filter((s) => s.projectNumber !== num),
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
  recalcProjectTotalBudget(item.projectId);
  notify();
  return item;
}

// 수수료 산정에 영향을 주는 필드 — 변경 시 해당 과제의 연차별 수수료를 자동 재산정한다.
const FEE_AFFECTING_FIELDS = ["budget", "cashBudget", "inKindBudget", "institutionGrade", "gradeOverrides", "settlementType", "settlementTypeOverrides", "annualBudgets", "role"] as const;

const EXEMPT_GRADES_KO = new Set(["최우수(S)", "우수(A)", "우수(B)", "우수(C)"]);

function getStageRangeForTerm(project: Project, termNumber: number): { startTermNumber: number; endTermNumber: number } {
  const isBatch = !project.agreementType || project.agreementType === "BATCH";
  if (isBatch) return { startTermNumber: 1, endTermNumber: project.totalTerms };
  const stage = (project.stages ?? []).find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
  return stage ? { startTermNumber: stage.startTermNumber, endTermNumber: stage.endTermNumber } : { startTermNumber: 1, endTermNumber: project.totalTerms };
}

function isStageSettledForTerm(project: Project, termNumber: number): boolean {
  const isBatch = !project.agreementType || project.agreementType === "BATCH";
  const settlementTermNumber = isBatch ? project.totalTerms : getStageRangeForTerm(project, termNumber).endTermNumber;
  return _state.termFees.some(
    (tf) => tf.projectNumber === project.projectNumber && tf.termNumber === settlementTermNumber &&
      (tf.status === "CONFIRMED" || tf.status === "BILLED")
  );
}

function logMemberChangeMemo(before: ProjectMember, content: string) {
  addProjectIssue({
    projectId: before.projectId,
    projectNumber: before.projectNumber,
    content,
    author: getCurrentUser()?.name ?? "시스템",
    createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
    priority: "MEDIUM",
    status: "OPEN",
    institutionName: before.institutionName,
  });
}

// 정산구분이 위탁정산으로 바뀌면 그 단계(과거 연차 포함) 전체를 위탁정산·일반등급으로 소급
// 반영한다 — 면제등급 기관이 위탁정산을 선택하면 그 연차상시 기간 동안은 등급 혜택 없이
// 일반기관으로 계산되기 때문에(fee-calculator.ts의 ANNUAL+위탁정산 예외), 정산구분만 바꾸고
// 등급 표시를 그대로 두면 화면과 실제 계산이 어긋나 보인다. 단계가 이미 정산 완료됐으면
// (settlement 연차가 CONFIRMED/BILLED) 과거를 소급해서 건드리지 않고 null을 반환한다.
function cascadeToEntrustedStage(
  before: ProjectMember,
  project: Project,
  originTerm: number,
  baseAfterSettlementOverrides: { termNumber: number; settlementType: "위탁정산" | "자체정산" }[]
): { settlementTypeOverrides: { termNumber: number; settlementType: "위탁정산" | "자체정산" }[]; gradeOverrides: { termNumber: number; grade: "최우수(S)" | "우수(A)" | "우수(B)" | "우수(C)" | "일반" }[] } | null {
  const gradeAtOrigin = (before.gradeOverrides ?? []).find((g) => g.termNumber === originTerm)?.grade ?? before.institutionGrade ?? "일반";
  if (!EXEMPT_GRADES_KO.has(gradeAtOrigin)) return null; // 원래 일반등급이면 바꿀 게 없음
  if (isStageSettledForTerm(project, originTerm)) return null;

  const stageRange = getStageRangeForTerm(project, originTerm);
  const stageTerms: number[] = [];
  for (let t = stageRange.startTermNumber; t <= stageRange.endTermNumber; t++) stageTerms.push(t);

  const settlementTypeOverrides = [
    ...baseAfterSettlementOverrides.filter((o) => o.termNumber < stageRange.startTermNumber || o.termNumber > stageRange.endTermNumber),
    ...stageTerms.map((t) => ({ termNumber: t, settlementType: "위탁정산" as const })),
  ].sort((a, b) => a.termNumber - b.termNumber);
  const gradeOverrides = [
    ...(before.gradeOverrides ?? []).filter((g) => g.termNumber < stageRange.startTermNumber || g.termNumber > stageRange.endTermNumber),
    ...stageTerms.map((t) => ({ termNumber: t, grade: "일반" as const })),
  ].sort((a, b) => a.termNumber - b.termNumber);

  logMemberChangeMemo(before,
    `${before.institutionName}: ${originTerm}연차에서 자체정산에서 위탁정산으로 변경 (${gradeAtOrigin} → 일반등급). ` +
    `정산구분은 단계 단위 특성이라 ${stageRange.startTermNumber}~${stageRange.endTermNumber}연차(해당 단계) 전체에 위탁정산·일반등급을 자동 반영했습니다.`
  );
  return { settlementTypeOverrides, gradeOverrides };
}

// 정산구분·등급 변경을 UI(연차별/단계별 오버라이드 편집)와 엑셀 업로드(과제×기관당 단일값 갱신)
// 두 경로 모두에서 감지해 메모(ProjectIssue)로 남긴다 — 두 경로가 서로 다른 필드(오버라이드
// 배열 vs 단일값)를 쓰므로 각각 따로 비교해야 한다.
function applyMemberChangeTracking(before: ProjectMember, data: Partial<ProjectMember>): Partial<ProjectMember> {
  const result: Partial<ProjectMember> = { ...data };
  const project = _state.projects.find((p) => p.id === before.projectId);

  if (project && data.settlementTypeOverrides !== undefined) {
    const beforeOverrides = before.settlementTypeOverrides ?? [];
    const afterOverrides = data.settlementTypeOverrides;
    const changed = afterOverrides.filter((o) => {
      const prevAtTerm = beforeOverrides.find((b) => b.termNumber === o.termNumber)?.settlementType ?? before.settlementType;
      return prevAtTerm !== o.settlementType;
    });
    const newlyEntrusted = changed.filter((o) => o.settlementType === "위탁정산");
    if (newlyEntrusted.length > 0) {
      const originTerm = Math.min(...newlyEntrusted.map((o) => o.termNumber));
      const cascade = cascadeToEntrustedStage(before, project, originTerm, afterOverrides);
      if (cascade) {
        result.settlementTypeOverrides = cascade.settlementTypeOverrides;
        result.gradeOverrides = cascade.gradeOverrides;
      }
    } else if (changed.length > 0) {
      const t = Math.min(...changed.map((o) => o.termNumber));
      const prevType = beforeOverrides.find((b) => b.termNumber === t)?.settlementType ?? before.settlementType ?? "자체정산";
      const newType = changed.find((o) => o.termNumber === t)!.settlementType;
      logMemberChangeMemo(before, `${before.institutionName}: ${t}연차에서 정산구분이 ${prevType}에서 ${newType}로 변경되었습니다.`);
    }
  } else if (project && data.settlementType !== undefined && data.settlementType !== before.settlementType) {
    // 엑셀 업로드 경로 — 연차별 오버라이드가 아니라 과제×기관당 단일값을 그대로 덮어쓰므로,
    // 지금 진행연차(currentTerm)를 기준 연차로 보고 동일한 소급 반영 규칙을 적용한다.
    const originTerm = project.currentTerm ?? 1;
    const cascade = data.settlementType === "위탁정산"
      ? cascadeToEntrustedStage(before, project, originTerm, before.settlementTypeOverrides ?? [])
      : null;
    if (cascade) {
      result.settlementTypeOverrides = cascade.settlementTypeOverrides;
      result.gradeOverrides = cascade.gradeOverrides;
    } else {
      logMemberChangeMemo(before, `${before.institutionName}: 정산구분이 ${before.settlementType ?? "자체정산"}에서 ${data.settlementType}로 변경되었습니다(${originTerm}연차 기준, 엑셀 업로드).`);
    }
  }

  if (data.gradeOverrides !== undefined) {
    const beforeGrade = before.gradeOverrides ?? [];
    const afterGrade = data.gradeOverrides;
    const changed = afterGrade.filter((g) => {
      const prev = beforeGrade.find((b) => b.termNumber === g.termNumber)?.grade ?? before.institutionGrade ?? "일반";
      return prev !== g.grade;
    });
    if (changed.length > 0) {
      const t = Math.min(...changed.map((g) => g.termNumber));
      const prev = beforeGrade.find((b) => b.termNumber === t)?.grade ?? before.institutionGrade ?? "일반";
      const next = changed.find((g) => g.termNumber === t)!.grade;
      logMemberChangeMemo(before, `${before.institutionName}: ${t}연차에서 등급이 ${prev}에서 ${next}로 변경되었습니다.`);
    }
  } else if (data.institutionGrade !== undefined && data.institutionGrade !== before.institutionGrade) {
    logMemberChangeMemo(before, `${before.institutionName}: 등급이 ${before.institutionGrade ?? "일반"}에서 ${data.institutionGrade}로 변경되었습니다(엑셀 업로드 등).`);
  }

  return result;
}

export function updateProjectMember(id: string, data: Partial<ProjectMember>): void {
  const before = _state.projectMembers.find((m) => m.id === id);
  if (!before) return;
  const trackedData = applyMemberChangeTracking(before, data);
  const after = { ...before, ...trackedData };
  _state = { ..._state, projectMembers: _state.projectMembers.map((m) => (m.id === id ? after : m)) };
  record("projectMember", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  if (FEE_AFFECTING_FIELDS.some((f) => f in trackedData)) {
    autoGenerateTermFees(before.projectId);
  }
  if ("cashBudget" in trackedData || "inKindBudget" in trackedData) {
    recalcProjectTotalBudget(before.projectId);
  }
  notify();
}

export interface InstitutionGradeApplyResult {
  updatedProjectCount: number;
  updatedTermCount: number;
  lockedTermCount: number;
  // 실제로 어느 과제의 몇 연차가 바뀌었는지 — 업로드 화면에서 "이 과제들이 바뀌었다"고
  // 구체적으로 보여줘야 사용자가 반영 결과를 확인·추적할 수 있다(건수만으로는 알 수 없음).
  // currentTerm은 호출 쪽에서 "이미 지난 연차까지 소급 반영됐는지"(termNumber < currentTerm)를
  // 가려내 별도로 경고 표시하는 데 쓴다.
  updatedProjects: { projectId: string; projectNumber: string; projectName: string; termNumbers: number[]; currentTerm: number }[];
}

// 정산면제리스트 업로드 등으로 기관의 등급이 새로 확인됐을 때, 그 기관이 참여 중인 모든 과제의
// 해당 연차에 소급 반영한다. 단, 이미 CONFIRMED/BILLED로 확정됐거나 수동조정(manualOverride)된
// 연차는 건드리지 않는다 — projectType/settlementType 변경 시 autoGenerateTermFees가 지키는 잠금과 동일한 규칙.
// 완료된(COMPLETED) 과제도 대상에서 제외한다.
export function applyInstitutionGradeToProjects(
  institutionId: string,
  newGrade: "최우수(S)" | "우수(A)" | "우수(B)" | "우수(C)" | "일반",
): InstitutionGradeApplyResult {
  const affectedProjects = new Map<string, { projectNumber: string; projectName: string; termNumbers: number[]; currentTerm: number }>();
  // 이미 확정(CONFIRMED/BILLED)되어 자동 반영은 안 됐지만, 그 연차를 계산할 때 쓴 등급이 새 등급과
  // 달라 수기 확인이 필요한 건들 — 과제별로 모아서 이슈로 남긴다.
  const lockedMismatches = new Map<string, { projectNumber: string; projectName: string; entries: { termNumber: number; oldGrade: string }[] }>();
  let updatedTermCount = 0;
  let lockedTermCount = 0;

  const updatedMembers = _state.projectMembers.map((m) => {
    if (m.institutionId !== institutionId) return m;
    const project = _state.projects.find((p) => p.id === m.projectId);
    if (!project || project.status === "COMPLETED") return m;

    const overrides = [...(m.gradeOverrides ?? [])];
    const changedTerms: number[] = [];
    for (let termNumber = 1; termNumber <= project.totalTerms; termNumber++) {
      const existingIdx = overrides.findIndex((g) => g.termNumber === termNumber);
      const currentGrade = existingIdx >= 0 ? overrides[existingIdx].grade : (m.institutionGrade ?? "일반");
      if (currentGrade === newGrade) continue; // 이미 같은 등급이면 확정 여부와 무관하게 손댈 게 없음

      const locked = _state.termFees.some(
        (tf) => tf.projectNumber === project.projectNumber &&
          tf.institutionId === institutionId &&
          tf.termNumber === termNumber &&
          (tf.status === "CONFIRMED" || tf.status === "BILLED" || tf.manualOverride)
      );
      if (locked) {
        lockedTermCount++;
        const entry = lockedMismatches.get(project.id) ?? { projectNumber: project.projectNumber, projectName: project.projectName, entries: [] };
        entry.entries.push({ termNumber, oldGrade: currentGrade });
        lockedMismatches.set(project.id, entry);
        continue;
      }
      if (existingIdx >= 0) overrides[existingIdx] = { termNumber, grade: newGrade };
      else overrides.push({ termNumber, grade: newGrade });
      changedTerms.push(termNumber);
      updatedTermCount++;
    }
    if (changedTerms.length === 0) return m;
    affectedProjects.set(project.id, {
      projectNumber: project.projectNumber,
      projectName: project.projectName,
      termNumbers: [...(affectedProjects.get(project.id)?.termNumbers ?? []), ...changedTerms].sort((a, b) => a - b),
      currentTerm: project.currentTerm ?? 1,
    });
    return { ...m, gradeOverrides: overrides.sort((a, b) => a.termNumber - b.termNumber) };
  });

  // 확정된 연차라 자동 반영은 안 했지만, 이미 청구된 금액이 최신 등급과 어긋난다는 걸 담당자가
  // 놓치지 않도록 과제별로 이슈를 남긴다 — 이슈 등록은 상단 알림(종 아이콘)의 "이슈/메모 알림"에도
  // 그대로 뜨므로 별도의 알림 저장소를 따로 두지 않아도 된다.
  if (lockedMismatches.size > 0) {
    const institutionName = _state.institutions.find((i) => i.id === institutionId)?.name ?? "";
    const authorName = getCurrentUser()?.name ?? "시스템";
    const now = new Date().toISOString().replace("T", " ").slice(0, 16);
    for (const [projectId, info] of lockedMismatches) {
      const termList = info.entries
        .sort((a, b) => a.termNumber - b.termNumber)
        .map((e) => `${e.termNumber}연차(${e.oldGrade} → ${newGrade})`)
        .join(", ");
      addProjectIssue({
        projectId,
        projectNumber: info.projectNumber,
        content:
          `${institutionName} 등급이 ${newGrade}로 변경되었으나, 이미 확정(청구완료)된 연차라 금액은 자동으로 바뀌지 않았습니다.\n` +
          `해당 연차: ${termList}\n` +
          `이미 발행된 금액을 그대로 둘지, 수기로 조정할지 확인해주세요.`,
        author: authorName,
        createdAt: now,
        priority: "HIGH",
        status: "OPEN",
        recipientGroups: ["MANAGER", "ACCOUNTANT"],
        institutionName,
      });
    }
  }

  if (affectedProjects.size === 0) return { updatedProjectCount: 0, updatedTermCount: 0, lockedTermCount, updatedProjects: [] };

  _state = { ..._state, projectMembers: updatedMembers };
  for (const pid of affectedProjects.keys()) {
    record("project", pid, `기관 등급 변경 반영 (${newGrade})`, "UPDATE");
    autoGenerateTermFees(pid);
  }
  notify();
  return {
    updatedProjectCount: affectedProjects.size,
    updatedTermCount,
    lockedTermCount,
    updatedProjects: [...affectedProjects.entries()].map(([projectId, info]) => ({ projectId, ...info })),
  };
}

export function deleteProjectMember(id: string): void {
  const item = _state.projectMembers.find((m) => m.id === id);
  if (!item) return;
  _state = { ..._state, projectMembers: _state.projectMembers.filter((m) => m.id !== id) };
  record("projectMember", id, `${item.projectNumber} · ${item.institutionName}`, "DELETE");
  autoGenerateTermFees(item.projectId);
  recalcProjectTotalBudget(item.projectId);
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

export function deleteFeePolicy(id: string): void {
  const item = _state.feePolicies.find((p) => p.id === id);
  if (!item) return;
  // 삭제 전에 이 정책이 실제로 적용되던 과제를 미리 찾아둔다 — 삭제 후엔 이 정책으로
  // resolvePolicy가 귀결되는지 더 이상 확인할 수 없으므로, 남은 정책 중 새로 귀결되는 것으로 재산정한다.
  const affectedProjectIds = _state.projects
    .filter((p) => resolvePolicy(p.agencyId, _state.feePolicies, p.programType ?? "GENERAL")?.id === id)
    .map((p) => p.id);
  _state = { ..._state, feePolicies: _state.feePolicies.filter((p) => p.id !== id) };
  record("feePolicy", id, item.name, "DELETE");
  affectedProjectIds.forEach((pid) => autoGenerateTermFees(pid));
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

/** 한 연차(과제번호+연도+연차번호) 전체의 타회계법인 진행 여부를 일괄 변경한다.
 *  TermFee가 기관별로 1행씩 있어 연차 단위 체크박스는 그 연차의 모든 행에 동일하게 반영해야 한다. */
export function setTermOtherFirmHandled(
  projectNumber: string,
  termYear: number,
  termNumber: number,
  otherFirmHandled: boolean
): void {
  const targets = _state.termFees.filter(
    (f) => f.projectNumber === projectNumber && f.termYear === termYear && f.termNumber === termNumber
  );
  if (targets.length === 0) return;
  const targetIds = new Set(targets.map((f) => f.id));
  _state = {
    ..._state,
    termFees: _state.termFees.map((f) => (targetIds.has(f.id) ? { ...f, otherFirmHandled } : f)),
  };
  record(
    "termFee",
    targets[0].id,
    `${projectNumber} · ${termYear}년 ${termNumber}연차`,
    "UPDATE",
    { otherFirmHandled: { before: !otherFirmHandled, after: otherFirmHandled } }
  );
  notify();
}

/** 한 연차(과제번호+연도+연차번호)의 실제 시작일/종료일을 직접 지정(또는 해제)한다. TermFee가
 *  기관별로 1행씩 있어 연차 단위로 지정하면 그 연차의 모든 기관 행에 동일하게 반영해야 한다.
 *  null을 넘기면 지정을 해제해 다시 자동계산(resolveTermDateRange) 값을 쓰게 된다. */
export function setTermDates(
  projectNumber: string,
  termYear: number,
  termNumber: number,
  termStartDate: string | null,
  termEndDate: string | null
): void {
  const targets = _state.termFees.filter(
    (f) => f.projectNumber === projectNumber && f.termYear === termYear && f.termNumber === termNumber
  );
  if (targets.length === 0) return;
  const targetIds = new Set(targets.map((f) => f.id));
  _state = {
    ..._state,
    termFees: _state.termFees.map((f) =>
      targetIds.has(f.id) ? { ...f, termStartDate: termStartDate ?? undefined, termEndDate: termEndDate ?? undefined } : f
    ),
  };
  record(
    "termFee",
    targets[0].id,
    `${projectNumber} · ${termYear}년 ${termNumber}연차`,
    "UPDATE",
    { termStartDate: { before: targets[0].termStartDate, after: termStartDate }, termEndDate: { before: targets[0].termEndDate, after: termEndDate } }
  );
  notify();
}

/** 한 연차(과제번호+연도+연차번호)의 세금계산서 발행구분을 일괄 변경한다. TermFee가 기관별로
 *  1행씩 있어 연차 단위 선택은 그 연차의 모든 행에 동일하게 반영해야 한다(과거엔 Project 전체
 *  단일 필드였는데, 연차마다 발행구분이 달라질 수 있어 TermFee로 옮겼다).
 *  institutionId를 주면 RDA2처럼 연차를 기관별로 쪼개 청구하는 경우 그 기관의 행만 바꾼다. */
export function setTermBillingType(
  projectNumber: string,
  termYear: number,
  termNumber: number,
  billingType: TermFee["billingType"],
  institutionId?: string
): void {
  const targets = _state.termFees.filter(
    (f) =>
      f.projectNumber === projectNumber && f.termYear === termYear && f.termNumber === termNumber &&
      (institutionId ? f.institutionId === institutionId : true)
  );
  if (targets.length === 0) return;
  const targetIds = new Set(targets.map((f) => f.id));
  _state = {
    ..._state,
    termFees: _state.termFees.map((f) => (targetIds.has(f.id) ? { ...f, billingType } : f)),
  };
  record(
    "termFee",
    targets[0].id,
    `${projectNumber} · ${termYear}년 ${termNumber}연차`,
    "UPDATE",
    { billingType: { before: targets[0].billingType, after: billingType } }
  );
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
  const before = _state.projectIssues.find((i) => i.id === id);
  if (!before) return;
  const after = { ...before, ...changes };
  _state = {
    ..._state,
    projectIssues: _state.projectIssues.map((i) => (i.id === id ? after : i)),
  };
  record("projectIssue", id, "이슈 업데이트", "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
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
  // Receivable.invoiceNumber는 세금계산서를 별도 FK 없이 문자열로만 참조한다(과제번호+연차+연차차수+
  // (분리청구면)기관 조합으로 짝짓는 방식 — /fees, 과제상세 페이지의 매칭 로직과 동일). 세금계산서
  // 번호를 고치면 그 조합으로 짝지어지는 미수금의 참조 번호도 함께 갱신해야 서로 어긋나지 않는다.
  if (data.invoiceNumber && data.invoiceNumber !== before.invoiceNumber) {
    const newInvoiceNumber = data.invoiceNumber;
    _state = {
      ..._state,
      receivables: _state.receivables.map((r) =>
        r.projectNumber === after.projectNumber && r.termYear === after.termYear && r.termNumber === after.termNumber &&
          (r.institutionId ?? "") === (after.institutionId ?? "")
          ? { ...r, invoiceNumber: newInvoiceNumber }
          : r
      ),
    };
  }
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
  record("emailDispatch", item.id, `${item.recipientInstitution} · ${item.subject}`, "CREATE");
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

export function addStandardAttachment(name: string): StandardAttachment {
  const item: StandardAttachment = { id: genId("sa"), name, updatedAt: new Date().toISOString().slice(0, 10) };
  _state = { ..._state, standardAttachments: [..._state.standardAttachments, item] };
  record("standardAttachment", item.id, name, "CREATE");
  notify();
  return item;
}

export function deleteStandardAttachment(id: string): void {
  const item = _state.standardAttachments.find((a) => a.id === id);
  if (!item) return;
  _state = { ..._state, standardAttachments: _state.standardAttachments.filter((a) => a.id !== id) };
  record("standardAttachment", id, `${item.name} 삭제`, "DELETE");
  notify();
}

// ============================================================
// COMPANY INFO (공문 발신 회사 정보 — 회사명·대표이사·직인 등 전담기관과 무관한 고정 레터헤드)
// ============================================================

export function updateCompanyInfo(data: Partial<CompanyInfo>): void {
  const before = _state.companyInfo;
  const after = { ...before, ...data };
  _state = { ..._state, companyInfo: after };
  record("companyInfo", "company-info", after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
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
  _state = {
    ..._state,
    users: _state.users.filter((u) => u.id !== id),
    // 삭제된 사용자가 이슈/메모의 개인 알림 대상으로 남아있으면 존재하지 않는 id를 가리키는 유령
    // 참조가 되므로 함께 정리한다.
    projectIssues: _state.projectIssues.map((i) =>
      i.recipientUserIds?.includes(id)
        ? { ...i, recipientUserIds: i.recipientUserIds.filter((uid) => uid !== id) }
        : i
    ),
  };
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
// FEE INVOICE TEMPLATES (수수료 청구서 양식)
// ============================================================

export function addFeeInvoiceTemplate(
  category: FeeInvoiceTemplateEntry["category"],
  name: string,
  content: FeeInvoiceTemplate
): FeeInvoiceTemplateEntry {
  const item: FeeInvoiceTemplateEntry = { id: genId("fit"), category, name, isDefault: false, content };
  _state = { ..._state, feeInvoiceTemplates: [..._state.feeInvoiceTemplates, item] };
  record("feeInvoiceTemplate", item.id, name, "CREATE");
  notify();
  return item;
}

export function updateFeeInvoiceTemplate(
  id: string,
  data: Partial<Pick<FeeInvoiceTemplateEntry, "name" | "content" | "defaultAttachments">>
): void {
  const before = _state.feeInvoiceTemplates.find((t) => t.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.map((t) => (t.id === id ? after : t)) };
  record("feeInvoiceTemplate", id, `${after.name} 수정`, "UPDATE");
  notify();
}

// 대표양식(isDefault)은 카테고리마다 항상 최소 1개 있어야 발송(DispatchModal) 흐름이 깨지지 않으므로
// 삭제를 거부한다 — 다른 템플릿을 먼저 대표로 지정한 뒤에만 지울 수 있다.
export function deleteFeeInvoiceTemplate(id: string): void {
  const item = _state.feeInvoiceTemplates.find((t) => t.id === id);
  if (!item || item.isDefault) return;
  _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.filter((t) => t.id !== id) };
  record("feeInvoiceTemplate", id, `${item.name} 삭제`, "DELETE");
  notify();
}

export function setDefaultFeeInvoiceTemplate(id: string): void {
  const item = _state.feeInvoiceTemplates.find((t) => t.id === id);
  if (!item) return;
  _state = {
    ..._state,
    feeInvoiceTemplates: _state.feeInvoiceTemplates.map((t) =>
      t.category === item.category ? { ...t, isDefault: t.id === id } : t
    ),
  };
  record("feeInvoiceTemplate", id, `${item.name} 대표양식으로 지정`, "UPDATE");
  notify();
}

// ============================================================
// SIMPLE NOTICE TEMPLATES (계산서발행 서류 요청 / 입금 확인 요청 — 첨부 없이 본문 하나만 보내는 안내 메일)
// ============================================================

export function addSimpleNoticeTemplate(
  category: SimpleNoticeTemplateEntry["category"],
  name: string,
  content: SimpleNoticeTemplate
): SimpleNoticeTemplateEntry {
  const item: SimpleNoticeTemplateEntry = { id: genId("snt"), category, name, isDefault: false, content };
  _state = { ..._state, simpleNoticeTemplates: [..._state.simpleNoticeTemplates, item] };
  record("simpleNoticeTemplate", item.id, name, "CREATE");
  notify();
  return item;
}

export function updateSimpleNoticeTemplate(id: string, data: Partial<Pick<SimpleNoticeTemplateEntry, "name" | "content">>): void {
  const before = _state.simpleNoticeTemplates.find((t) => t.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.map((t) => (t.id === id ? after : t)) };
  record("simpleNoticeTemplate", id, `${after.name} 수정`, "UPDATE");
  notify();
}

// 대표양식(isDefault)은 카테고리마다 항상 최소 1개 있어야 발송(SimpleNoticeModal) 흐름이 깨지지 않으므로
// 삭제를 거부한다 — 다른 템플릿을 먼저 대표로 지정한 뒤에만 지울 수 있다.
export function deleteSimpleNoticeTemplate(id: string): void {
  const item = _state.simpleNoticeTemplates.find((t) => t.id === id);
  if (!item || item.isDefault) return;
  _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.filter((t) => t.id !== id) };
  record("simpleNoticeTemplate", id, `${item.name} 삭제`, "DELETE");
  notify();
}

export function setDefaultSimpleNoticeTemplate(id: string): void {
  const item = _state.simpleNoticeTemplates.find((t) => t.id === id);
  if (!item) return;
  _state = {
    ..._state,
    simpleNoticeTemplates: _state.simpleNoticeTemplates.map((t) =>
      t.category === item.category ? { ...t, isDefault: t.id === id } : t
    ),
  };
  record("simpleNoticeTemplate", id, `${item.name} 대표양식으로 지정`, "UPDATE");
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

  // 그 단계의 정산연차(마지막 연차)가 이미 CONFIRMED/BILLED로 확정됐는지 — 그렇다면 그 단계는
  // "끝난" 것으로 보고 기존처럼 안에 있는 연차들을 보호한다. 아직 정산연차에 이르지 않았다면(그
  // 단계가 진행 중이라면) 정산구분·등급 등 기관 정보가 도중에 바뀔 수 있고, 그러면 이미 확정·발행된
  // 연차라도 단계 전체가 새 정보로 다시 맞아떨어지도록 재계산 대상에 포함해야 한다 — 정산 전까지는
  // 연차상시 청구가 잠정치라는 뜻이다.
  function isStageSettled(stageNumber: number): boolean {
    const settlementTermNumber = isBatch
      ? project!.totalTerms
      : stages.find((s) => s.stageNumber === stageNumber)?.endTermNumber ?? project!.totalTerms;
    return _state.termFees.some(
      (tf) => tf.projectNumber === project!.projectNumber && tf.termNumber === settlementTermNumber &&
        (tf.status === "CONFIRMED" || tf.status === "BILLED")
    );
  }

  // CONFIRMED/BILLED로 확정된 연차별 항목은, 그 연차가 속한 단계의 정산이 이미 끝난 경우에만 보존한다.
  // 담당자가 금액을 직접 수정(manualOverride)한 항목은 단계 진행 상태와 무관하게 항상 보존한다.
  const keptFees = _state.termFees.filter((tf) => {
    if (tf.projectNumber !== project.projectNumber) return true;
    if (tf.manualOverride) return true;
    if (tf.status !== "CONFIRMED" && tf.status !== "BILLED") return false;
    return isStageSettled(getStageNumber(tf.termNumber));
  });
  // 이미 확정되어 보존되는 기관×연차 조합 — 아래 생성 루프에서 덮어쓰지 않도록 건너뛴다.
  const lockedKeys = new Set(
    keptFees
      .filter((tf) => tf.projectNumber === project.projectNumber)
      .map((tf) => `${tf.termYear}|${tf.termNumber}|${tf.institutionId}`)
  );

  // 정산구분(자체/위탁)은 사실상 "단계" 단위 특성이다 — 단계 도중에 위탁으로 바뀌면 그 단계
  // 시작 연차부터 전부 같은 값으로 다시 계산돼야 한다(단계가 끝나기 전까지 연차상시 청구는
  // 잠정치라는 뜻). 그래서 단계가 아직 안 끝났다면 연차별 override를 그 연차만 따로 보지 않고,
  // 그 단계 안에서 지정된 override 중 가장 늦은(가장 큰) 연차의 값을 단계 전체에 적용한다.
  // 단계 정산이 이미 끝났으면(과거 단계) 기존처럼 그 연차 자체의 override만 그대로 쓴다.
  function resolveSettlementTypeForCalc(
    member: Pick<ProjectMember, "settlementType" | "settlementTypeOverrides">,
    termNumber: number,
    stageNumber: number,
    defaultSettlementType: "위탁정산" | "자체정산"
  ): "위탁정산" | "자체정산" {
    const stageRange = isBatch
      ? { startTermNumber: 1, endTermNumber: project!.totalTerms }
      : stages.find((s) => s.stageNumber === stageNumber);
    if (!stageRange || isStageSettled(stageNumber)) {
      return resolveMemberSettlementTypeForTerm(member, termNumber, defaultSettlementType);
    }
    const stageOverrides = (member.settlementTypeOverrides ?? []).filter(
      (o) => o.termNumber >= stageRange.startTermNumber && o.termNumber <= stageRange.endTermNumber
    );
    if (stageOverrides.length === 0) return member.settlementType ?? defaultSettlementType;
    const latest = stageOverrides.reduce((a, b) => (b.termNumber > a.termNumber ? b : a));
    return latest.settlementType;
  }
  // 이미 세금계산서가 발행(BILLED)된 연차인데 단계가 아직 안 끝나 재계산 대상에 포함된 경우 —
  // 실제로 청구액이 달라지면 담당자에게 알려야 한다(발행된 세금계산서 금액과 어긋날 수 있음).
  const billedAmountChanges: { termNumber: number; institutionName: string; before: number; after: number }[] = [];
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

    // 이 연차에 산정기준액(feeBasis)이 있는 기관만 추출 — CASH_PLUS_INKIND(RDA1/RDA2) 정책에서는
    // 현금사업비가 0원이어도 현물사업비만으로 대상에 포함될 수 있으므로, cashBudget만으로 걸러내면
    // 현물전용 공동기관이 산정 대상에서 통째로 빠지는 오류가 생긴다.
    const feeBasis = policy.feeBasis ?? "CASH";
    const calcMembers: CalcMember[] = [];
    for (const m of members) {
      const ab = m.annualBudgets?.find((b) => b.termNumber === termNumber);
      if (!ab || getMemberAmount(ab, feeBasis) <= 0) continue;
      calcMembers.push({
        institutionId: m.institutionId,
        institutionName: m.institutionName,
        role: m.role,
        grade: normalizeGrade(resolveMemberGradeForTerm(m, termNumber)),
        institutionType: m.institutionType,
        settlementType: resolveSettlementTypeForCalc(m, termNumber, stageNumber, policy.defaultSettlementType ?? "자체정산"),
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
      autonomySettlementType: project.autonomySettlementType,
    });

    // 면제기관 / 완전제외기관 ID 집합
    const exemptIds = new Set(result.exemptBreakdown.map((e) => e.institutionId));
    const excludedIds = new Set(result.excludedInstitutionIds);
    const nonExemptMembers = calcMembers.filter(
      (m) => !exemptIds.has(m.institutionId) && !excludedIds.has(m.institutionId)
    );
    // 일반기관(면제등급 아님) 기관별 산정·청구 몫 — calcTermFee가 이미 기관별로 정확히 배분해서
    // 반환하므로(정산 연차엔 정산구분별로 요율이 갈린 상태로) 여기선 그대로 맵으로 옮겨 쓰기만 한다.
    const generalBreakdownByInst = new Map(result.generalBreakdown.map((g) => [g.institutionId, g]));

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
      // 아직 확정 안 된(DRAFT) 연차라도 "타회계법인 진행" 체크는 재생성 때마다 유지해야 한다 —
      // 안 그러면 사업비를 수정하거나 참여기관을 추가하는 등 재계산이 한 번만 더 돌아도 체크가 조용히 풀린다.
      const prevFee = _state.termFees.find(
        (tf) => tf.projectNumber === project.projectNumber && tf.termYear === termYear &&
          tf.termNumber === termNumber && tf.institutionId === cm.institutionId
      );

      let instCalcFee: number;
      let instAppliedFee: number;
      let instStandardFee: number;
      let instUnclaimedFee: number;

      const perInst = result.perInstitutionFees?.find((e) => e.institutionId === cm.institutionId);

      if (excludedIds.has(cm.institutionId)) {
        // exemptionMode "EXCLUDE" 등급(또는 excludeLeadFromCalc 주관기관) — 산정기준액에서 완전히 빠지므로 수수료 없음
        instCalcFee = 0;
        instAppliedFee = 0;
        instStandardFee = 0;
        instUnclaimedFee = 0;
      } else if (perInst) {
        // calcMode "PER_INSTITUTION" — 기관별로 각자의 사업비를 구간표에 대입해 개별 산정한 값을 그대로 사용
        instCalcFee = perInst.calculatedFee;
        instAppliedFee = perInst.billingFee;
        instStandardFee = perInst.standardFee;
        instUnclaimedFee = perInst.unclaimedFee;
      } else if (exemptIds.has(cm.institutionId)) {
        const ed = result.exemptBreakdown.find((e) => e.institutionId === cm.institutionId);
        instCalcFee = ed?.calculatedFee ?? 0;
        instAppliedFee = ed?.billingFee ?? 0;
        instStandardFee = ed?.standardFee ?? 0;
        instUnclaimedFee = ed?.unclaimedFee ?? 0;
        // 면제기관이 연차상시 동안 미루는 몫만 추적한다 — 정산 연차까지 자체정산을 유지해 계속
        // 면제기관으로 남으면(이 분기 자체), 그 미청구분은 매출비용으로 소멸시키는 게 기본 처리라
        // 더 이상 추적하지 않는다(정산 연차에 도달한 시점엔 stageExemptUnclaimedByInst가 리셋된다).
        if (workType === "ANNUAL") {
          instAnnualExemptUnclaimed[cm.institutionId] = ed?.unclaimedFee ?? 0;
        }
      } else {
        // 이 기관의 일반수수료(generalFee) 몫 — calcTermFee가 기관별로 미리 배분해둔 값이라
        // 전체 기관 합계가 항상 generalFee/generalBillingFee와 정확히 일치한다.
        const gd = generalBreakdownByInst.get(cm.institutionId);
        const instCalcShare = gd?.calculatedFee ?? 0;
        instCalcFee = instCalcShare;
        // 일반기관은 산정 단계에서 85% 적용이 없으므로 표준수수료 = 산정수수료.
        instStandardFee = instCalcFee;

        if (workType === "SETTLEMENT") {
          // 정산 연차: 등급과 무관하게 이 기관의 정산구분만으로 갈린다.
          if (cm.settlementType === "자체정산") {
            // 자체정산: billingRatio만 청구하고, 그동안 쌓아온 이월 미청구액은 청구하지 않는다
            // (매몰비용으로 소멸) — gd.billingFee가 이미 calcTermFee에서 이 비율로 계산돼 있으므로 그대로 쓴다.
            instAppliedFee = gd?.billingFee ?? 0;
            instUnclaimedFee = gd?.unclaimedFee ?? 0;
          } else {
            // 위탁정산: 이번 연차 산정액 100%(gd.billingFee, ratio=1.0이라 instCalcShare와 동일) +
            // 이 기관 자신이 그동안 미뤄온 몫(stageUnclaimedByInst)을 더해서 청구한다. 전체를 합쳐서
            // 이번 연차 비율로 재배분하면, 기관별 사업비 비중이 연차마다 달라질 때 실제로 미뤘던
            // 기관과 다른 기관이 그 몫을 떠안는 오류가 생기므로 기관 자신의 누적분만 더한다.
            const ownCarried = stageUnclaimedByInst[stageNumber]?.[cm.institutionId] ?? 0;
            // 이 기관이 연차상시 동안엔 면제기관(자체정산)이었다가 정산 연차에 위탁정산으로 전환해
            // 일반기관 취급을 받는 경우 — 자체정산이던 동안 쌓인 미청구분을 여기서 함께 청구한다.
            // (그대로 두면 전환 시점에 그 미청구분이 아무 데도 반영되지 않고 사라진다.)
            const ownExemptCarried = stageExemptUnclaimedByInst[stageNumber]?.[cm.institutionId] ?? 0;
            // ownCarried/ownExemptCarried도 이제 매 연차 정수로 쌓이므로 반올림이 필요 없다.
            instAppliedFee = (gd?.billingFee ?? 0) + ownCarried + ownExemptCarried;
            exemptCarryoverBilledThisTerm += ownExemptCarried;
            // 위탁정산은 100% 청구되므로 이번 연차 자체가 새로 남기는 미청구는 없다.
            instUnclaimedFee = 0;
          }
        } else {
          // 청구액도 calcTermFee가 미리 배분해둔 정수값이라 합계가 generalBillingFee와 정확히 일치한다.
          const instBillShare = gd?.billingFee ?? 0;
          instAppliedFee = instBillShare;
          instUnclaimedFee = instCalcShare - instBillShare;
          instAnnualUnclaimed[cm.institutionId] = instUnclaimedFee;
        }
      }

      if (isLocked) continue;

      // 이미 CONFIRMED/BILLED였던 연차가 단계가 안 끝나 재계산 대상에 포함된 경우 — 그 상태(확정/발행
      // 여부)는 그대로 유지한다. 여기서 feeStatus(달력 기준 DRAFT/SCHEDULED)로 되돌리면 실제로는 세금
      // 계산서가 이미 발행된 연차인데 상태만 초안으로 되돌아가는 불일치가 생긴다.
      const preservedStatus = prevFee && (prevFee.status === "CONFIRMED" || prevFee.status === "BILLED") ? prevFee.status : feeStatus;
      if (prevFee?.status === "BILLED" && prevFee.appliedFee !== instAppliedFee) {
        billedAmountChanges.push({ termNumber, institutionName: cm.institutionName, before: prevFee.appliedFee, after: instAppliedFee });
      }

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
        standardFee: instStandardFee,
        unclaimedFee: instUnclaimedFee,
        status: preservedStatus,
        isAutoGenerated: true,
        otherFirmHandled: prevFee?.otherFirmHandled,
        termStartDate: ab?.termStartDate,
        termEndDate: ab?.termEndDate,
        auditFirm: ab?.auditFirm ?? prevFee?.auditFirm,
      });
    }

    // 정산 연차에 이 연차 사업비가 없어(탈퇴/미참여) 위 calcMembers 루프에서 아예 빠진 기관 중,
    // 그동안 쌓아둔 이월 미청구액이 남아있는 기관을 마저 처리한다 — 안 그러면 위탁정산이었던
    // 기관이 정산 전에 탈퇴한 경우 그 이월분이 아무 데도 청구되지 않고, 바로 아래에서
    // stageUnclaimedByInst가 리셋되며 그냥 사라지는 문제가 있었다. 위탁정산이었던 기관만 이월분
    // 전액을 청구하고(정산 원칙과 동일), 자체정산이었던 기관은 원래 설계대로 매몰비용으로 소멸시킨다.
    // 일반기관 몫(stageUnclaimedByInst)은 calcTermFee의 carriedOverUnclaimed(단계 전체 미청구 합)에
    // 이미 포함돼 있어 totalBillingFee에 다시 더하면 이중계산이 된다 — 그건 exemptCarryoverBilledThisTerm과
    // 똑같이, calcTermFee가 전혀 모르는 면제기관 몫(stageExemptUnclaimedByInst)만 따로 더한다.
    let departedCarryoverBilledThisTerm = 0;
    if (workType === "SETTLEMENT") {
      const activeInstitutionIds = new Set(calcMembers.map((m) => m.institutionId));
      const carriedInstIds = new Set([
        ...Object.keys(stageUnclaimedByInst[stageNumber] ?? {}),
        ...Object.keys(stageExemptUnclaimedByInst[stageNumber] ?? {}),
      ]);
      for (const instId of carriedInstIds) {
        if (activeInstitutionIds.has(instId)) continue; // 이 연차에도 참여 중이면 위 루프에서 이미 처리됨
        if (lockedKeys.has(`${termYear}|${termNumber}|${instId}`)) continue;
        const ownExemptCarried = stageExemptUnclaimedByInst[stageNumber]?.[instId] ?? 0;
        const totalCarried = (stageUnclaimedByInst[stageNumber]?.[instId] ?? 0) + ownExemptCarried;
        if (totalCarried <= 0) continue;

        const member = members.find((m) => m.institutionId === instId);
        if (!member) continue;
        if (resolveSettlementTypeForCalc(member, termNumber, stageNumber, policy.defaultSettlementType ?? "자체정산") !== "위탁정산") continue;

        const prevFee = _state.termFees.find(
          (tf) => tf.projectNumber === project.projectNumber && tf.termYear === termYear &&
            tf.termNumber === termNumber && tf.institutionId === instId
        );
        newFees.push({
          id: genId("tf"),
          projectNumber: project.projectNumber,
          projectName: project.projectName,
          termYear,
          termNumber,
          institutionId: instId,
          institutionName: member.institutionName,
          institutionType: member.institutionType ?? "",
          budget: 0,
          feeRate: policy.standardRate,
          calculatedFee: 0,
          appliedFee: totalCarried,
          standardFee: 0,
          unclaimedFee: 0,
          status: feeStatus,
          isAutoGenerated: true,
          otherFirmHandled: prevFee?.otherFirmHandled,
          auditFirm: prevFee?.auditFirm,
        });
        departedCarryoverBilledThisTerm += ownExemptCarried;
      }
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
      // calcTermFee는 면제기관 몫의 이월분(exemptCarryoverBilledThisTerm·departedCarryoverBilledThisTerm,
      // 둘 다 stageExemptUnclaimedByInst 출신)을 전혀 모르므로 여기서 더한다. 일반기관 몫의 이월분은
      // calcTermFee의 carriedOverUnclaimed(단계 전체 미청구 합, stageUnclaimedByInst 출신)에 이미
      // 포함돼 있어 따로 더하지 않는다(더하면 이중계산).
      totalBillingFee: result.totalBillingFee + exemptCarryoverBilledThisTerm + departedCarryoverBilledThisTerm,
      overrides: [],
      status: "DRAFT",
      createdAt: new Date().toISOString().slice(0, 10),
    });

    // 다음 연차로 단계 내 미청구 누적 (정산 연차면 해당 단계 미청구 리셋)
    // 실제 달력상 연차 시작일(isActive) 도래 여부와 무관하게, 해당 연차의 사업비가 입력되어
    // 계산된 이상(calcMembers가 있어 여기까지 온 이상) 항상 누적해야 한다 — 그렇지 않으면
    // 전체 연차 사업비를 미리 입력해두고 실제 달력일보다 앞서 확정한 연차(예: 과제를 직접
    // 생성해 4개 연차를 한번에 등록한 경우)의 미청구액이 정산 연차 합산에서 누락된다.
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

  _state = {
    ..._state,
    termFees: [...keptFees, ...newFees],
    termFeeCalcs: [...keptCalcs, ...newCalcs],
  };

  // 단계가 아직 안 끝나 이미 발행된 연차까지 재계산됐고, 그 결과 청구액이 실제로 달라진 경우 —
  // 이미 나간 세금계산서 금액과 어긋날 수 있으니 이슈로 남겨 담당자·회계담당자가 재발행 여부를 확인하게 한다.
  if (billedAmountChanges.length > 0) {
    const termList = billedAmountChanges
      .sort((a, b) => a.termNumber - b.termNumber)
      .map((c) => `${c.termNumber}연차 ${c.institutionName}: ${c.before.toLocaleString()}원 → ${c.after.toLocaleString()}원`)
      .join("\n");
    addProjectIssue({
      projectId: project.id,
      projectNumber: project.projectNumber,
      content:
        `정산구분 등 참여기관 정보 변경으로 이미 세금계산서가 발행된 연차의 청구액이 재계산되어 달라졌습니다(해당 단계 정산이 아직 끝나지 않아 자동 반영됨).\n` +
        `${termList}\n` +
        `이미 발행된 세금계산서 금액과 다르니, 재발행이 필요한지 확인해주세요.`,
      author: getCurrentUser()?.name ?? "시스템",
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      priority: "HIGH",
      status: "OPEN",
      recipientGroups: ["MANAGER", "ACCOUNTANT"],
    });
  }

  notify();
}

// ============================================================
// React Hook
// ============================================================

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
