import { useSyncExternalStore } from "react";
import {
  institutions as initialInstitutions,
  projects as initialProjects,
  projectMembers as initialProjectMembers,
  companyClasses as initialClasses,
  feePolicies as initialFeePolicies,
  termFees as initialTermFees,
  unclaimedFees as initialUnclaimed,
  receivables as initialReceivables,
  settlements as initialSettlements,
  taxInvoices as initialInvoices,
  emailDispatches as initialEmails,
  systemUsers as initialUsers,
  type Institution,
  type Project,
  type ProjectMember,
  type CompanyClass,
  type FeePolicy,
  type TermFee,
  type UnclaimedFee,
  type Receivable,
  type Settlement,
  type TaxInvoice,
  type EmailDispatch,
  type SystemUser,
} from "./mock";

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

export const ENTITY_NAMES: Record<string, string> = {
  institution: "기관",
  project: "과제",
  projectMember: "참여기관",
  companyClass: "기관유형수수료",
  feePolicy: "수수료정책",
  termFee: "연차수수료",
  unclaimed: "미청구액",
  receivable: "미수금",
  settlement: "정산",
  taxInvoice: "세금계산서",
  user: "사용자",
};

// ============================================================
// Store State
// ============================================================

interface StoreState {
  institutions: Institution[];
  projects: Project[];
  projectMembers: ProjectMember[];
  companyClasses: CompanyClass[];
  feePolicies: FeePolicy[];
  termFees: TermFee[];
  unclaimedFees: UnclaimedFee[];
  receivables: Receivable[];
  settlements: Settlement[];
  taxInvoices: TaxInvoice[];
  emailDispatches: EmailDispatch[];
  users: SystemUser[];
  auditLog: AuditEntry[];
}

let _state: StoreState = {
  institutions: [...initialInstitutions],
  projects: [...initialProjects],
  projectMembers: [...initialProjectMembers],
  companyClasses: [...initialClasses],
  feePolicies: [...initialFeePolicies],
  termFees: [...initialTermFees],
  unclaimedFees: [...initialUnclaimed],
  receivables: [...initialReceivables],
  settlements: [...initialSettlements],
  taxInvoices: [...initialInvoices],
  emailDispatches: [...initialEmails],
  users: [...initialUsers],
  auditLog: [],
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

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}`;
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
    performedBy: "김관리",
    performedAt: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  _state = { ..._state, auditLog: [entry, ..._state.auditLog] };
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

export function addProject(data: Omit<Project, "id">): Project {
  const item: Project = { ...data, id: genId("p") };
  _state = { ..._state, projects: [..._state.projects, item] };
  record("project", item.id, item.projectName, "CREATE");
  notify();
  return item;
}

export function updateProject(id: string, data: Partial<Project>): void {
  const before = _state.projects.find((p) => p.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, projects: _state.projects.map((p) => (p.id === id ? after : p)) };
  record("project", id, after.projectName, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

export function deleteProject(id: string): void {
  const item = _state.projects.find((p) => p.id === id);
  if (!item) return;
  _state = {
    ..._state,
    projects: _state.projects.filter((p) => p.id !== id),
    projectMembers: _state.projectMembers.filter((m) => m.projectId !== id),
  };
  record("project", id, item.projectName, "DELETE");
  notify();
}

// ============================================================
// PROJECT MEMBERS (참여기관)
// ============================================================

export function addProjectMember(data: Omit<ProjectMember, "id">): ProjectMember {
  const item: ProjectMember = { ...data, id: genId("pm") };
  _state = { ..._state, projectMembers: [..._state.projectMembers, item] };
  record("projectMember", item.id, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  notify();
  return item;
}

export function updateProjectMember(id: string, data: Partial<ProjectMember>): void {
  const before = _state.projectMembers.find((m) => m.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, projectMembers: _state.projectMembers.map((m) => (m.id === id ? after : m)) };
  record("projectMember", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

export function deleteProjectMember(id: string): void {
  const item = _state.projectMembers.find((m) => m.id === id);
  if (!item) return;
  _state = { ..._state, projectMembers: _state.projectMembers.filter((m) => m.id !== id) };
  record("projectMember", id, `${item.projectNumber} · ${item.institutionName}`, "DELETE");
  notify();
}

// ============================================================
// COMPANY CLASSES (기관 유형별 수수료율)
// ============================================================

export function addCompanyClass(data: Omit<CompanyClass, "id">): CompanyClass {
  const item: CompanyClass = { ...data, id: genId("cls") };
  _state = { ..._state, companyClasses: [..._state.companyClasses, item] };
  record("companyClass", item.id, item.name, "CREATE");
  notify();
  return item;
}

export function updateCompanyClass(id: string, data: Partial<CompanyClass>): void {
  const before = _state.companyClasses.find((c) => c.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, companyClasses: _state.companyClasses.map((c) => (c.id === id ? after : c)) };
  record("companyClass", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
}

// ============================================================
// FEE POLICIES (수수료 정책 엔진)
// ============================================================

export function addFeePolicy(data: Omit<FeePolicy, "id">): FeePolicy {
  const item: FeePolicy = { ...data, id: genId("pol") };
  _state = { ..._state, feePolicies: [..._state.feePolicies, item] };
  record("feePolicy", item.id, item.name, "CREATE");
  notify();
  return item;
}

export function updateFeePolicy(id: string, data: Partial<FeePolicy>): void {
  const before = _state.feePolicies.find((p) => p.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, feePolicies: _state.feePolicies.map((p) => (p.id === id ? after : p)) };
  record("feePolicy", id, after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
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

export function deleteUser(id: string): void {
  const item = _state.users.find((u) => u.id === id);
  if (!item) return;
  _state = { ..._state, users: _state.users.filter((u) => u.id !== id) };
  record("user", id, item.name, "DELETE");
  notify();
}

// ============================================================
// React Hook
// ============================================================

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
