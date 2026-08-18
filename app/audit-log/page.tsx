"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronUp, FiExternalLink } from "react-icons/fi";
import { useStore, AuditEntry, ENTITY_NAMES } from "@/lib/store";
import type { Project } from "@/lib/mock";
import { fmtValue, fieldLabel, describeOverrideChange } from "@/lib/audit-log-format";
import StatusBadge from "@/components/common/StatusBadge";

const ACTION_MAP: Record<AuditEntry["action"], { label: string; color: "blue" | "amber" | "red" }> = {
  CREATE: { label: "생성", color: "blue" },
  UPDATE: { label: "수정", color: "amber" },
  DELETE: { label: "삭제", color: "red" },
};

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

// 감사 이력 항목이 어느 과제와 관련됐는지 역추적 — 전담기관 약칭/과제번호/주관기관/연구책임자 표시·필터에 사용
function getRelatedProject(
  entry: AuditEntry,
  store: ReturnType<typeof useStore>
): Project | undefined {
  const byNumber = (num?: string) =>
    num ? store.projects.find((p) => p.projectNumber === num) : undefined;

  switch (entry.entityType) {
    case "project":
      return store.projects.find((p) => p.id === entry.entityId);
    case "projectMember": {
      const m = store.projectMembers.find((x) => x.id === entry.entityId);
      return m ? store.projects.find((p) => p.id === m.projectId) : undefined;
    }
    case "termFee":
      return byNumber(store.termFees.find((x) => x.id === entry.entityId)?.projectNumber);
    case "termFeeCalc":
      return byNumber(store.termFeeCalcs.find((x) => x.id === entry.entityId)?.projectNumber);
    case "taxInvoice":
      return byNumber(
        store.taxInvoices.find((x) => x.id === entry.entityId || x.invoiceNumber === entry.entityId)?.projectNumber
      );
    case "receivable":
      return byNumber(store.receivables.find((x) => x.id === entry.entityId)?.projectNumber);
    case "unclaimed":
      return byNumber(store.unclaimedFees.find((x) => x.id === entry.entityId)?.projectNumber);
    case "settlement":
      return byNumber(store.settlements.find((x) => x.id === entry.entityId)?.projectNumber);
    case "projectIssue":
      return byNumber(store.projectIssues.find((x) => x.id === entry.entityId)?.projectNumber);
    default:
      return undefined;
  }
}

function changeSummary(changedFields: AuditEntry["changedFields"]): string {
  if (!changedFields) return "";
  const keys = Object.keys(changedFields);
  if (keys.length === 0) return "";
  return keys.map(fieldLabel).join(", ") + " 변경";
}

// 엑셀 업로드 한 번이 과제 1건 생성 + 참여기관 N건 생성처럼 여러 개별 기록(AuditEntry)을 한꺼번에
// 남기는 경우, 목록에 하나씩 늘어놓으면 "같이 한 작업"이라는 게 안 보인다. 배치 ID 같은 별도
// 식별자가 없으므로, "같은 과제 + 같은 수행자 + 서로 가까운 시각(연쇄적으로 10초 이내)"인 연속된
// 기록을 하나로 묶어서 보여준다. auditLog는 항상 최신순으로 이미 정렬돼 있어(store.ts), 같은
// 배치의 기록들은 배열에서 서로 인접해 있다는 전제로 순차 비교만 하면 된다.
const BATCH_WINDOW_MS = 10_000;

function groupAuditEntries(
  entries: AuditEntry[],
  store: ReturnType<typeof useStore>
): { key: string; entries: AuditEntry[]; relatedProject: Project | undefined }[] {
  const groups: { key: string; entries: AuditEntry[]; relatedProject: Project | undefined }[] = [];
  for (const entry of entries) {
    const relatedProject = getRelatedProject(entry, store);
    const groupKey = `${relatedProject?.id ?? `entity:${entry.entityType}:${entry.entityId}`}|${entry.performedBy}|${entry.action}`;
    const last = groups[groups.length - 1];
    if (last && last.key === groupKey) {
      const lastEntry = last.entries[last.entries.length - 1];
      const t1 = new Date(lastEntry.performedAt.replace(" ", "T")).getTime();
      const t2 = new Date(entry.performedAt.replace(" ", "T")).getTime();
      if (Math.abs(t1 - t2) <= BATCH_WINDOW_MS) {
        last.entries.push(entry);
        continue;
      }
    }
    groups.push({ key: groupKey, entries: [entry], relatedProject });
  }
  return groups;
}

export default function AuditLogPage() {
  const store = useStore();
  const { auditLog } = store;
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [projectNumberFilter, setProjectNumberFilter] = useState("");
  const [leadInstitutionFilter, setLeadInstitutionFilter] = useState("");
  const [researchLeadFilter, setResearchLeadFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(
    () =>
      auditLog.filter((e) => {
        if (entityFilter !== "ALL" && e.entityType !== entityFilter) return false;
        if (actionFilter !== "ALL" && e.action !== actionFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          const matches =
            e.entityLabel.toLowerCase().includes(q) ||
            (ENTITY_NAMES[e.entityType] ?? "").includes(q) ||
            e.performedBy.toLowerCase().includes(q);
          if (!matches) return false;
        }
        if (projectNumberFilter.trim() || leadInstitutionFilter.trim() || researchLeadFilter.trim()) {
          const project = getRelatedProject(e, store);
          if (
            projectNumberFilter.trim() &&
            !(project?.projectNumber ?? "").toLowerCase().includes(projectNumberFilter.trim().toLowerCase())
          ) return false;
          if (
            leadInstitutionFilter.trim() &&
            !(project?.leadInstitutionName ?? "").toLowerCase().includes(leadInstitutionFilter.trim().toLowerCase())
          ) return false;
          if (
            researchLeadFilter.trim() &&
            !(project?.researchLead ?? "").toLowerCase().includes(researchLeadFilter.trim().toLowerCase())
          ) return false;
        }
        return true;
      }),
    [auditLog, entityFilter, actionFilter, search, projectNumberFilter, leadInstitutionFilter, researchLeadFilter, store]
  );

  const groups = useMemo(() => groupAuditEntries(filtered, store), [filtered, store]);

  // 기록 하나를 표에 그리는 행(요약 행 + "상세" 눌렀을 때 펼쳐지는 변경내용 행). 그룹으로 묶이지
  // 않은 단일 기록에도, 묶인 그룹을 펼쳤을 때 그 안의 각 기록에도 똑같이 쓰인다.
  function EntryRow({ entry }: { entry: AuditEntry }) {
    const hasDetail = entry.changedFields && Object.keys(entry.changedFields).length > 0;
    const summary = changeSummary(entry.changedFields);
    const isExpanded = expanded === entry.id;
    const navUrl = getEntityUrl(entry.entityType, entry.entityId, store);
    const relatedProject = getRelatedProject(entry, store);
    const relatedAgency = store.fundingAgencies.find((a) => a.id === relatedProject?.agencyId);

    return (
      <React.Fragment key={entry.id}>
        <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
            {entry.performedAt}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
            {ENTITY_NAMES[entry.entityType] ?? entry.entityType}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
            {relatedAgency?.shortName ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
            {relatedProject?.projectNumber ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
            {relatedProject?.leadInstitutionName ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
            {relatedProject?.researchLead ?? "-"}
          </td>
          <td className="px-4 py-3 text-center">
            <StatusBadge label={ACTION_MAP[entry.action].label} color={ACTION_MAP[entry.action].color} />
          </td>
          <td className="px-4 py-3">
            {navUrl ? (
              <Link href={navUrl} className="inline-flex items-center gap-1.5 group">
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
            <td colSpan={10} className="px-6 py-3">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-2">변경 상세</p>
              <div className="space-y-2">
                {Object.entries(entry.changedFields).map(([field, change]) => {
                  const overrideSummary = describeOverrideChange(field, change.after);
                  if (overrideSummary) {
                    return (
                      <div key={field} className="flex items-center gap-3 text-xs">
                        <span className="text-slate-500 font-medium w-32 shrink-0">
                          {fieldLabel(field)}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">{overrideSummary}</span>
                      </div>
                    );
                  }
                  const before = fmtValue(change.before, entry.entityType, field);
                  const after = fmtValue(change.after, entry.entityType, field);
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
  }

  // 같은 과제 + 같은 수행자 + 가까운 시각에 처리된 기록 여러 건을 한 줄로 묶어 보여준다. 펼치면
  // 그 안의 개별 기록이 EntryRow로 그대로 나온다.
  function GroupRow({ group }: { group: { key: string; entries: AuditEntry[]; relatedProject: Project | undefined } }) {
    const { entries, relatedProject } = group;
    const latest = entries[0];
    const oldest = entries[entries.length - 1];
    const groupId = `group:${group.key}:${latest.id}`;
    const isOpen = expandedGroups.has(groupId);
    const relatedAgency = store.fundingAgencies.find((a) => a.id === relatedProject?.agencyId);
    const allSameAction = entries.every((e) => e.action === latest.action);
    const navUrl = relatedProject ? `/projects/${relatedProject.id}` : getEntityUrl(latest.entityType, latest.entityId, store);
    const timeLabel = latest.performedAt === oldest.performedAt
      ? latest.performedAt
      : `${oldest.performedAt} ~ ${latest.performedAt}`;

    return (
      <React.Fragment key={groupId}>
        <tr className="border-b border-slate-50 hover:bg-slate-50 transition-colors bg-slate-50/50">
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
            {timeLabel}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
            {ENTITY_NAMES[latest.entityType] ?? latest.entityType} 외
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
            {relatedAgency?.shortName ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">
            {relatedProject?.projectNumber ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
            {relatedProject?.leadInstitutionName ?? "-"}
          </td>
          <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
            {relatedProject?.researchLead ?? "-"}
          </td>
          <td className="px-4 py-3 text-center">
            <StatusBadge
              label={allSameAction ? ACTION_MAP[latest.action].label : "여러 작업"}
              color={allSameAction ? ACTION_MAP[latest.action].color : "amber"}
            />
          </td>
          <td className="px-4 py-3">
            {navUrl ? (
              <Link href={navUrl} className="inline-flex items-center gap-1.5 group">
                <span className="font-medium text-blue-600 group-hover:underline text-sm">
                  {relatedProject?.projectName ?? latest.entityLabel}
                </span>
                <FiExternalLink size={11} className="text-blue-400 shrink-0" />
              </Link>
            ) : (
              <p className="font-medium text-slate-800 text-sm">{latest.entityLabel}</p>
            )}
            <p className="text-xs text-slate-400 mt-0.5">한 번에 처리된 작업 {entries.length}건</p>
          </td>
          <td className="px-4 py-3 text-center text-sm text-slate-700">{latest.performedBy}</td>
          <td className="px-4 py-3 text-center">
            <button
              onClick={() => toggleGroup(groupId)}
              className="flex items-center gap-1 mx-auto text-xs text-blue-600 hover:text-blue-800 transition-colors"
            >
              {isOpen ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
              <span>{entries.length}</span>
            </button>
          </td>
        </tr>
        {isOpen && entries.map((e) => <EntryRow key={e.id} entry={e} />)}
      </React.Fragment>
    );
  }

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
        <input
          value={projectNumberFilter}
          onChange={(e) => setProjectNumberFilter(e.target.value)}
          placeholder="과제번호 검색…"
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-36"
        />
        <input
          value={leadInstitutionFilter}
          onChange={(e) => setLeadInstitutionFilter(e.target.value)}
          placeholder="주관기관 검색…"
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-36"
        />
        <input
          value={researchLeadFilter}
          onChange={(e) => setResearchLeadFilter(e.target.value)}
          placeholder="연구책임자 검색…"
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 w-32"
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
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-20">전담기관 약칭</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-32">과제번호</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-20">연구책임자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-28">액션</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">대상 / 변경내용</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-20">수행자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-16">상세</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) =>
                group.entries.length === 1 ? (
                  <EntryRow key={group.entries[0].id} entry={group.entries[0]} />
                ) : (
                  <GroupRow key={group.key + group.entries[0].id} group={group} />
                )
              )}
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
