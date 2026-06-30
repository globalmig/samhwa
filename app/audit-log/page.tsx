"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronUp, FiExternalLink } from "react-icons/fi";
import { useStore, AuditEntry, ENTITY_NAMES } from "@/lib/store";
import StatusBadge from "@/components/common/StatusBadge";

const ACTION_MAP: Record<AuditEntry["action"], { label: string; color: "blue" | "amber" | "red" }> = {
  CREATE: { label: "생성", color: "blue" },
  UPDATE: { label: "수정", color: "amber" },
  DELETE: { label: "삭제", color: "red" },
};

const FIELD_LABELS: Record<string, string> = {
  status:              "상태",
  priority:            "우선순위",
  content:             "내용",
  projectName:         "과제명",
  leadInstitutionId:   "주관기관 ID",
  leadInstitutionName: "주관기관명",
  agencyId:            "전담기관 ID",
  agency:              "전담기관명",
  startDate:           "시작일",
  endDate:             "종료일",
  totalTerms:          "총연차",
  currentTerm:         "현재연차",
  govGrant:            "정부출연금",
  privateCash:         "민간현금",
  privateInKind:       "민간현물",
  totalBudget:         "총사업비",
  feeRate:             "수수료율",
  calculatedFee:       "산정수수료",
  appliedFee:          "적용수수료",
  paidAmount:          "납부금액",
  receivableAmount:    "미수금",
  carriedOver:         "이월처리",
  institutionGrade:    "기관등급",
  budget:              "배정예산",
  name:                "이름",
  role:                "역할",
  dueDate:             "납기일",
  issuedAt:            "발행일",
  supplyAmount:        "공급가액",
  taxAmount:           "부가세",
  totalAmount:         "합계금액",
  projectCategory:     "과제구분",
  usageReportDeadline: "사용실적제출기한",
  internalAssignedAt:  "내부배정일",
  agencyAssignedAt:    "전담기관배정일",
};

const VALUE_LABELS: Record<string, string> = {
  OPEN:        "미처리",
  IN_PROGRESS: "진행중",
  RESOLVED:    "완료",
  HIGH:        "높음",
  MEDIUM:      "보통",
  LOW:         "낮음",
  ACTIVE:      "진행중",
  COMPLETED:   "완료",
  SUSPENDED:   "중단",
  DRAFT:       "초안",
  CONFIRMED:   "확정",
  BILLED:      "청구완료",
  PAID:        "완납",
  PARTIAL:     "일부납부",
  OVERDUE:     "미수",
  PENDING:     "미납/대기",
  CARRIED_OVER:"이월됨",
  ISSUED:      "발행",
  MODIFIED:    "수정발행",
  CANCELED:    "취소",
  LEAD:        "주관",
  PARTICIPANT: "참여",
  true:        "예",
  false:       "아니오",
  "A~C":       "우수(A~C)",
  S:           "최우수(S)",
  일반:        "일반",
};

function fmtValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "-";
  const str = String(raw);
  if (VALUE_LABELS[str]) return VALUE_LABELS[str];
  if (typeof raw === "number") return raw.toLocaleString("ko-KR") + (raw > 9999 ? "원" : "");
  return str;
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function getEntityUrl(
  entityType: string,
  entityId: string,
  store: ReturnType<typeof useStore>
): string | null {
  switch (entityType) {
    case "project":
      return `/projects/${entityId}`;
    case "institution":
      return `/institutions/${entityId}`;
    case "projectIssue":
      return `/issues`;
    case "fundingAgency":
      return `/funding-agencies`;
    case "user":
      return `/admin/users`;
    case "feePolicy":
      return `/company-class`;
    case "projectMember": {
      const m = store.projectMembers.find((x) => x.id === entityId);
      return m ? `/projects/${m.projectId}` : null;
    }
    case "termFee": {
      const f = store.termFees.find((x) => x.id === entityId);
      if (!f) return null;
      const p = store.projects.find((x) => x.projectNumber === f.projectNumber);
      return p ? `/projects/${p.id}` : null;
    }
    case "taxInvoice": {
      const inv = store.taxInvoices.find((x) => x.id === entityId || x.invoiceNumber === entityId);
      if (!inv) return null;
      const p = store.projects.find((x) => x.projectNumber === inv.projectNumber);
      return p ? `/projects/${p.id}` : null;
    }
    case "receivable": {
      const rv = store.receivables.find((x) => x.id === entityId);
      if (!rv) return null;
      const p = store.projects.find((x) => x.projectNumber === rv.projectNumber);
      return p ? `/projects/${p.id}` : null;
    }
    case "unclaimed": {
      const uc = store.unclaimedFees.find((x) => x.id === entityId);
      if (!uc) return null;
      const p = store.projects.find((x) => x.projectNumber === uc.projectNumber);
      return p ? `/projects/${p.id}` : null;
    }
    case "settlement": {
      const s = store.settlements.find((x) => x.id === entityId);
      if (!s) return null;
      const p = store.projects.find((x) => x.projectNumber === s.projectNumber);
      return p ? `/projects/${p.id}` : null;
    }
    default:
      return null;
  }
}

function changeSummary(changedFields: AuditEntry["changedFields"]): string {
  if (!changedFields) return "";
  const keys = Object.keys(changedFields);
  if (keys.length === 0) return "";
  return keys.map(fieldLabel).join(", ") + " 변경";
}

export default function AuditLogPage() {
  const store = useStore();
  const { auditLog } = store;
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      auditLog.filter((e) => {
        if (entityFilter !== "ALL" && e.entityType !== entityFilter) return false;
        if (actionFilter !== "ALL" && e.action !== actionFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          return (
            e.entityLabel.toLowerCase().includes(q) ||
            (ENTITY_NAMES[e.entityType] ?? "").includes(q) ||
            e.performedBy.toLowerCase().includes(q)
          );
        }
        return true;
      }),
    [auditLog, entityFilter, actionFilter, search]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">변경이력 · 전체 {auditLog.length}건</p>
        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-medium">실시간 기록</span>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 이력", value: `${auditLog.length}건`, color: "text-slate-800" },
          { label: "생성", value: `${auditLog.filter((e) => e.action === "CREATE").length}건`, color: "text-blue-600" },
          { label: "수정", value: `${auditLog.filter((e) => e.action === "UPDATE").length}건`, color: "text-amber-600" },
          { label: "삭제", value: `${auditLog.filter((e) => e.action === "DELETE").length}건`, color: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">필터</span>
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="ALL">전체 유형</option>
          {Object.entries(ENTITY_NAMES).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          <option value="ALL">전체 액션</option>
          <option value="CREATE">생성</option>
          <option value="UPDATE">수정</option>
          <option value="DELETE">삭제</option>
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="대상명 / 수행자 검색…"
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-48"
        />
        <span className="ml-auto text-xs text-slate-400">{filtered.length}건 · 최신순</span>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <p className="text-sm text-slate-500 font-medium">변경 이력이 없습니다</p>
          <p className="text-xs text-slate-400 mt-1">데이터를 추가·수정·삭제하면 여기에 기록됩니다</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-40">일시</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-24">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-28">액션</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">대상 / 변경내용</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-20">수행자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-16">상세</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => {
                const hasDetail = entry.changedFields && Object.keys(entry.changedFields).length > 0;
                const summary = changeSummary(entry.changedFields);
                const isExpanded = expanded === entry.id;
                const navUrl = getEntityUrl(entry.entityType, entry.entityId, store);

                return (
                  <React.Fragment key={entry.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
                        {entry.performedAt}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                        {ENTITY_NAMES[entry.entityType] ?? entry.entityType}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge label={ACTION_MAP[entry.action].label} color={ACTION_MAP[entry.action].color} />
                      </td>
                      <td className="px-4 py-3">
                        {navUrl ? (
                          <Link
                            href={navUrl}
                            className="inline-flex items-center gap-1.5 group"
                          >
                            <span className="font-medium text-blue-600 group-hover:underline text-sm">
                              {entry.entityLabel}
                            </span>
                            <FiExternalLink size={11} className="text-blue-400 shrink-0" />
                          </Link>
                        ) : (
                          <p className="font-medium text-slate-800 text-sm">{entry.entityLabel}</p>
                        )}
                        {summary && (
                          <p className="text-xs text-slate-400 mt-0.5">{summary}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">{entry.performedBy}</td>
                      <td className="px-4 py-3 text-center">
                        {hasDetail ? (
                          <button
                            onClick={() => setExpanded(isExpanded ? null : entry.id)}
                            className="flex items-center gap-1 mx-auto text-xs text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && entry.changedFields && (
                      <tr className="bg-blue-50/40 border-b border-slate-100">
                        <td colSpan={6} className="px-6 py-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">변경 상세</p>
                          <div className="space-y-2">
                            {Object.entries(entry.changedFields).map(([field, change]) => {
                              const before = fmtValue(change.before);
                              const after = fmtValue(change.after);
                              return (
                                <div key={field} className="flex items-center gap-3 text-xs">
                                  <span className="text-slate-500 font-medium w-32 shrink-0">
                                    {fieldLabel(field)}
                                  </span>
                                  <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded line-through">{before}</span>
                                  <span className="text-slate-400">→</span>
                                  <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{after}</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
            {filtered.length}건 표시 (전체 {auditLog.length}건)
          </div>
        </div>
      )}
    </div>
  );
}
