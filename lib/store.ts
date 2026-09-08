import { useSyncExternalStore } from "react";
import { getCurrentUser } from "./auth";
import { nowKST, todayKST } from "./utils";
import { ADMIN_ONLY_LOCKED_PAGES } from "./permission-constants";
import { calcTermFee, resolvePolicy, normalizeGrade, getMemberAmount, isSettlementTerm, resolveMemberGradeForTerm, resolveMemberSettlementTypeForTerm, resolveProjectCodeForTerm, type CalcMember } from "./fee-calculator";
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
  initialPageAccess,
  initialWriteAccess,
  type Role,
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
  permission: "권한 설정",
};

// ============================================================
// Store State
// ============================================================

// 수수료청구관리(/fees) 화면의 검색 필터 — 과제 상세로 들어갔다가 뒤로 돌아오거나 다른 메뉴를
// 거쳐 다시 들어와도 화면을 새로고침하지 않는 한(SPA 네비게이션) 그대로 유지된다. 직접 "초기화"를
// 누르기 전까지는 안 풀려야 한다는 요청으로 컴포넌트 로컬 useState 대신 store로 옮겼다 — 로컬
// useState는 FeesPage가 언마운트되는 순간(다른 라우트로 이동) 값을 잃어버린다.
export interface FeesFilters {
  projectNumber: string;
  projectName: string;
  leadInstitution: string;
  researchLead: string;
  assignedManager: string;
  assignedManagerPrimary: string;
  // 완료/종료된 과제는 더 이상 확인할 필요가 없어 기본값은 '진행중'
  projectStatus: string;
  agency: string;
  billingType: string;
  collectionStatus: string;
  onlyReceivable: boolean;
  invoiceDateFrom: string;
  invoiceDateTo: string;
  termEndDateFrom: string;
  termEndDateTo: string;
  agencyAssignedFrom: string;
  agencyAssignedTo: string;
}

const DEFAULT_FEES_FILTERS: FeesFilters = {
  projectNumber: "",
  projectName: "",
  leadInstitution: "",
  researchLead: "",
  assignedManager: "",
  assignedManagerPrimary: "",
  projectStatus: "ACTIVE",
  agency: "ALL",
  billingType: "ALL",
  collectionStatus: "ALL",
  onlyReceivable: false,
  invoiceDateFrom: "",
  invoiceDateTo: "",
  termEndDateFrom: "",
  termEndDateTo: "",
  agencyAssignedFrom: "",
  agencyAssignedTo: "",
};

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
  // [권한 설정](/admin/permissions)에서 시스템 관리자가 역할별로 편집하는 페이지 접근/기능별 쓰기 권한.
  // lib/permissions.ts의 canAccessPage·canWriteDomain이 이 값을 참조한다.
  pageAccess: Record<string, Role[]>;
  writeAccess: Record<string, Role[]>;
  feesFilters: FeesFilters;
}

const INITIAL_AUDIT_LOG: AuditEntry[] = [];

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
  pageAccess: Object.fromEntries(Object.entries(initialPageAccess).map(([k, v]) => [k, [...v]])),
  writeAccess: Object.fromEntries(Object.entries(initialWriteAccess).map(([k, v]) => [k, [...v]])),
  feesFilters: { ...DEFAULT_FEES_FILTERS },
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
    // 배열·객체 필드(stages/annualFinancials/gradeOverrides 등)는 String()으로 비교하면 서로
    // 다른 값도 전부 "[object Object]"로 뭉개져 실제로는 바뀌었는데 변경 없음으로 놓칠 수 있다
    // — JSON.stringify로 값 자체를 비교한다(이 앱의 엔티티는 함수/순환참조가 없는 순수 데이터라 안전).
    const b = before[k];
    const a = after[k];
    const same = (b !== null && typeof b === "object") || (a !== null && typeof a === "object")
      ? JSON.stringify(b) === JSON.stringify(a)
      : String(b) === String(a);
    if (!same) {
      changes[k] = { before: b, after: a };
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
    performedAt: nowKST(true),
  };
  _state = { ..._state, auditLog: [entry, ..._state.auditLog] };

  // 서버(audit_log 테이블)에 영구 저장한다 — 예전엔 이 함수가 브라우저 메모리에만 쌓아서 새로고침하면
  // "전체 변경이력"이 통째로 사라졌다(수정 9). 실패해도 이미 화면엔 반영됐고 이 기록을 트리거한
  // 실제 동작(과제 수정 등)은 이미 끝난 뒤라, 굳이 되돌리지 않고 콘솔에만 남긴다.
  fetch("/api/audit-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId, entityLabel, action, changedFields }),
  }).catch((err) => console.error("변경이력 저장 실패:", err));
}

// audit_log는 추가 전용(append-only) 데이터라 다른 hydrate*와 달리 "그 사이 로컬 변경이 있으면
// 응답을 버린다" 방식이 아니라, 서버에서 가져온 과거 기록과 세션 중 새로 쌓인 기록을 id 기준으로
// 합친다 — 둘 다 잃지 않는다.
let _auditLogHydrated = false;
function hydrateAuditLog(): void {
  if (_auditLogHydrated || typeof window === "undefined") return;
  _auditLogHydrated = true;
  fetch("/api/audit-log")
    .then((res) => res.json())
    .then((data: { ok: boolean; entries?: AuditEntry[] }) => {
      if (data.ok && data.entries) {
        const localIds = new Set(_state.auditLog.map((e) => e.id));
        const merged = [..._state.auditLog, ...data.entries.filter((e) => !localIds.has(e.id))]
          .sort((a, b) => (a.performedAt < b.performedAt ? 1 : a.performedAt > b.performedAt ? -1 : 0));
        _state = { ..._state, auditLog: merged };
        notify();
      }
    })
    .catch((err) => {
      console.error("변경이력을 불러오지 못했습니다.", err);
      _auditLogHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateAuditLog();

// ============================================================
// FUNDING AGENCIES (전담기관)
// ============================================================

let _fundingAgenciesHydrated = false;
function hydrateFundingAgencies(): void {
  if (_fundingAgenciesHydrated || typeof window === "undefined") return;
  _fundingAgenciesHydrated = true;
  const snapshotAtStart = _state.fundingAgencies;
  fetch("/api/funding-agencies")
    .then((res) => res.json())
    .then((data: { ok: boolean; agencies?: FundingAgency[]; agencyGuides?: Record<string, AgencyGuideTab[]> }) => {
      // 이 요청이 떠 있는 동안 이미 수정이 있었으면 그 전 시점의 이 응답으로 덮어쓰지 않는다(수정 8).
      if (data.ok && data.agencies && _state.fundingAgencies === snapshotAtStart) {
        // agencyGuides(운용 안내)도 여기서 함께 채운다 — 이걸 안 하면 서버엔 저장돼 있어도 화면엔
        // 항상 빈 상태로 시작해 새로고침할 때마다 방금 작성한 안내가 사라진 것처럼 보였다. 로컬에서
        // 이미 수정한 값이 있으면(동시에 편집 중이었던 경우) 그쪽을 우선한다.
        _state = {
          ..._state,
          fundingAgencies: data.agencies,
          agencyGuides: data.agencyGuides ? { ...data.agencyGuides, ..._state.agencyGuides } : _state.agencyGuides,
        };
        notify();
      }
    })
    .catch((err) => {
      console.error("전담기관 목록을 불러오지 못했습니다.", err);
      _fundingAgenciesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateFundingAgencies();

export function addFundingAgency(data: Omit<FundingAgency, "id">): FundingAgency {
  const tempId = genId("fa");
  const item: FundingAgency = { ...data, id: tempId };
  _state = { ..._state, fundingAgencies: [..._state.fundingAgencies, item] };
  record("fundingAgency", tempId, item.name, "CREATE");
  notify();

  fetch("/api/funding-agencies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; agency?: FundingAgency; error?: string }) => {
      if (res.ok && res.agency) {
        _state = { ..._state, fundingAgencies: _state.fundingAgencies.map((a) => (a.id === tempId ? res.agency! : a)) };
      } else {
        _state = { ..._state, fundingAgencies: _state.fundingAgencies.filter((a) => a.id !== tempId) };
        console.error("전담기관 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, fundingAgencies: _state.fundingAgencies.filter((a) => a.id !== tempId) };
      notify();
      console.error("전담기관 생성 실패:", err);
    });

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

  fetch(`/api/funding-agencies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; agency?: FundingAgency; error?: string }) => {
      if (res.ok && res.agency) {
        _state = { ..._state, fundingAgencies: _state.fundingAgencies.map((a) => (a.id === id ? res.agency! : a)) };
        notify();
      } else if (!res.ok) {
        console.error("전담기관 수정 실패:", res.error);
      }
    })
    .catch((err) => console.error("전담기관 수정 실패:", err));
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

  fetch(`/api/funding-agencies/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("전담기관 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("전담기관 삭제 실패(서버):", err));

  return null;
}

// ============================================================
// INSTITUTIONS (통합 기관)
// ============================================================

let _institutionsHydrated = false;
function hydrateInstitutions(): void {
  if (_institutionsHydrated || typeof window === "undefined") return;
  _institutionsHydrated = true;
  const snapshotAtStart = _state.institutions;
  fetch("/api/institutions")
    .then((res) => res.json())
    .then((data: { ok: boolean; institutions?: Institution[] }) => {
      if (data.ok && data.institutions && _state.institutions === snapshotAtStart) {
        _state = { ..._state, institutions: data.institutions };
        notify();
      }
    })
    .catch((err) => {
      console.error("기관 목록을 불러오지 못했습니다.", err);
      _institutionsHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateInstitutions();

export function addInstitution(data: Omit<Institution, "id">): Institution {
  const tempId = genId("inst");
  const item: Institution = { ...data, id: tempId };
  _state = { ..._state, institutions: [..._state.institutions, item] };
  record("institution", tempId, item.name, "CREATE");
  notify();

  fetch("/api/institutions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; institution?: Institution; error?: string }) => {
      if (res.ok && res.institution) {
        _state = { ..._state, institutions: _state.institutions.map((i) => (i.id === tempId ? res.institution! : i)) };
      } else {
        _state = { ..._state, institutions: _state.institutions.filter((i) => i.id !== tempId) };
        console.error("기관 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, institutions: _state.institutions.filter((i) => i.id !== tempId) };
      notify();
      console.error("기관 생성 실패:", err);
    });

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

  fetch(`/api/institutions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; institution?: Institution; error?: string }) => {
      if (res.ok && res.institution) {
        _state = { ..._state, institutions: _state.institutions.map((i) => (i.id === id ? res.institution! : i)) };
        notify();
      } else if (!res.ok) {
        console.error("기관 수정 실패:", res.error);
      }
    })
    .catch((err) => console.error("기관 수정 실패:", err));
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

  fetch(`/api/institutions/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("기관 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("기관 삭제 실패(서버):", err));

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
  // 과제 등록 시 입력한 "당해 정부출연금/민간현금/민간현물"은 과제 단위 합계일 뿐, 실제 수수료
  // 산정과 참여기관 목록의 사업비 표시는 참여기관(ProjectMember)별 cashBudget/inKindBudget을
  // 본다 — 아직 공동기관을 등록하지 않은 시점엔 그 합계 전부가 주관기관 몫이므로 여기로 그대로
  // 넘겨준다. 안 그러면 상세 화면 사업비 구분 카드엔 값이 보이는데 참여기관 목록은 0원으로 남는다.
  const cashBudget = (project.govGrant ?? 0) + (project.privateCash ?? 0);
  const inKindBudget = project.privateInKind ?? 0;
  addProjectMember({
    projectId: project.id,
    projectNumber: project.projectNumber,
    institutionId: project.leadInstitutionId,
    institutionName: project.leadInstitutionName || inst?.name || "",
    institutionType: inst?.type ?? "중소기업",
    role: "LEAD",
    budget: cashBudget + inKindBudget,
    feeRate: 0,
    calculatedFee: 0,
    // 기관 등록 시 입력해둔 담당자·등급을 그대로 물려받는다 — 안 그러면 매 과제마다 실무자
    // 연락처를 처음부터 다시 입력해야 한다(등급도 항상 "일반"으로 시작해 매번 다시 골라야 했다).
    institutionGrade: inst?.referenceGrade ?? "일반",
    contactName: inst?.contactName,
    contactEmail: inst?.contactEmail,
    contactPhone: inst?.contactPhone,
    settlementType: "위탁정산",
    cashBudget,
    inKindBudget,
    annualBudgets: (cashBudget > 0 || inKindBudget > 0)
      ? [{ termYear: new Date(project.startDate).getFullYear(), termNumber: project.currentTerm, cashBudget, inKindBudget }]
      : undefined,
  });
}

// 과제코드(SH + 6자리 순번, 예: SH000001) — 전담기관마다 제각각으로 붙던 방식을 버리고, 등록 순서
// 그대로 회사 전체 기준 일련번호 하나로 통일해서 시스템이 매긴다(전담기관과 무관). 연차마다 코드가
// 달라야 해서(termCodes) 과제 전체가 아니라 "회사 전체에서 지금까지 발급된 모든 연차 코드" 중
// 최댓값 다음 번호를 내준다 — projectCode(과거 방식의 1연차 코드)와 termCodes를 모두 훑는다.
function nextTermCode(): string {
  let max = 0;
  const consider = (code: string | undefined) => {
    if (!code?.startsWith("SH")) return;
    const n = parseInt(code.slice(2), 10);
    if (Number.isFinite(n) && n > max) max = n;
  };
  for (const p of _state.projects) {
    consider(p.projectCode);
    for (const t of p.termCodes ?? []) consider(t.code);
  }
  return `SH${String(max + 1).padStart(6, "0")}`;
}

let _projectsHydrated = false;
function hydrateProjects(): void {
  if (_projectsHydrated || typeof window === "undefined") return;
  _projectsHydrated = true;
  const snapshotAtStart = _state.projects;
  fetch("/api/projects")
    .then((res) => res.json())
    .then((data: { ok: boolean; projects?: Project[] }) => {
      // 이 요청이 떠 있는 동안 사용자가 이미 뭔가 저장했으면(주관기관 지정 등) _state.projects는
      // 그 사이 새 배열로 바뀌어 있다 — 그런데 이 응답은 그 수정 "전" 시점의 스냅샷이라, 그대로
      // 덮어쓰면 방금 한 수정이 몇 초 뒤 조용히 사라져 버린다(수정 8). 그 사이 아무 수정도 없었을
      // 때만(참조가 그대로일 때만) 반영한다 — 있었다면 이미 최신 상태이므로 이 응답은 버린다.
      if (data.ok && data.projects && _state.projects === snapshotAtStart) {
        _state = { ..._state, projects: data.projects };
        notify();
      }
    })
    .catch((err) => {
      console.error("과제 목록을 불러오지 못했습니다.", err);
      _projectsHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateProjects();

// 과제 생성 직후엔 임시 id로 상세화면에 진입하는데, 서버 응답이 도착하면 그 id가 실제 DB GUID로
// 바뀐다(아래 addProject 참고) — 그 사이 이미 임시 id로 라우팅된 화면이 "찾을 수 없음"에 빠지지
// 않도록, 상세화면이 이 맵으로 새 id를 찾아 리다이렉트할 수 있게 해준다.
const _projectIdRemap = new Map<string, string>();
export function resolveProjectId(id: string): string {
  return _projectIdRemap.get(id) ?? id;
}

// 과제 생성이 끝나 진짜 id를 알기 전까지 들어온 수정 요청은 여기 등록해뒀다가, 생성이 끝나면 그
// 진짜 id로 다시 보내도록 updateProject가 확인한다(updateProjectMember의 _pendingMemberCreates와
// 동일한 이유) — 안 그러면 임시 id로 보낸 PATCH가 404로 조용히 실패하고, 뒤이어 도착하는 생성 응답이
// 그 수정사항 없는 상태로 덮어써 버린다. 엑셀 업로드가 과제를 새로 만든 직후 곧바로 주관기관을
// 채워 넣을 때(주관기관 정보 보정 단계) 실제로 이 경합이 발생해, 화면엔 주관기관이 정상 등록된
// 것처럼 보이다가 몇 초 뒤(생성 응답 도착 시점) 조용히 빈 값으로 되돌아가던 버그의 원인이었다.
const _pendingProjectCreates = new Map<string, Promise<string>>();

export function addProject(data: Omit<Project, "id">): Project {
  const projectCode = data.projectCode ?? nextTermCode();
  const termCodes = data.termCodes ?? [{ termNumber: 1, code: projectCode }];
  const tempId = genId("p");
  const item: Project = { registeredAt: todayKST(), ...data, projectCode, termCodes, id: tempId };
  _state = { ..._state, projects: [..._state.projects, item] };
  record("project", tempId, item.projectName, "CREATE");
  ensureLeadMember(item);
  notify();

  const promise = fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) })
    .then((res) => res.json())
    .then((res: { ok: boolean; project?: Project; error?: string }) => {
      if (res.ok && res.project) {
        // id가 임시값에서 실제 DB GUID로 바뀌므로, 이미 로컬에 만들어둔 참여기관(ensureLeadMember)의
        // projectId도 함께 옮겨줘야 이후 조회/수정이 새 id로 정상 매칭된다. 그 참여기관을 저장하려던
        // persistProjectMember 시도는 이 시점 이전엔 project가 서버에 없어 실패했을 수 있으므로 재시도한다.
        const realId = res.project.id;
        _projectIdRemap.set(tempId, realId);
        const remapped = _state.projectMembers.filter((m) => m.projectId === tempId);
        _state = {
          ..._state,
          projects: _state.projects.map((p) => (p.id === tempId ? res.project! : p)),
          projectMembers: _state.projectMembers.map((m) => (m.projectId === tempId ? { ...m, projectId: realId } : m)),
        };
        for (const m of remapped) persistProjectMember({ ...m, projectId: realId });
        autoGenerateTermFees(realId);
        notify();
        return realId;
      } else {
        _state = {
          ..._state,
          projects: _state.projects.filter((p) => p.id !== tempId),
          projectMembers: _state.projectMembers.filter((m) => m.projectId !== tempId),
        };
        console.error("과제 생성 실패:", res.error);
        notify();
        return tempId;
      }
    })
    .catch((err) => {
      _state = {
        ..._state,
        projects: _state.projects.filter((p) => p.id !== tempId),
        projectMembers: _state.projectMembers.filter((m) => m.projectId !== tempId),
      };
      notify();
      console.error("과제 생성 실패:", err);
      return tempId;
    })
    .finally(() => {
      _pendingProjectCreates.delete(tempId);
    });
  _pendingProjectCreates.set(tempId, promise);

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

  // id가 아직 서버가 모르는 임시 id(방금 addProject로 막 만든 직후)면, 그 생성 요청이 끝나 진짜 id를
  // 알기 전까지 이 수정 요청을 미뤄뒀다가 진짜 id로 다시 보낸다 — 위 _pendingProjectCreates 설명 참고.
  const sendPatch = (realId: string) => {
    fetch(`/api/projects/${realId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then((res) => res.json())
      .then((res: { ok: boolean; project?: Project; error?: string }) => {
        if (res.ok && res.project) {
          _state = { ..._state, projects: _state.projects.map((p) => (p.id === realId ? res.project! : p)) };
          notify();
        } else if (!res.ok) {
          console.error("과제 수정 실패:", res.error);
        }
      })
      .catch((err) => console.error("과제 수정 실패:", err));
  };

  const pendingCreate = _pendingProjectCreates.get(id);
  if (pendingCreate) {
    pendingCreate.then(sendPatch);
  } else {
    sendPatch(id);
  }
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

  fetch(`/api/projects/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("과제 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("과제 삭제 실패(서버):", err));
}

// 과제 하나를 통째로 지우지 않고, 특정 연차(들)의 수수료·세금계산서·미청구·미수금 데이터만 지운다 —
// 잘못 생성된 연차나 엑셀 업로드로 중복 생성된 연차를 골라서 정리할 때 쓴다.
// 참여기관의 annualBudgets(해당 연차 사업비)도 같이 지워야 한다 — 안 그러면 다음 자동 재계산
// (autoGenerateTermFees)이 그 사업비를 보고 지운 연차를 그대로 다시 만들어낸다.
// 확정(CONFIRMED/BILLED)되었거나 수동조정된 연차는 호출부(UI)에서 애초에 선택 못 하게 막지만,
// 혹시 몰라 여기서도 한 번 더 걸러 실수로 확정 데이터가 삭제되지 않게 한다.
export function deleteProjectTerms(projectId: string, termNumbers: number[]): void {
  const project = _state.projects.find((p) => p.id === projectId);
  if (!project || termNumbers.length === 0) return;
  const num = project.projectNumber;
  const termSet = new Set(termNumbers);
  const isDeletable = (f: TermFee) =>
    termSet.has(f.termNumber) && f.status !== "CONFIRMED" && f.status !== "BILLED" && !f.manualOverride;
  const actuallyDeleted = new Set(
    _state.termFees.filter((f) => f.projectNumber === num && isDeletable(f)).map((f) => f.termNumber)
  );
  if (actuallyDeleted.size === 0) return;

  // 진행 연차(currentTerm)의 데이터가 삭제 대상에 포함되면, 그 포인터를 그대로 두면 수수료 관리 목록의
  // "현재연차 사업비 미입력" 자리표시 행이 곧바로 다시 나타나 실질적으로 삭제되지 않은 것처럼 보인다
  // (currentTerm이 아닌 다른 연차는 그 연차를 가리키는 포인터가 따로 없어 이 문제가 없다 — 그냥 사라진다).
  // 남아있는 연차 중 가장 큰 번호로 되돌려 삭제가 실제로 반영되게 한다. 총연차(totalTerms)는 계약
  // 기간 자체를 나타내는 값이라 손대지 않는다 — 나중에 그 연차 사업비를 다시 입력하면 그대로 되살아난다.
  const remainingTermNumbers = _state.termFees
    .filter((f) => f.projectNumber === num && !actuallyDeleted.has(f.termNumber))
    .map((f) => f.termNumber);
  const nextCurrentTerm = actuallyDeleted.has(project.currentTerm)
    ? (remainingTermNumbers.length > 0 ? Math.max(...remainingTermNumbers) : 1)
    : project.currentTerm;

  _state = {
    ..._state,
    projects: _state.projects.map((p) => (p.id === projectId ? { ...p, currentTerm: nextCurrentTerm } : p)),
    termFees: _state.termFees.filter((f) => !(f.projectNumber === num && actuallyDeleted.has(f.termNumber))),
    termFeeCalcs: _state.termFeeCalcs.filter((c) => !(c.projectNumber === num && actuallyDeleted.has(c.termNumber))),
    unclaimedFees: _state.unclaimedFees.filter((u) => !(u.projectNumber === num && actuallyDeleted.has(u.termNumber))),
    receivables: _state.receivables.filter((r) => !(r.projectNumber === num && actuallyDeleted.has(r.termNumber))),
    taxInvoices: _state.taxInvoices.filter((t) => !(t.projectNumber === num && actuallyDeleted.has(t.termNumber))),
    projectMembers: _state.projectMembers.map((m) => {
      if (m.projectId !== projectId) return m;
      return {
        ...m,
        annualBudgets: m.annualBudgets?.filter((b) => !actuallyDeleted.has(b.termNumber)),
        gradeOverrides: m.gradeOverrides?.filter((g) => !actuallyDeleted.has(g.termNumber)),
        settlementTypeOverrides: m.settlementTypeOverrides?.filter((s) => !actuallyDeleted.has(s.termNumber)),
        recipientOverrides: m.recipientOverrides?.filter((r) => !actuallyDeleted.has(r.termNumber)),
      };
    }),
  };
  record("project", projectId, project.projectName, "DELETE", {
    deletedTerms: { before: [], after: Array.from(actuallyDeleted).sort((a, b) => a - b).map((n) => `${n}연차`) },
  });
  notify();

  fetch(`/api/projects/${projectId}/delete-terms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termNumbers: Array.from(actuallyDeleted) }),
  })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("연차 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("연차 삭제 실패(서버):", err));
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

let _projectMembersHydrated = false;
function hydrateProjectMembers(): void {
  if (_projectMembersHydrated || typeof window === "undefined") return;
  _projectMembersHydrated = true;
  const snapshotAtStart = _state.projectMembers;
  fetch("/api/project-members")
    .then((res) => res.json())
    .then((data: { ok: boolean; members?: ProjectMember[] }) => {
      // hydrateProjects와 동일한 이유(수정 8) — 이 요청이 떠 있는 동안 참여기관을 이미 수정했으면
      // (주관기관 지정 등) 그 수정 전 시점의 이 응답으로 덮어쓰지 않는다.
      if (data.ok && data.members && _state.projectMembers === snapshotAtStart) {
        _state = { ..._state, projectMembers: data.members };
        notify();
      }
    })
    .catch((err) => {
      console.error("참여기관 목록을 불러오지 못했습니다.", err);
      _projectMembersHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateProjectMembers();

// project-members는 (project, institution) 그룹 단위 id를 서버가 매길 뿐 아니라 요청 시점에
// project가 아직 임시 id(addProject의 fetch가 아직 안 끝났을 때 ensureLeadMember가 부르는 경우)일
// 수도 있어 실패가 정상적으로 일어날 수 있다 — addProject 쪽에서 실제 id를 받은 뒤 다시 부른다.
// 참여기관을 새로 등록한 직후(item.id가 아직 서버가 모르는 임시 id "pm-...")에 곧바로 그
// 참여기관을 수정하면(예: 주관기관 지정 직후 "정보수정"에서 실무자 입력), updateProjectMember가
// 그 임시 id로 PATCH를 보내는데 서버엔 존재하지 않는 id라 조용히 404로 실패하고, 뒤이어 도착하는
// 이 생성 응답이 그 수정사항 없는 원래 상태로 덮어써 버려 편집이 통째로 사라졌었다(수정 7).
// 생성이 끝나 진짜 id를 알기 전까지 들어온 수정 요청은 여기 등록해뒀다가, 생성이 끝나면 그 진짜
// id로 다시 보내도록 updateProjectMember가 확인한다.
const _pendingMemberCreates = new Map<string, Promise<string>>();

function persistProjectMember(item: ProjectMember): void {
  const promise = fetch("/api/project-members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) })
    .then((res) => res.json())
    .then((res: { ok: boolean; member?: ProjectMember; error?: string }) => {
      if (res.ok && res.member) {
        _state = { ..._state, projectMembers: _state.projectMembers.map((m) => (m.id === item.id ? res.member! : m)) };
        notify();
        return res.member.id;
      }
      if (!res.ok) console.error("참여기관 저장 실패:", res.error);
      return item.id;
    })
    .catch((err) => {
      console.error("참여기관 저장 실패:", err);
      return item.id;
    })
    .finally(() => {
      _pendingMemberCreates.delete(item.id);
    });
  _pendingMemberCreates.set(item.id, promise);
}

export function addProjectMember(data: Omit<ProjectMember, "id">): ProjectMember {
  const item: ProjectMember = { ...data, id: genId("pm") };
  _state = { ..._state, projectMembers: [..._state.projectMembers, item] };
  record("projectMember", item.id, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  autoGenerateTermFees(item.projectId);
  recalcProjectTotalBudget(item.projectId);
  notify();
  persistProjectMember(item);
  return item;
}

// 수수료 산정에 영향을 주는 필드 — 변경 시 해당 과제의 연차별 수수료를 자동 재산정한다.
const FEE_AFFECTING_FIELDS = ["budget", "cashBudget", "inKindBudget", "institutionGrade", "gradeOverrides", "settlementType", "settlementTypeOverrides", "annualBudgets", "role"] as const;

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
    createdAt: nowKST(),
    priority: "MEDIUM",
    status: "OPEN",
    institutionName: before.institutionName,
  });
}

// 정산구분은 기관이 속한 "단계" 전체의 특성이다 — 한 단계 안에서 연차마다 다른 정산구분을
// 갖는 건 의미가 없으므로, 특정 연차에서 정산구분이 바뀌면 그 연차가 속한 단계 전체(과거 연차
// 포함)에 동일하게 소급 반영한다(양방향: 자체→위탁, 위탁→자체 모두). 단계가 이미 정산
// 완료됐으면(정산 연차가 CONFIRMED/BILLED) 과거를 소급해서 건드리지 않고 null을 반환한다.
// 등급(institutionGrade/gradeOverrides)은 화면 표시용 참고 라벨일 뿐이라 여기서는 절대 건드리지
// 않는다 — 면제/일반 수수료 버킷 분류는 fee-calculator.ts가 오직 그 시점의 정산구분만으로
// 판단하므로, 등급 표시가 바뀌지 않아도 계산은 정산구분을 따라 정확히 달라진다.
function cascadeSettlementStage(
  project: Project,
  originTerm: number,
  targetType: "위탁정산" | "자체정산",
  baseAfterSettlementOverrides: { termNumber: number; settlementType: "위탁정산" | "자체정산" }[]
): { termNumber: number; settlementType: "위탁정산" | "자체정산" }[] | null {
  if (isStageSettledForTerm(project, originTerm)) return null;

  const stageRange = getStageRangeForTerm(project, originTerm);
  const stageTerms: number[] = [];
  for (let t = stageRange.startTermNumber; t <= stageRange.endTermNumber; t++) stageTerms.push(t);

  return [
    ...baseAfterSettlementOverrides.filter((o) => o.termNumber < stageRange.startTermNumber || o.termNumber > stageRange.endTermNumber),
    ...stageTerms.map((t) => ({ termNumber: t, settlementType: targetType })),
  ].sort((a, b) => a.termNumber - b.termNumber);
}

// 정산구분 변경은 두 갈래로 나눠 다르게 남긴다:
//  - "무엇이 바뀌었다/자동 반영됐다"처럼 결과를 그대로 알리기만 하면 되는 경우는 메모(이슈)를
//    만들지 않는다 — updateProjectMember가 매번 record()로 변경이력(AuditEntry)에 변경 전/후
//    값을 그대로 남기므로 거기서 확인할 수 있다.
//  - 자동 반영이 "안 됐거나 못 한" 경우(이미 정산 완료된 단계라 소급을 못 한 경우)는 담당자가
//    직접 확인/조치해야 하니 메모(이슈)로 남긴다.
function applyMemberChangeTracking(before: ProjectMember, data: Partial<ProjectMember>): Partial<ProjectMember> {
  const result: Partial<ProjectMember> = { ...data };
  const project = _state.projects.find((p) => p.id === before.projectId);

  function warnCascadeBlocked(originTerm: number, targetType: "위탁정산" | "자체정산") {
    logMemberChangeMemo(before,
      `${before.institutionName}: ${originTerm}연차에서 ${targetType}으로 변경됐지만 이미 정산 완료된 단계라 정산구분이 자동으로 소급 반영되지 않았습니다. 확인해주세요.`
    );
  }

  if (project && data.settlementTypeOverrides !== undefined) {
    const beforeOverrides = before.settlementTypeOverrides ?? [];
    const afterOverrides = data.settlementTypeOverrides;
    const changed = afterOverrides.filter((o) => {
      const prevAtTerm = beforeOverrides.find((b) => b.termNumber === o.termNumber)?.settlementType ?? before.settlementType;
      return prevAtTerm !== o.settlementType;
    });
    if (changed.length > 0) {
      const originTerm = Math.min(...changed.map((o) => o.termNumber));
      const targetType = changed.find((o) => o.termNumber === originTerm)!.settlementType;
      const cascaded = cascadeSettlementStage(project, originTerm, targetType, afterOverrides);
      if (cascaded) {
        result.settlementTypeOverrides = cascaded;
      } else {
        warnCascadeBlocked(originTerm, targetType);
      }
    }
  } else if (project && data.settlementType !== undefined && data.settlementType !== before.settlementType) {
    // 엑셀 업로드 경로 — 연차별 오버라이드가 아니라 과제×기관당 단일값을 그대로 덮어쓰므로,
    // 지금 진행연차(currentTerm)를 기준 연차로 보고 동일한 소급 반영 규칙을 적용한다.
    const originTerm = project.currentTerm ?? 1;
    const targetType = data.settlementType;
    const cascaded = cascadeSettlementStage(project, originTerm, targetType, before.settlementTypeOverrides ?? []);
    if (cascaded) {
      result.settlementTypeOverrides = cascaded;
    } else {
      warnCascadeBlocked(originTerm, targetType);
    }
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
  // 참여기관목록에서 역할을 "주관"으로 바꾸면 실제 과제의 주관기관(project.leadInstitutionId·
  // leadInstitutionName)도 함께 바뀌어야 한다 — 안 그러면 목록 표시와, 이 값을 그대로 참조하는
  // 수수료·공문발송·매출·수금 로직이 서로 다른 기관을 주관기관으로 보게 된다. 주관은 항상 한 곳이어야
  // 하므로 기존에 "주관"이던 다른 참여기관은 "공동"으로 강등한다.
  if (trackedData.role === "LEAD" && before.role !== "LEAD") {
    _state.projectMembers
      .filter((m) => m.projectId === after.projectId && m.id !== after.id && m.role === "LEAD")
      .forEach((m) => updateProjectMember(m.id, { role: "PARTICIPANT" }));
    updateProject(after.projectId, {
      leadInstitutionId: after.institutionId,
      leadInstitutionName: after.institutionName,
    });
  }
  notify();

  // recipientOverrides처럼 값을 지워서 undefined로 되돌리는 경우, JSON.stringify는 undefined인
  // 속성을 통째로 빼버려 서버가 그 필드를 아예 못 받는다(그 필드 하나만 보낼 때 특히 — 서버의
  // "이 필드가 body에 있으면 반영" 로직 자체가 안 켜져서 삭제가 저장되지 않는다). null로 바꿔
  // 보내 서버가 "명시적으로 비웠다"를 구분할 수 있게 한다.
  const body = JSON.stringify(trackedData, (_k, v) => (v === undefined ? null : v));

  // item.id가 아직 서버가 모르는 임시 id(방금 addProjectMember로 막 만든 직후)면, 그 생성 요청이
  // 끝나 진짜 id를 알기 전까지 이 수정 요청을 미뤄뒀다가 진짜 id로 다시 보낸다(수정 7 — 안 그러면
  // 임시 id로 보낸 PATCH가 404로 조용히 실패하고, 뒤이어 도착하는 생성 응답이 이 수정사항 없는
  // 상태로 덮어써 버린다).
  const sendPatch = (realId: string) => {
    fetch(`/api/project-members/${realId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
      .then((res) => res.json())
      .then((res: { ok: boolean; member?: ProjectMember; error?: string }) => {
        if (res.ok && res.member) {
          _state = { ..._state, projectMembers: _state.projectMembers.map((m) => (m.id === realId ? res.member! : m)) };
          notify();
        } else if (!res.ok) {
          console.error("참여기관 수정 실패:", res.error);
        }
      })
      .catch((err) => console.error("참여기관 수정 실패:", err));
  };

  const pendingCreate = _pendingMemberCreates.get(id);
  if (pendingCreate) {
    pendingCreate.then(sendPatch);
  } else {
    sendPatch(id);
  }
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
    const now = nowKST();
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
        recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
        institutionName,
      });
    }
  }

  if (affectedProjects.size === 0) return { updatedProjectCount: 0, updatedTermCount: 0, lockedTermCount, updatedProjects: [] };

  const changedMembers = updatedMembers.filter((m, i) => m !== _state.projectMembers[i]);
  _state = { ..._state, projectMembers: updatedMembers };
  for (const pid of affectedProjects.keys()) {
    record("project", pid, `기관 등급 변경 반영 (${newGrade})`, "UPDATE");
    autoGenerateTermFees(pid);
  }
  notify();

  for (const m of changedMembers) {
    fetch(`/api/project-members/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gradeOverrides: m.gradeOverrides }) })
      .then((res) => res.json())
      .then((res: { ok: boolean; error?: string }) => {
        if (!res.ok) console.error("등급 변경 저장 실패:", res.error);
      })
      .catch((err) => console.error("등급 변경 저장 실패:", err));
  }
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

  fetch(`/api/project-members/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("참여기관 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("참여기관 삭제 실패(서버):", err));
}

// ============================================================
// FEE POLICIES (수수료 기준 정책 — 버전 이력 포함)
// ============================================================

let _feePoliciesHydrated = false;
function hydrateFeePolicies(): void {
  if (_feePoliciesHydrated || typeof window === "undefined") return;
  _feePoliciesHydrated = true;
  const snapshotAtStart = _state.feePolicies;
  fetch("/api/fee-policies")
    .then((res) => res.json())
    .then((data: { ok: boolean; policies?: FeePolicy[] }) => {
      if (data.ok && data.policies && _state.feePolicies === snapshotAtStart) {
        _state = { ..._state, feePolicies: data.policies };
        notify();
      }
    })
    .catch((err) => {
      console.error("수수료 정책 목록을 불러오지 못했습니다.", err);
      _feePoliciesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateFeePolicies();

export function addFeePolicy(data: Omit<FeePolicy, "id">): FeePolicy {
  const tempId = genId("pol");
  const item: FeePolicy = { ...data, id: tempId };
  _state = { ..._state, feePolicies: [..._state.feePolicies, item] };
  record("feePolicy", tempId, item.name, "CREATE");
  recalcProjectsUsingPolicy(tempId);
  notify();

  fetch("/api/fee-policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; policy?: FeePolicy; error?: string }) => {
      if (res.ok && res.policy) {
        _state = { ..._state, feePolicies: _state.feePolicies.map((p) => (p.id === tempId ? res.policy! : p)) };
      } else {
        _state = { ..._state, feePolicies: _state.feePolicies.filter((p) => p.id !== tempId) };
        console.error("수수료 정책 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, feePolicies: _state.feePolicies.filter((p) => p.id !== tempId) };
      notify();
      console.error("수수료 정책 생성 실패:", err);
    });

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

  fetch(`/api/fee-policies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; policy?: FeePolicy; error?: string }) => {
      if (res.ok && res.policy) {
        _state = { ..._state, feePolicies: _state.feePolicies.map((p) => (p.id === id ? res.policy! : p)) };
        notify();
      } else if (!res.ok) {
        console.error("수수료 정책 수정 실패:", res.error);
      }
    })
    .catch((err) => console.error("수수료 정책 수정 실패:", err));
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

  fetch(`/api/fee-policies/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("수수료 정책 삭제 실패(서버):", res.error);
    })
    .catch((err) => console.error("수수료 정책 삭제 실패(서버):", err));
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

let _termFeeCalcsHydrated = false;
function hydrateTermFeeCalcs(): void {
  if (_termFeeCalcsHydrated || typeof window === "undefined") return;
  _termFeeCalcsHydrated = true;
  const snapshotAtStart = _state.termFeeCalcs;
  fetch("/api/term-fee-calcs")
    .then((res) => res.json())
    .then((data: { ok: boolean; termFeeCalcs?: TermFeeCalc[] }) => {
      if (data.ok && data.termFeeCalcs && _state.termFeeCalcs === snapshotAtStart) {
        _state = { ..._state, termFeeCalcs: data.termFeeCalcs };
        notify();
      }
    })
    .catch((err) => {
      console.error("연차수수료 산정 내역을 불러오지 못했습니다.", err);
      _termFeeCalcsHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateTermFeeCalcs();

export function addTermFeeCalc(data: Omit<TermFeeCalc, "id">): TermFeeCalc {
  const tempId = genId("tfc");
  const item: TermFeeCalc = { ...data, id: tempId };
  _state = { ..._state, termFeeCalcs: [..._state.termFeeCalcs, item] };
  record("termFeeCalc", tempId, `${item.projectNumber} · ${item.termYear}년 ${item.termNumber}연차`, "CREATE");
  notify();

  fetch("/api/term-fee-calcs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; termFeeCalc?: TermFeeCalc; error?: string }) => {
      if (res.ok && res.termFeeCalc) {
        _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === tempId ? res.termFeeCalc! : f)) };
      } else {
        _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.filter((f) => f.id !== tempId) };
        console.error("연차수수료 산정 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.filter((f) => f.id !== tempId) };
      notify();
      console.error("연차수수료 산정 생성 실패:", err);
    });

  return item;
}

function persistTermFeeCalc(id: string, data: Partial<TermFeeCalc>): void {
  fetch(`/api/term-fee-calcs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; termFeeCalc?: TermFeeCalc; error?: string }) => {
      if (res.ok && res.termFeeCalc) {
        _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === id ? res.termFeeCalc! : f)) };
        notify();
      } else if (!res.ok) console.error("연차수수료 산정 수정 실패:", res.error);
    })
    .catch((err) => console.error("연차수수료 산정 수정 실패:", err));
}

export function updateTermFeeCalc(id: string, data: Partial<TermFeeCalc>): void {
  const before = _state.termFeeCalcs.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data, updatedAt: todayKST() };
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === id ? after : f)) };
  record("termFeeCalc", id, `${after.projectNumber} · ${after.termYear}년 ${after.termNumber}연차`, "UPDATE",
    diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
  persistTermFeeCalc(id, data);
}

export function addTermFeeCalcOverride(
  id: string,
  override: FeeOverride,
): void {
  const before = _state.termFeeCalcs.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, overrides: [...before.overrides, override], updatedAt: todayKST() };
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.map((f) => (f.id === id ? after : f)) };
  record("termFeeCalc", id, `${after.projectNumber} 오버라이드 추가`, "UPDATE");
  notify();
  persistTermFeeCalc(id, { overrides: after.overrides });
}

export function deleteTermFeeCalc(id: string): void {
  const item = _state.termFeeCalcs.find((f) => f.id === id);
  if (!item) return;
  _state = { ..._state, termFeeCalcs: _state.termFeeCalcs.filter((f) => f.id !== id) };
  record("termFeeCalc", id, item.projectNumber, "DELETE");
  notify();

  fetch(`/api/term-fee-calcs/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("연차수수료 산정 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("연차수수료 산정 삭제 실패(서버):", err));
}

// ============================================================
// TERM FEES (연차별 수수료 산정 내역)
// ============================================================

let _termFeesHydrated = false;
function hydrateTermFees(): void {
  if (_termFeesHydrated || typeof window === "undefined") return;
  _termFeesHydrated = true;
  const snapshotAtStart = _state.termFees;
  fetch("/api/term-fees")
    .then((res) => res.json())
    .then((data: { ok: boolean; termFees?: TermFee[] }) => {
      if (data.ok && data.termFees && _state.termFees === snapshotAtStart) {
        _state = { ..._state, termFees: data.termFees };
        notify();
      }
    })
    .catch((err) => {
      console.error("연차수수료 목록을 불러오지 못했습니다.", err);
      _termFeesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateTermFees();

function persistTermFee(id: string, data: Partial<TermFee>): void {
  fetch(`/api/term-fees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; termFee?: TermFee; error?: string }) => {
      if (res.ok && res.termFee) {
        _state = { ..._state, termFees: _state.termFees.map((f) => (f.id === id ? res.termFee! : f)) };
        notify();
      } else if (!res.ok) console.error("연차수수료 수정 실패:", res.error);
    })
    .catch((err) => console.error("연차수수료 수정 실패:", err));
}

export function addTermFee(data: Omit<TermFee, "id">): TermFee {
  const tempId = genId("tf");
  const item: TermFee = { ...data, id: tempId };
  _state = { ..._state, termFees: [..._state.termFees, item] };
  record("termFee", tempId, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  notify();

  fetch("/api/term-fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; termFee?: TermFee; error?: string }) => {
      if (res.ok && res.termFee) {
        _state = { ..._state, termFees: _state.termFees.map((f) => (f.id === tempId ? res.termFee! : f)) };
      } else {
        _state = { ..._state, termFees: _state.termFees.filter((f) => f.id !== tempId) };
        console.error("연차수수료 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, termFees: _state.termFees.filter((f) => f.id !== tempId) };
      notify();
      console.error("연차수수료 생성 실패:", err);
    });

  return item;
}

export function updateTermFee(id: string, data: Partial<TermFee>): void {
  const before = _state.termFees.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, termFees: _state.termFees.map((f) => (f.id === id ? after : f)) };
  record("termFee", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();
  persistTermFee(id, data);
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
  for (const t of targets) persistTermFee(t.id, { otherFirmHandled });
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
  for (const t of targets) persistTermFee(t.id, { termStartDate: termStartDate ?? undefined, termEndDate: termEndDate ?? undefined });
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
  for (const t of targets) persistTermFee(t.id, { billingType });
}

// ============================================================
// UNCLAIMED FEES
// ============================================================

let _unclaimedFeesHydrated = false;
function hydrateUnclaimedFees(): void {
  if (_unclaimedFeesHydrated || typeof window === "undefined") return;
  _unclaimedFeesHydrated = true;
  const snapshotAtStart = _state.unclaimedFees;
  fetch("/api/unclaimed-fees")
    .then((res) => res.json())
    .then((data: { ok: boolean; unclaimedFees?: UnclaimedFee[] }) => {
      if (data.ok && data.unclaimedFees && _state.unclaimedFees === snapshotAtStart) {
        _state = { ..._state, unclaimedFees: data.unclaimedFees };
        notify();
      }
    })
    .catch((err) => {
      console.error("미청구수수료 목록을 불러오지 못했습니다.", err);
      _unclaimedFeesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateUnclaimedFees();

export function addUnclaimedFee(data: Omit<UnclaimedFee, "id">): UnclaimedFee {
  const tempId = genId("uc");
  const item: UnclaimedFee = { ...data, id: tempId };
  _state = { ..._state, unclaimedFees: [..._state.unclaimedFees, item] };
  record("unclaimed", tempId, `${item.projectNumber} · ${item.leadInstitutionName}`, "CREATE");
  notify();

  fetch("/api/unclaimed-fees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; unclaimedFee?: UnclaimedFee; error?: string }) => {
      if (res.ok && res.unclaimedFee) {
        _state = { ..._state, unclaimedFees: _state.unclaimedFees.map((f) => (f.id === tempId ? res.unclaimedFee! : f)) };
      } else {
        _state = { ..._state, unclaimedFees: _state.unclaimedFees.filter((f) => f.id !== tempId) };
        console.error("미청구수수료 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, unclaimedFees: _state.unclaimedFees.filter((f) => f.id !== tempId) };
      notify();
      console.error("미청구수수료 생성 실패:", err);
    });

  return item;
}

export function updateUnclaimedFee(id: string, data: Partial<UnclaimedFee>): void {
  const before = _state.unclaimedFees.find((f) => f.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, unclaimedFees: _state.unclaimedFees.map((f) => (f.id === id ? after : f)) };
  record("unclaimed", id, `${after.projectNumber} · ${after.leadInstitutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();

  fetch(`/api/unclaimed-fees/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; unclaimedFee?: UnclaimedFee; error?: string }) => {
      if (res.ok && res.unclaimedFee) {
        _state = { ..._state, unclaimedFees: _state.unclaimedFees.map((f) => (f.id === id ? res.unclaimedFee! : f)) };
        notify();
      } else if (!res.ok) console.error("미청구수수료 수정 실패:", res.error);
    })
    .catch((err) => console.error("미청구수수료 수정 실패:", err));
}

// ============================================================
// RECEIVABLES
// ============================================================

let _receivablesHydrated = false;
function hydrateReceivables(): void {
  if (_receivablesHydrated || typeof window === "undefined") return;
  _receivablesHydrated = true;
  const snapshotAtStart = _state.receivables;
  fetch("/api/receivables")
    .then((res) => res.json())
    .then((data: { ok: boolean; receivables?: Receivable[] }) => {
      if (data.ok && data.receivables && _state.receivables === snapshotAtStart) {
        _state = { ..._state, receivables: data.receivables };
        notify();
      }
    })
    .catch((err) => {
      console.error("미수금 목록을 불러오지 못했습니다.", err);
      _receivablesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateReceivables();

export function addReceivable(data: Omit<Receivable, "id">): Receivable {
  const tempId = genId("rv");
  const item: Receivable = { ...data, id: tempId };
  _state = { ..._state, receivables: [..._state.receivables, item] };
  record("receivable", tempId, `${item.projectNumber} · ${item.leadInstitutionName}`, "CREATE");
  notify();

  fetch("/api/receivables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; receivable?: Receivable; error?: string }) => {
      if (res.ok && res.receivable) {
        _state = { ..._state, receivables: _state.receivables.map((r) => (r.id === tempId ? res.receivable! : r)) };
      } else {
        _state = { ..._state, receivables: _state.receivables.filter((r) => r.id !== tempId) };
        console.error("미수금 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, receivables: _state.receivables.filter((r) => r.id !== tempId) };
      notify();
      console.error("미수금 생성 실패:", err);
    });

  return item;
}

export function updateReceivable(id: string, data: Partial<Receivable>): void {
  const before = _state.receivables.find((r) => r.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, receivables: _state.receivables.map((r) => (r.id === id ? after : r)) };
  record("receivable", id, `${after.projectNumber} · ${after.leadInstitutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();

  fetch(`/api/receivables/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; receivable?: Receivable; error?: string }) => {
      if (res.ok && res.receivable) {
        _state = { ..._state, receivables: _state.receivables.map((r) => (r.id === id ? res.receivable! : r)) };
        notify();
      } else if (!res.ok) console.error("미수금 수정 실패:", res.error);
    })
    .catch((err) => console.error("미수금 수정 실패:", err));
}

// ============================================================
// SETTLEMENTS
// ============================================================

let _settlementsHydrated = false;
function hydrateSettlements(): void {
  if (_settlementsHydrated || typeof window === "undefined") return;
  _settlementsHydrated = true;
  const snapshotAtStart = _state.settlements;
  fetch("/api/settlements")
    .then((res) => res.json())
    .then((data: { ok: boolean; settlements?: Settlement[] }) => {
      if (data.ok && data.settlements && _state.settlements === snapshotAtStart) {
        _state = { ..._state, settlements: data.settlements };
        notify();
      }
    })
    .catch((err) => {
      console.error("정산 목록을 불러오지 못했습니다.", err);
      _settlementsHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateSettlements();

export function addSettlement(data: Omit<Settlement, "id">): Settlement {
  const tempId = genId("st");
  const item: Settlement = { ...data, id: tempId };
  _state = { ..._state, settlements: [..._state.settlements, item] };
  record("settlement", tempId, `${item.projectNumber} · ${item.institutionName}`, "CREATE");
  notify();

  fetch("/api/settlements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; settlement?: Settlement; error?: string }) => {
      if (res.ok && res.settlement) {
        _state = { ..._state, settlements: _state.settlements.map((s) => (s.id === tempId ? res.settlement! : s)) };
      } else {
        _state = { ..._state, settlements: _state.settlements.filter((s) => s.id !== tempId) };
        console.error("정산 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, settlements: _state.settlements.filter((s) => s.id !== tempId) };
      notify();
      console.error("정산 생성 실패:", err);
    });

  return item;
}

export function updateSettlement(id: string, data: Partial<Settlement>): void {
  const before = _state.settlements.find((s) => s.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, settlements: _state.settlements.map((s) => (s.id === id ? after : s)) };
  record("settlement", id, `${after.projectNumber} · ${after.institutionName}`, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();

  fetch(`/api/settlements/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; settlement?: Settlement; error?: string }) => {
      if (res.ok && res.settlement) {
        _state = { ..._state, settlements: _state.settlements.map((s) => (s.id === id ? res.settlement! : s)) };
        notify();
      } else if (!res.ok) console.error("정산 수정 실패:", res.error);
    })
    .catch((err) => console.error("정산 수정 실패:", err));
}

// ============================================================
// PROJECT ISSUES (이슈/메모)
// ============================================================

let _projectIssuesHydrated = false;
function hydrateProjectIssues(): void {
  if (_projectIssuesHydrated || typeof window === "undefined") return;
  _projectIssuesHydrated = true;
  const snapshotAtStart = _state.projectIssues;
  fetch("/api/project-issues")
    .then((res) => res.json())
    .then((data: { ok: boolean; projectIssues?: ProjectIssue[] }) => {
      if (data.ok && data.projectIssues && _state.projectIssues === snapshotAtStart) {
        _state = { ..._state, projectIssues: data.projectIssues };
        notify();
      }
    })
    .catch((err) => {
      console.error("이슈 목록을 불러오지 못했습니다.", err);
      _projectIssuesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateProjectIssues();

export function addProjectIssue(data: Omit<ProjectIssue, "id">): ProjectIssue {
  const tempId = genId("pi");
  const item: ProjectIssue = { ...data, id: tempId };
  _state = { ..._state, projectIssues: [..._state.projectIssues, item] };
  record("projectIssue", tempId, `${item.projectNumber} 이슈`, "CREATE");
  notify();

  fetch("/api/project-issues", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; projectIssue?: ProjectIssue; error?: string }) => {
      if (res.ok && res.projectIssue) {
        _state = { ..._state, projectIssues: _state.projectIssues.map((i) => (i.id === tempId ? res.projectIssue! : i)) };
      } else {
        _state = { ..._state, projectIssues: _state.projectIssues.filter((i) => i.id !== tempId) };
        console.error("이슈 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, projectIssues: _state.projectIssues.filter((i) => i.id !== tempId) };
      notify();
      console.error("이슈 생성 실패:", err);
    });

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

  fetch(`/api/project-issues/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) })
    .then((res) => res.json())
    .then((res: { ok: boolean; projectIssue?: ProjectIssue; error?: string }) => {
      if (res.ok && res.projectIssue) {
        _state = { ..._state, projectIssues: _state.projectIssues.map((i) => (i.id === id ? res.projectIssue! : i)) };
        notify();
      } else if (!res.ok) console.error("이슈 수정 실패:", res.error);
    })
    .catch((err) => console.error("이슈 수정 실패:", err));
}

export function deleteProjectIssue(id: string): void {
  _state = { ..._state, projectIssues: _state.projectIssues.filter((i) => i.id !== id) };
  record("projectIssue", id, "이슈 삭제", "DELETE");
  notify();

  fetch(`/api/project-issues/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("이슈 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("이슈 삭제 실패(서버):", err));
}

// ============================================================
// NOTICES (공지사항)
// ============================================================

let _noticesHydrated = false;
function hydrateNotices(): void {
  if (_noticesHydrated || typeof window === "undefined") return;
  _noticesHydrated = true;
  const snapshotAtStart = _state.notices;
  fetch("/api/notices")
    .then((res) => res.json())
    .then((data: { ok: boolean; notices?: Notice[] }) => {
      if (data.ok && data.notices && _state.notices === snapshotAtStart) {
        _state = { ..._state, notices: data.notices };
        notify();
      }
    })
    .catch((err) => {
      console.error("공지사항 목록을 불러오지 못했습니다.", err);
      _noticesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateNotices();

export function addNotice(data: Omit<Notice, "id">): Notice {
  const tempId = genId("notice");
  const item: Notice = { ...data, id: tempId };
  _state = { ..._state, notices: [item, ..._state.notices] };
  record("notice", tempId, item.title, "CREATE");
  notify();

  fetch("/api/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; notice?: Notice; error?: string }) => {
      if (res.ok && res.notice) {
        _state = { ..._state, notices: _state.notices.map((n) => (n.id === tempId ? res.notice! : n)) };
      } else {
        _state = { ..._state, notices: _state.notices.filter((n) => n.id !== tempId) };
        console.error("공지사항 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, notices: _state.notices.filter((n) => n.id !== tempId) };
      notify();
      console.error("공지사항 생성 실패:", err);
    });

  return item;
}

export function deleteNotice(id: string): void {
  const item = _state.notices.find((n) => n.id === id);
  if (!item) return;
  _state = { ..._state, notices: _state.notices.filter((n) => n.id !== id) };
  record("notice", id, item.title, "DELETE");
  notify();

  fetch(`/api/notices/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("공지사항 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("공지사항 삭제 실패(서버):", err));
}

// ============================================================
// NOTIFICATION STATE (사용자별 알림 읽음/삭제 상태 — 감사로그 기록 안 함)
// ============================================================

function getNotifState(userId: string): { readIds: string[]; dismissedIds: string[] } {
  return _state.notificationState[userId] ?? { readIds: [], dismissedIds: [] };
}

// 로그인한 사용자당 한 번만 서버에서 읽음/삭제 상태를 불러온다 — 새로고침해도 유지되도록.
// (알림 목록 자체는 항상 원본 데이터에서 다시 계산되므로 여기선 이 두 배열만 있으면 된다.)
const _notifStateHydratedUserIds = new Set<string>();

export function hydrateNotificationState(userId: string): void {
  if (typeof window === "undefined" || _notifStateHydratedUserIds.has(userId)) return;
  _notifStateHydratedUserIds.add(userId);
  fetch("/api/notification-state")
    .then((res) => res.json())
    .then((data: { ok: boolean; readIds?: string[]; dismissedIds?: string[] }) => {
      if (data.ok) {
        _state = {
          ..._state,
          notificationState: { ..._state.notificationState, [userId]: { readIds: data.readIds ?? [], dismissedIds: data.dismissedIds ?? [] } },
        };
        notify();
      }
    })
    .catch((err) => {
      console.error("알림 상태를 불러오지 못했습니다.", err);
      _notifStateHydratedUserIds.delete(userId);
    });
}

function persistNotificationState(state: { readIds: string[]; dismissedIds: string[] }): void {
  fetch("/api/notification-state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).catch((err) => console.error("알림 상태를 저장하지 못했습니다.", err));
}

export function markNotificationRead(userId: string, id: string): void {
  const cur = getNotifState(userId);
  if (cur.readIds.includes(id)) return;
  const next = { ...cur, readIds: [...cur.readIds, id] };
  _state = { ..._state, notificationState: { ..._state.notificationState, [userId]: next } };
  notify();
  persistNotificationState(next);
}

export function markAllNotificationsRead(userId: string, ids: string[]): void {
  const cur = getNotifState(userId);
  const merged = Array.from(new Set([...cur.readIds, ...ids]));
  const next = { ...cur, readIds: merged };
  _state = { ..._state, notificationState: { ..._state.notificationState, [userId]: next } };
  notify();
  persistNotificationState(next);
}

export function dismissNotification(userId: string, id: string): void {
  const cur = getNotifState(userId);
  if (cur.dismissedIds.includes(id)) return;
  const next = { ...cur, dismissedIds: [...cur.dismissedIds, id] };
  _state = { ..._state, notificationState: { ..._state.notificationState, [userId]: next } };
  notify();
  persistNotificationState(next);
}

// ============================================================
// TAX INVOICES
// ============================================================

let _taxInvoicesHydrated = false;
function hydrateTaxInvoices(): void {
  if (_taxInvoicesHydrated || typeof window === "undefined") return;
  _taxInvoicesHydrated = true;
  const snapshotAtStart = _state.taxInvoices;
  fetch("/api/tax-invoices")
    .then((res) => res.json())
    .then((data: { ok: boolean; taxInvoices?: TaxInvoice[] }) => {
      if (data.ok && data.taxInvoices && _state.taxInvoices === snapshotAtStart) {
        _state = { ..._state, taxInvoices: data.taxInvoices };
        notify();
      }
    })
    .catch((err) => {
      console.error("세금계산서 목록을 불러오지 못했습니다.", err);
      _taxInvoicesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateTaxInvoices();

export function addTaxInvoice(data: Omit<TaxInvoice, "id">): TaxInvoice {
  const tempId = genId("ti");
  const item: TaxInvoice = { ...data, id: tempId };
  _state = { ..._state, taxInvoices: [..._state.taxInvoices, item] };
  record("taxInvoice", tempId, item.invoiceNumber, "CREATE");
  notify();

  fetch("/api/tax-invoices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; taxInvoice?: TaxInvoice; error?: string }) => {
      if (res.ok && res.taxInvoice) {
        _state = { ..._state, taxInvoices: _state.taxInvoices.map((t) => (t.id === tempId ? res.taxInvoice! : t)) };
      } else {
        _state = { ..._state, taxInvoices: _state.taxInvoices.filter((t) => t.id !== tempId) };
        console.error("세금계산서 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, taxInvoices: _state.taxInvoices.filter((t) => t.id !== tempId) };
      notify();
      console.error("세금계산서 생성 실패:", err);
    });

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

  fetch(`/api/tax-invoices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; taxInvoice?: TaxInvoice; error?: string }) => {
      if (res.ok && res.taxInvoice) {
        _state = { ..._state, taxInvoices: _state.taxInvoices.map((t) => (t.id === id ? res.taxInvoice! : t)) };
        notify();
      } else if (!res.ok) console.error("세금계산서 수정 실패:", res.error);
    })
    .catch((err) => console.error("세금계산서 수정 실패:", err));
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
// EMAIL DISPATCHES (공문 발송이력)
// ============================================================

// 예전엔 addEmailDispatch가 브라우저 메모리에만 쌓아서 새로고침하면 발송이력이 통째로 사라졌다
// (수정 10) — 게다가 noticeSeq 같은 문서번호 채번이 이 목록 길이를 세서 계산되는 곳도 있어,
// 세션이 끊길 때마다 과거 세션 발송분을 못 세게 되어 문서번호가 겹칠 수 있는 문제도 있었다.
let _emailDispatchesHydrated = false;
function hydrateEmailDispatches(): void {
  if (_emailDispatchesHydrated || typeof window === "undefined") return;
  _emailDispatchesHydrated = true;
  const snapshotAtStart = _state.emailDispatches;
  fetch("/api/email-dispatches")
    .then((res) => res.json())
    .then((data: { ok: boolean; emailDispatches?: EmailDispatch[] }) => {
      if (data.ok && data.emailDispatches && _state.emailDispatches === snapshotAtStart) {
        _state = { ..._state, emailDispatches: data.emailDispatches };
        notify();
      }
    })
    .catch((err) => {
      console.error("공문 발송이력을 불러오지 못했습니다.", err);
      _emailDispatchesHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateEmailDispatches();

export function addEmailDispatch(data: Omit<EmailDispatch, "id">): EmailDispatch {
  const tempId = genId("em");
  const item: EmailDispatch = { ...data, id: tempId };
  _state = { ..._state, emailDispatches: [..._state.emailDispatches, item] };
  record("emailDispatch", tempId, `${item.recipientInstitution} · ${item.subject}`, "CREATE");
  notify();

  fetch("/api/email-dispatches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; emailDispatch?: EmailDispatch; error?: string }) => {
      if (res.ok && res.emailDispatch) {
        _state = { ..._state, emailDispatches: _state.emailDispatches.map((e) => (e.id === tempId ? res.emailDispatch! : e)) };
        notify();
      } else if (!res.ok) {
        console.error("공문 발송이력 저장 실패:", res.error);
      }
    })
    .catch((err) => console.error("공문 발송이력 저장 실패:", err));

  return item;
}

// ============================================================
// STANDARD ATTACHMENTS (공문 표준 첨부서류 — 사업자등록증 등 일괄 관리)
// ============================================================

let _standardAttachmentsHydrated = false;
function hydrateStandardAttachments(): void {
  if (_standardAttachmentsHydrated || typeof window === "undefined") return;
  _standardAttachmentsHydrated = true;
  const snapshotAtStart = _state.standardAttachments;
  fetch("/api/standard-attachments")
    .then((res) => res.json())
    .then((data: { ok: boolean; attachments?: StandardAttachment[] }) => {
      if (data.ok && data.attachments && _state.standardAttachments === snapshotAtStart) {
        _state = { ..._state, standardAttachments: data.attachments };
        notify();
      }
    })
    .catch((err) => { console.error("표준 첨부서류를 불러오지 못했습니다.", err); _standardAttachmentsHydrated = false; });
}
if (typeof window !== "undefined") hydrateStandardAttachments();

export function updateStandardAttachment(id: string, data: Partial<Omit<StandardAttachment, "id">>): void {
  const before = _state.standardAttachments.find((a) => a.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, standardAttachments: _state.standardAttachments.map((a) => (a.id === id ? after : a)) };
  record("standardAttachment", id, after.name, "UPDATE");
  notify();

  fetch(`/api/standard-attachments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; attachment?: StandardAttachment; error?: string }) => {
      if (res.ok && res.attachment) {
        _state = { ..._state, standardAttachments: _state.standardAttachments.map((a) => (a.id === id ? res.attachment! : a)) };
        notify();
      } else if (!res.ok) console.error("표준 첨부서류 수정 실패:", res.error);
    })
    .catch((err) => console.error("표준 첨부서류 수정 실패:", err));
}

export function addStandardAttachment(name: string): StandardAttachment {
  const tempId = genId("sa");
  const item: StandardAttachment = { id: tempId, name, updatedAt: todayKST() };
  _state = { ..._state, standardAttachments: [..._state.standardAttachments, item] };
  record("standardAttachment", tempId, name, "CREATE");
  notify();

  fetch("/api/standard-attachments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
    .then((res) => res.json())
    .then((res: { ok: boolean; attachment?: StandardAttachment; error?: string }) => {
      if (res.ok && res.attachment) {
        // "파일 추가" 클릭 직후 곧바로 "파일 선택"까지 이어지면, 서버가 아직 이 임시 id를 모르는
        // 상태라 그 파일 저장(updateStandardAttachment) 요청이 404로 조용히 실패한다 — 그리고 여기서
        // 이 생성 응답(파일 없는 상태)으로 로컬 행을 통째로 덮어써버리면 방금 고른 파일이 통째로
        // 사라진다. id만 실제 DB id로 바꾸고 로컬에 이미 반영된 값(파일/이름 등)은 그대로 유지한 뒤,
        // 그 값을 실제 id로 다시 한번 저장 시도한다.
        const realId = res.attachment.id;
        const current = _state.standardAttachments.find((a) => a.id === tempId);
        _state = {
          ..._state,
          standardAttachments: _state.standardAttachments.map((a) =>
            a.id === tempId ? { ...res.attachment!, ...current, id: realId } : a
          ),
        };
        notify();
        if (current && (current.fileDataUrl || current.name !== name || current.enabledByCategory)) {
          updateStandardAttachment(realId, {
            name: current.name,
            fileDataUrl: current.fileDataUrl,
            enabledByCategory: current.enabledByCategory,
          });
        }
        return;
      } else {
        _state = { ..._state, standardAttachments: _state.standardAttachments.filter((a) => a.id !== tempId) };
        console.error("표준 첨부서류 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, standardAttachments: _state.standardAttachments.filter((a) => a.id !== tempId) };
      notify();
      console.error("표준 첨부서류 생성 실패:", err);
    });

  return item;
}

export function deleteStandardAttachment(id: string): void {
  const item = _state.standardAttachments.find((a) => a.id === id);
  if (!item) return;
  _state = { ..._state, standardAttachments: _state.standardAttachments.filter((a) => a.id !== id) };
  record("standardAttachment", id, `${item.name} 삭제`, "DELETE");
  notify();

  fetch(`/api/standard-attachments/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("표준 첨부서류 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("표준 첨부서류 삭제 실패(서버):", err));
}

// ============================================================
// COMPANY INFO (공문 발신 회사 정보 — 회사명·대표이사·직인 등 전담기관과 무관한 고정 레터헤드)
// ============================================================

let _companyInfoHydrated = false;
/** 앱이 브라우저에서 처음 로드될 때 한 번, 실제 DB의 회사 정보로 _state.companyInfo를 교체한다. */
function hydrateCompanyInfo(): void {
  if (_companyInfoHydrated || typeof window === "undefined") return;
  _companyInfoHydrated = true;
  const snapshotAtStart = _state.companyInfo;
  fetch("/api/company-info")
    .then((res) => res.json())
    .then((data: { ok: boolean; companyInfo?: CompanyInfo }) => {
      if (data.ok && data.companyInfo && _state.companyInfo === snapshotAtStart) {
        _state = { ..._state, companyInfo: data.companyInfo };
        notify();
      }
    })
    .catch((err) => { console.error("회사 정보를 불러오지 못했습니다.", err); _companyInfoHydrated = false; });
}
if (typeof window !== "undefined") hydrateCompanyInfo();

export function updateCompanyInfo(data: Partial<CompanyInfo>): void {
  const before = _state.companyInfo;
  const after = { ...before, ...data };
  _state = { ..._state, companyInfo: after };
  record("companyInfo", "company-info", after.name, "UPDATE", diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>));
  notify();

  fetch("/api/company-info", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; companyInfo?: CompanyInfo; error?: string }) => {
      if (res.ok && res.companyInfo) {
        _state = { ..._state, companyInfo: res.companyInfo };
        notify();
      } else if (!res.ok) {
        console.error("회사 정보 수정 실패:", res.error);
      }
    })
    .catch((err) => console.error("회사 정보 수정 실패:", err));
}

// ============================================================
// USERS
// ============================================================

/** 로그인/아이디·비밀번호 찾기 등 React 훅 바깥(lib/auth.ts)에서 현재 사용자 목록을
 *  동기적으로 읽기 위한 getter — useStore()는 훅이라 컴포넌트 바깥에서 쓸 수 없다.
 *  (Phase 2: 실제 값은 hydrateUsers()가 /api/users에서 받아와 채운다. 서버에서 처음
 *  렌더링되거나 아직 fetch가 끝나기 전에는 mock 시드 배열이 잠깐 보인다.) */
export function getUsers(): SystemUser[] {
  return _state.users;
}

/** addProject 직후 자동 생성되는 주관기관(LEAD) 참여기관 레코드를 훅 바깥에서 바로 찾아
 *  사업비를 채워 넣을 수 있도록 하는 동기 getter — ensureLeadMember가 addProject 내부에서
 *  이미 _state를 동기적으로 갱신해두므로, addProject가 반환하자마자 바로 조회할 수 있다. */
export function getProjectMembers(): ProjectMember[] {
  return _state.projectMembers;
}

let _usersHydrated = false;
/** 앱이 브라우저에서 처음 로드될 때 한 번, 실제 DB의 사용자 목록으로 _state.users를 교체한다. */
function hydrateUsers(): void {
  if (_usersHydrated || typeof window === "undefined") return;
  _usersHydrated = true;
  const snapshotAtStart = _state.users;
  fetch("/api/users")
    .then((res) => res.json())
    .then((data: { ok: boolean; users?: SystemUser[] }) => {
      if (data.ok && data.users && _state.users === snapshotAtStart) {
        _state = { ..._state, users: data.users };
        notify();
      }
    })
    .catch((err) => {
      console.error("사용자 목록을 불러오지 못했습니다.", err);
      _usersHydrated = false;
    });
}
if (typeof window !== "undefined") hydrateUsers();

export function addUser(data: Omit<SystemUser, "id">): SystemUser {
  const tempId = genId("u");
  const item: SystemUser = { ...data, id: tempId };
  _state = { ..._state, users: [..._state.users, item] };
  record("user", tempId, item.name, "CREATE");
  notify();

  fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; user?: SystemUser; error?: string }) => {
      if (res.ok && res.user) {
        _state = { ..._state, users: _state.users.map((u) => (u.id === tempId ? res.user! : u)) };
      } else {
        _state = { ..._state, users: _state.users.filter((u) => u.id !== tempId) };
        console.error("사용자 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, users: _state.users.filter((u) => u.id !== tempId) };
      notify();
      console.error("사용자 생성 실패:", err);
    });

  return item;
}

export function updateUser(id: string, data: Partial<SystemUser>): void {
  const before = _state.users.find((u) => u.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, users: _state.users.map((u) => (u.id === id ? after : u)) };

  // 비밀번호는 변경이력(감사로그)에 원문이 남지 않도록 마스킹한다 — 감사로그는 VIEWER 권한도
  // 조회 가능해 회원가입/비밀번호 재설정 시 그대로 diff()에 넘기면 평문이 노출된다
  // (하이웍스 메일 비밀번호를 마스킹하는 updateUserHiworksCredentials와 동일한 방침).
  const { password: beforePw, ...beforeRest } = before;
  const { password: afterPw, ...afterRest } = after;
  const changedFields = diff(beforeRest as unknown as Record<string, unknown>, afterRest as unknown as Record<string, unknown>) ?? {};
  if (afterPw !== beforePw) {
    changedFields.password = { before: beforePw ? "설정됨" : "미설정", after: "변경됨" };
  }
  record("user", id, after.name, "UPDATE", Object.keys(changedFields).length > 0 ? changedFields : undefined);
  notify();

  // app/find-password(로그인 전)에서 비밀번호만 재설정하는 경우, 서버에서 본인확인(이메일+이름)을
  // 다시 검증할 수 있도록 함께 보낸다 — 다른 필드 변경(로그인 상태)에는 영향 없다.
  const payload: Record<string, unknown> = { ...data };
  if (data.password) {
    payload.verifyEmail = before.email;
    payload.verifyName = before.name;
  }
  fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
    .then((res) => res.json())
    .then((res: { ok: boolean; user?: SystemUser; error?: string }) => {
      if (res.ok && res.user) {
        _state = { ..._state, users: _state.users.map((u) => (u.id === id ? res.user! : u)) };
        notify();
      } else if (!res.ok) {
        console.error("사용자 수정 실패:", res.error);
      }
    })
    .catch((err) => console.error("사용자 수정 실패:", err));
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

  fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; user?: SystemUser; error?: string }) => {
      if (res.ok && res.user) {
        _state = { ..._state, users: _state.users.map((u) => (u.id === id ? res.user! : u)) };
        notify();
      } else if (!res.ok) {
        console.error("하이웍스 계정 정보 저장 실패:", res.error);
      }
    })
    .catch((err) => console.error("하이웍스 계정 정보 저장 실패:", err));
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

  fetch(`/api/users/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("사용자 삭제 실패:", res.error);
    })
    .catch((err) => console.error("사용자 삭제 실패:", err));
}

// ============================================================
// PERMISSIONS (페이지 접근 / 기능별 쓰기 권한 — [권한 설정](/admin/permissions))
// ============================================================

/** 로그인/권한 체크 등 React 훅 바깥(lib/permissions.ts)에서 동기적으로 읽기 위한 getter. */
export function getPageAccess(): Record<string, Role[]> {
  return _state.pageAccess;
}

export function getWriteAccess(): Record<string, Role[]> {
  return _state.writeAccess;
}

// 시스템 관리자는 화면에서 권한을 얼마든지 바꿀 수 있어야 하지만, 실수로 ADMIN 스스로를
// 어떤 페이지·기능에서 빼버리면 그 즉시 [권한 설정] 화면 자체에 다시 접근할 방법이 없어진다.
// 그런 자기잠금을 원천 차단하기 위해 ADMIN은 항상 포함되도록 저장 시점에 강제한다.
function ensureAdminIncluded(roles: Role[]): Role[] {
  return roles.includes("ADMIN") ? roles : ["ADMIN", ...roles];
}

export { ADMIN_ONLY_LOCKED_PAGES };

// [권한 설정] 화면에서 바꾼 값은 DB(role_permissions)에도 반영해야 다른 사용자·다음 접속에도
// 유지된다 — 이전엔 이 저장 호출이 아예 없어서 화면에서 바꾼 즉시는 반영된 것처럼 보이지만
// 새로고침하거나 다른 사람이 접속하면 lib/mock.ts의 초기값으로 되돌아가 있었다.
let _permissionsHydrated = false;
function hydratePermissions(): void {
  if (_permissionsHydrated || typeof window === "undefined") return;
  _permissionsHydrated = true;
  const pageAccessSnapshotAtStart = _state.pageAccess;
  const writeAccessSnapshotAtStart = _state.writeAccess;
  fetch("/api/role-permissions")
    .then((res) => res.json())
    .then((data: { ok: boolean; pageAccess?: Record<string, Role[]>; writeAccess?: Record<string, Role[]> }) => {
      // 이 요청이 떠 있는 동안 [권한 설정] 화면에서 이미 뭔가 바꿨으면 그 전 시점의 이 응답으로
      // 덮어쓰지 않는다(수정 8) — 안 그러면 방금 바꾼 권한이 몇 초 뒤 조용히 원래대로 돌아간다.
      if (
        data.ok && data.pageAccess && data.writeAccess &&
        _state.pageAccess === pageAccessSnapshotAtStart && _state.writeAccess === writeAccessSnapshotAtStart
      ) {
        // DB(role_permission)에 아예 행이 없는 도메인은 서버 응답에서 키 자체가 빠진다 — 코드에
        // 새 권한 도메인이 추가됐는데 DB 시드/백필이 안 된 경우가 그렇다. 그런 도메인까지 서버
        // 응답으로 통째로 교체해버리면 그 기능은 관리자를 포함해 아무도 못 쓰게 조용히 막혀버리므로
        // (예: fees-sales가 DB에 없어 매출발행 버튼이 전 사용자에게 사라졌던 사고), 서버가 실제로
        // 값을 준 도메인만 덮어쓰고 나머지는 코드 기본값을 그대로 둔다.
        _state = {
          ..._state,
          pageAccess: { ...initialPageAccess, ...data.pageAccess },
          writeAccess: { ...initialWriteAccess, ...data.writeAccess },
        };
        notify();
      }
    })
    .catch((err) => { console.error("권한 설정을 불러오지 못했습니다.", err); _permissionsHydrated = false; });
}
if (typeof window !== "undefined") hydratePermissions();

export function updatePageAccess(path: string, roles: Role[]): void {
  const safeRoles = ADMIN_ONLY_LOCKED_PAGES.includes(path) ? ["ADMIN"] as Role[] : ensureAdminIncluded(roles);
  const before = _state.pageAccess[path] ?? [];
  _state = { ..._state, pageAccess: { ..._state.pageAccess, [path]: safeRoles } };
  record("permission", `page:${path}`, path, "UPDATE", { roles: { before, after: safeRoles } });
  notify();

  // 저장이 실패하면 화면 체크박스는 이미 바뀐 채로 남아 관리자가 실제로 적용됐다고 착각하기 쉽다 —
  // 다른 권한 변경 없이 저장(safeRoles)이 조용히 실패했을 때만 되돌린다(reference 비교로, 그 사이
  // 다른 변경이 또 들어왔으면 그 최신 값을 덮어쓰지 않는다).
  function rollback() {
    if (_state.pageAccess[path] === safeRoles) {
      _state = { ..._state, pageAccess: { ..._state.pageAccess, [path]: before } };
      notify();
    }
  }

  fetch("/api/role-permissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType: "MENU", resourceKey: path, roles: safeRoles }),
  })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) { console.error("페이지 접근 권한 저장 실패:", res.error); rollback(); }
    })
    .catch((err) => { console.error("페이지 접근 권한 저장 실패:", err); rollback(); });
}

export function updateWriteAccess(domain: string, roles: Role[]): void {
  const safeRoles = ensureAdminIncluded(roles);
  const before = _state.writeAccess[domain] ?? [];
  _state = { ..._state, writeAccess: { ..._state.writeAccess, [domain]: safeRoles } };
  record("permission", `write:${domain}`, domain, "UPDATE", { roles: { before, after: safeRoles } });
  notify();

  // 위 updatePageAccess와 동일한 이유 — 저장 실패를 콘솔에만 남기고 화면은 그대로 두면, 매출발행
  // 등 기능 권한을 바꿨다고 착각한 채 다음 새로고침에서야(혹은 이번처럼 DB에 아예 안 남아) 원래대로
  // 돌아가 있는 걸 알게 된다. reference 비교로 그 사이 다른 변경이 없을 때만 되돌린다.
  function rollback() {
    if (_state.writeAccess[domain] === safeRoles) {
      _state = { ..._state, writeAccess: { ..._state.writeAccess, [domain]: before } };
      notify();
    }
  }

  fetch("/api/role-permissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType: "FEATURE", resourceKey: domain, roles: safeRoles }),
  })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) { console.error("기능 쓰기 권한 저장 실패:", res.error); rollback(); }
    })
    .catch((err) => { console.error("기능 쓰기 권한 저장 실패:", err); rollback(); });
}

// ============================================================
// FEES FILTERS (수수료청구관리 검색 필터 — 서버 저장 없이 세션 동안만 유지)
// ============================================================

export function updateFeesFilters(patch: Partial<FeesFilters>): void {
  _state = { ..._state, feesFilters: { ..._state.feesFilters, ...patch } };
  notify();
}

export function resetFeesFilters(): void {
  _state = { ..._state, feesFilters: { ...DEFAULT_FEES_FILTERS } };
  notify();
}

// ============================================================
// AGENCY GUIDES (전담기관 운용 안내)
// ============================================================

export function updateAgencyGuide(shortName: string, tabs: AgencyGuideTab[]): void {
  _state = { ..._state, agencyGuides: { ..._state.agencyGuides, [shortName]: tabs } };
  record("fundingAgency", shortName, `${shortName} 운용 안내`, "UPDATE");
  notify();

  fetch(`/api/funding-agencies/by-short-name/${encodeURIComponent(shortName)}/guide`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tabs),
  })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => {
      if (!res.ok) console.error("운용 안내 저장 실패:", res.error);
    })
    .catch((err) => console.error("운용 안내 저장 실패:", err));
}

// ============================================================
// AGENCY NOTICE TEMPLATES (전담기관 공문 템플릿)
// ============================================================

let _agencyNoticeTemplatesHydrated = false;
function hydrateAgencyNoticeTemplates(): void {
  if (_agencyNoticeTemplatesHydrated || typeof window === "undefined") return;
  _agencyNoticeTemplatesHydrated = true;
  const snapshotAtStart = _state.agencyNoticeTemplates;
  fetch("/api/agency-notice-templates")
    .then((res) => res.json())
    .then((data: { ok: boolean; templates?: AgencyNoticeTemplateEntry[] }) => {
      if (data.ok && data.templates && _state.agencyNoticeTemplates === snapshotAtStart) {
        _state = { ..._state, agencyNoticeTemplates: data.templates };
        notify();
      }
    })
    .catch((err) => { console.error("전담기관 공문 템플릿을 불러오지 못했습니다.", err); _agencyNoticeTemplatesHydrated = false; });
}
if (typeof window !== "undefined") hydrateAgencyNoticeTemplates();

export function addAgencyNoticeTemplate(
  agencyShortName: string,
  name: string,
  content: AgencyNoticeTemplate
): AgencyNoticeTemplateEntry {
  const tempId = genId("ant");
  const item: AgencyNoticeTemplateEntry = { id: tempId, agencyShortName, name, content };
  _state = { ..._state, agencyNoticeTemplates: [..._state.agencyNoticeTemplates, item] };
  record("fundingAgency", agencyShortName, `${agencyShortName} 공문 템플릿 등록 (${name})`, "CREATE");
  notify();

  fetch("/api/agency-notice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agencyShortName, name, content }) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: AgencyNoticeTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.map((t) => (t.id === tempId ? res.template! : t)) };
      } else {
        _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.filter((t) => t.id !== tempId) };
        console.error("공문 템플릿 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.filter((t) => t.id !== tempId) };
      notify();
      console.error("공문 템플릿 생성 실패:", err);
    });

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

  fetch(`/api/agency-notice-templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: AgencyNoticeTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.map((t) => (t.id === id ? res.template! : t)) };
        notify();
      } else if (!res.ok) console.error("공문 템플릿 수정 실패:", res.error);
    })
    .catch((err) => console.error("공문 템플릿 수정 실패:", err));
}

export function deleteAgencyNoticeTemplate(id: string): void {
  const item = _state.agencyNoticeTemplates.find((t) => t.id === id);
  if (!item) return;
  _state = { ..._state, agencyNoticeTemplates: _state.agencyNoticeTemplates.filter((t) => t.id !== id) };
  record("fundingAgency", item.agencyShortName, `${item.agencyShortName} 공문 템플릿 삭제 (${item.name})`, "DELETE");
  notify();

  fetch(`/api/agency-notice-templates/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("공문 템플릿 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("공문 템플릿 삭제 실패(서버):", err));
}

// ============================================================
// FEE INVOICE TEMPLATES (수수료 청구서 양식)
// ============================================================

let _feeInvoiceTemplatesHydrated = false;
function hydrateFeeInvoiceTemplates(): void {
  if (_feeInvoiceTemplatesHydrated || typeof window === "undefined") return;
  _feeInvoiceTemplatesHydrated = true;
  const snapshotAtStart = _state.feeInvoiceTemplates;
  fetch("/api/fee-invoice-templates")
    .then((res) => res.json())
    .then((data: { ok: boolean; templates?: FeeInvoiceTemplateEntry[] }) => {
      if (data.ok && data.templates && _state.feeInvoiceTemplates === snapshotAtStart) { _state = { ..._state, feeInvoiceTemplates: data.templates }; notify(); }
    })
    .catch((err) => { console.error("수수료 청구서 템플릿을 불러오지 못했습니다.", err); _feeInvoiceTemplatesHydrated = false; });
}
if (typeof window !== "undefined") hydrateFeeInvoiceTemplates();

export function addFeeInvoiceTemplate(
  category: FeeInvoiceTemplateEntry["category"],
  name: string,
  content: FeeInvoiceTemplate
): FeeInvoiceTemplateEntry {
  const tempId = genId("fit");
  const item: FeeInvoiceTemplateEntry = { id: tempId, category, name, isDefault: false, content };
  _state = { ..._state, feeInvoiceTemplates: [..._state.feeInvoiceTemplates, item] };
  record("feeInvoiceTemplate", tempId, name, "CREATE");
  notify();

  fetch("/api/fee-invoice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, name, content }) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: FeeInvoiceTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.map((t) => (t.id === tempId ? res.template! : t)) };
      } else {
        _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.filter((t) => t.id !== tempId) };
        console.error("수수료 청구서 템플릿 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.filter((t) => t.id !== tempId) };
      notify();
      console.error("수수료 청구서 템플릿 생성 실패:", err);
    });

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

  fetch(`/api/fee-invoice-templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: FeeInvoiceTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.map((t) => (t.id === id ? res.template! : t)) };
        notify();
      } else if (!res.ok) console.error("수수료 청구서 템플릿 수정 실패:", res.error);
    })
    .catch((err) => console.error("수수료 청구서 템플릿 수정 실패:", err));
}

// 대표양식(isDefault)은 카테고리마다 항상 최소 1개 있어야 발송(DispatchModal) 흐름이 깨지지 않으므로
// 삭제를 거부한다 — 다른 템플릿을 먼저 대표로 지정한 뒤에만 지울 수 있다.
export function deleteFeeInvoiceTemplate(id: string): void {
  const item = _state.feeInvoiceTemplates.find((t) => t.id === id);
  if (!item || item.isDefault) return;
  _state = { ..._state, feeInvoiceTemplates: _state.feeInvoiceTemplates.filter((t) => t.id !== id) };
  record("feeInvoiceTemplate", id, `${item.name} 삭제`, "DELETE");
  notify();

  fetch(`/api/fee-invoice-templates/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("수수료 청구서 템플릿 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("수수료 청구서 템플릿 삭제 실패(서버):", err));
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

  fetch(`/api/fee-invoice-templates/${id}/set-default`, { method: "POST" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("대표양식 지정 실패(서버):", res.error); })
    .catch((err) => console.error("대표양식 지정 실패(서버):", err));
}

// ============================================================
// SIMPLE NOTICE TEMPLATES (계산서발행 서류 요청 / 입금 확인 요청 — 첨부 없이 본문 하나만 보내는 안내 메일)
// ============================================================

let _simpleNoticeTemplatesHydrated = false;
function hydrateSimpleNoticeTemplates(): void {
  if (_simpleNoticeTemplatesHydrated || typeof window === "undefined") return;
  _simpleNoticeTemplatesHydrated = true;
  const snapshotAtStart = _state.simpleNoticeTemplates;
  fetch("/api/simple-notice-templates")
    .then((res) => res.json())
    .then((data: { ok: boolean; templates?: SimpleNoticeTemplateEntry[] }) => {
      if (data.ok && data.templates && _state.simpleNoticeTemplates === snapshotAtStart) { _state = { ..._state, simpleNoticeTemplates: data.templates }; notify(); }
    })
    .catch((err) => { console.error("간단 안내메일 템플릿을 불러오지 못했습니다.", err); _simpleNoticeTemplatesHydrated = false; });
}
if (typeof window !== "undefined") hydrateSimpleNoticeTemplates();

export function addSimpleNoticeTemplate(
  category: SimpleNoticeTemplateEntry["category"],
  name: string,
  content: SimpleNoticeTemplate
): SimpleNoticeTemplateEntry {
  const tempId = genId("snt");
  const item: SimpleNoticeTemplateEntry = { id: tempId, category, name, isDefault: false, content };
  _state = { ..._state, simpleNoticeTemplates: [..._state.simpleNoticeTemplates, item] };
  record("simpleNoticeTemplate", tempId, name, "CREATE");
  notify();

  fetch("/api/simple-notice-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category, name, content }) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: SimpleNoticeTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.map((t) => (t.id === tempId ? res.template! : t)) };
      } else {
        _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.filter((t) => t.id !== tempId) };
        console.error("간단 안내메일 템플릿 생성 실패:", res.error);
      }
      notify();
    })
    .catch((err) => {
      _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.filter((t) => t.id !== tempId) };
      notify();
      console.error("간단 안내메일 템플릿 생성 실패:", err);
    });

  return item;
}

export function updateSimpleNoticeTemplate(id: string, data: Partial<Pick<SimpleNoticeTemplateEntry, "name" | "content">>): void {
  const before = _state.simpleNoticeTemplates.find((t) => t.id === id);
  if (!before) return;
  const after = { ...before, ...data };
  _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.map((t) => (t.id === id ? after : t)) };
  record("simpleNoticeTemplate", id, `${after.name} 수정`, "UPDATE");
  notify();

  fetch(`/api/simple-notice-templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((res) => res.json())
    .then((res: { ok: boolean; template?: SimpleNoticeTemplateEntry; error?: string }) => {
      if (res.ok && res.template) {
        _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.map((t) => (t.id === id ? res.template! : t)) };
        notify();
      } else if (!res.ok) console.error("간단 안내메일 템플릿 수정 실패:", res.error);
    })
    .catch((err) => console.error("간단 안내메일 템플릿 수정 실패:", err));
}

// 대표양식(isDefault)은 카테고리마다 항상 최소 1개 있어야 발송(SimpleNoticeModal) 흐름이 깨지지 않으므로
// 삭제를 거부한다 — 다른 템플릿을 먼저 대표로 지정한 뒤에만 지울 수 있다.
export function deleteSimpleNoticeTemplate(id: string): void {
  const item = _state.simpleNoticeTemplates.find((t) => t.id === id);
  if (!item || item.isDefault) return;
  _state = { ..._state, simpleNoticeTemplates: _state.simpleNoticeTemplates.filter((t) => t.id !== id) };
  record("simpleNoticeTemplate", id, `${item.name} 삭제`, "DELETE");
  notify();

  fetch(`/api/simple-notice-templates/${id}`, { method: "DELETE" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("간단 안내메일 템플릿 삭제 실패(서버):", res.error); })
    .catch((err) => console.error("간단 안내메일 템플릿 삭제 실패(서버):", err));
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

  fetch(`/api/simple-notice-templates/${id}/set-default`, { method: "POST" })
    .then((res) => res.json())
    .then((res: { ok: boolean; error?: string }) => { if (!res.ok) console.error("대표양식 지정 실패(서버):", res.error); })
    .catch((err) => console.error("대표양식 지정 실패(서버):", err));
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

  const today = todayKST();
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
  // 실제로 사업비가 입력되어(=참여기관이 있어) 이번에 산정 대상이 된 연차들 — 아래에서 이 연차들에
  // 아직 과제코드가 없으면 새로 발급한다(연차마다 코드가 달라야 하므로).
  const activeTermNumbers = new Set<number>();

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
      if (!ab) continue;
      // RDA2처럼 주관기관을 산정기준액에서 항상 완전제외(excludeLeadFromCalc)하는 정책은 실제로
      // 주관기관 사업비를 0원으로 등록해두는 경우가 많다 — cashBudget<=0이라고 여기서 걸러버리면
      // calcTermFee에 주관기관이 아예 안 들어가 excludeLeadFromCalc의 공동기관수 -1 보정이 빠지고,
      // 그 보정이 없는 RDA1과 같은 값으로 계산돼버린다.
      const isExcludedLead = policy.excludeLeadFromCalc === true && m.role === "LEAD";
      if (!isExcludedLead && getMemberAmount(ab, feeBasis) <= 0) continue;
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
    activeTermNumbers.add(termNumber);

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
        // 이미 CONFIRMED/BILLED/manualOverride로 보호된 연차는 담당자가 직접 수정했을 수 있는
        // 실제 저장값(prevFee.unclaimedFee)을 그대로 이월 합산에 써야 한다 — 안 그러면 화면엔
        // 수정된 값이 보여도 다음 연차 누적 계산엔 재계산 엔진의 값이 조용히 쓰이는 불일치가 생긴다.
        if (workType === "ANNUAL") {
          instAnnualExemptUnclaimed[cm.institutionId] =
            isLocked && prevFee ? (prevFee.unclaimedFee ?? 0) : (ed?.unclaimedFee ?? 0);
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
          // 위 면제기관 분기와 동일하게, 보호된(CONFIRMED/BILLED/manualOverride) 연차는 담당자가
          // 직접 수정했을 수 있는 실제 저장값을 이월 합산에 그대로 반영한다.
          instAnnualUnclaimed[cm.institutionId] =
            isLocked && prevFee ? (prevFee.unclaimedFee ?? 0) : instUnclaimedFee;
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
      createdAt: todayKST(),
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

  // 이번에 산정 대상이 된 연차 중 아직 과제코드가 없는 연차 — 새 SH 코드를 발급해준다. 한 번에
  // 여러 연차가 처음 채워져도(예: 엑셀로 3개 연차를 한꺼번에 등록) 연차마다 서로 다른 번호를 받는다.
  // nextTermCode()는 _state를 훑어 다음 번호를 정하는데, 이 블록에서 여러 번 부르면 아직 _state가
  // 갱신 전이라 매번 같은 번호를 돌려주므로, 첫 번호만 받아오고 이후는 로컬에서 순번을 이어간다.
  const missingCodeTerms = [...activeTermNumbers]
    .filter((t) => !resolveProjectCodeForTerm(project, t))
    .sort((a, b) => a - b);
  const newTermCodes: { termNumber: number; code: string }[] = [];
  if (missingCodeTerms.length > 0) {
    let nextNum = parseInt(nextTermCode().slice(2), 10);
    for (const termNumber of missingCodeTerms) {
      newTermCodes.push({ termNumber, code: `SH${String(nextNum).padStart(6, "0")}` });
      nextNum++;
    }
  }
  const updatedProjects = newTermCodes.length === 0
    ? _state.projects
    : _state.projects.map((p) =>
        p.id === project.id
          ? { ...p, termCodes: [...(p.termCodes ?? []), ...newTermCodes].sort((a, b) => a.termNumber - b.termNumber) }
          : p
      );

  _state = {
    ..._state,
    projects: updatedProjects,
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
      createdAt: nowKST(),
      priority: "HIGH",
      status: "OPEN",
      recipientGroups: ["MANAGER", "MANAGER_DEPUTY", "ACCOUNTANT"],
    });
  }

  notify();

  // 계산 자체는 위에서 전부 로컬로 끝났다 — 그 결과(이 과제분 termFees/termFeeCalcs 전체)를
  // 통째로 서버에 반영만 한다(계산 로직을 서버로 옮기지 않는다). project.id가 아직 addProject의
  // POST가 끝나기 전 임시 id일 수도 있는데, 그 경우 서버가 과제를 못 찾아 이 호출은 조용히 실패하고
  // addProject 쪽에서 실제 id로 다시 이 함수를 호출해 정상 동기화된다.
  const projectTermFees = _state.termFees.filter((f) => f.projectNumber === project.projectNumber);
  const projectTermFeeCalcs = _state.termFeeCalcs.filter((c) => c.projectId === project.id);
  fetch(`/api/projects/${project.id}/sync-fees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ termFees: projectTermFees, termFeeCalcs: projectTermFeeCalcs }),
  })
    .then((res) => res.json())
    .then((res: { ok: boolean; termFees?: TermFee[]; error?: string }) => {
      if (!res.ok) { console.error("연차수수료 동기화 실패(서버):", res.error); return; }
      if (!res.termFees) return;
      // 여기서 만든 termFees는 매번 새 임시 id(genId("tf"))를 달고 있어, 서버가 upsert한 실제 DB id와
      // 다르다 — sync-fees는 id가 아니라 (기관×연차) 기준으로 upsert하기 때문에 서버는 정상 저장되지만,
      // 로컬 상태는 계속 이 임시 id를 들고 있게 된다. 그 상태로 이 행에 개별 PATCH를 보내는 다른 동작
      // (updateTermFee, setTermOtherFirmHandled 등)을 하면 서버가 그 임시 id를 실제 DB에서 못 찾아
      // 조용히 실패한다(타회계법인 진행 체크가 저장은 되는 것처럼 보이다 사라지던 버그의 원인). 서버가
      // 돌려준 실제 id로 즉시 교체해 이 문제를 없앤다.
      const realByKey = new Map(res.termFees.map((f) => [`${f.termYear}|${f.termNumber}|${f.institutionId}`, f]));
      _state = {
        ..._state,
        termFees: _state.termFees.map((f) => {
          if (f.projectNumber !== project.projectNumber) return f;
          return realByKey.get(`${f.termYear}|${f.termNumber}|${f.institutionId}`) ?? f;
        }),
      };
      notify();
    })
    .catch((err) => console.error("연차수수료 동기화 실패(서버):", err));
}

// ============================================================
// React Hook
// ============================================================

export function useStore(): StoreState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
