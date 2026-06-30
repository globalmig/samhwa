"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { fmtDate, fmtWon } from "@/lib/utils";
import type { Project } from "@/lib/mock";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "진행중",
  COMPLETED: "완료",
  SUSPENDED: "중단",
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-500",
};

type FilterType = "all" | "active" | "completed";

function ProjectListModal({
  title,
  projects,
  taxInvoices,
  receivables,
  fundingAgencies,
  onClose,
}: {
  title: string;
  projects: Project[];
  taxInvoices: ReturnType<typeof useStore>["taxInvoices"];
  receivables: ReturnType<typeof useStore>["receivables"];
  fundingAgencies: ReturnType<typeof useStore>["fundingAgencies"];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col mx-4">
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 목록 */}
        <div className="overflow-y-auto flex-1">
          {projects.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">해당하는 과제가 없습니다.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 z-10">
                <tr className="border-b border-slate-100 text-[10px] font-semibold text-slate-500">
                  <th className="px-4 py-2.5 text-left w-20">전담기관</th>
                  <th className="px-4 py-2.5 text-left">과제명</th>
                  <th className="px-4 py-2.5 text-left w-32">주관기관</th>
                  <th className="px-4 py-2.5 text-center w-16">상태</th>
                  <th className="px-4 py-2.5 text-center w-22">기간</th>
                  <th className="px-4 py-2.5 text-right w-24">청구액</th>
                  <th className="px-4 py-2.5 text-right w-24">수금액</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => {
                  const agency = fundingAgencies.find((a) => a.id === p.agencyId);
                  const inv = taxInvoices.find((t) => t.projectNumber === p.projectNumber);
                  const rv = receivables.find((r) => r.projectNumber === p.projectNumber);
                  return (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {agency?.shortName ?? p.agency.slice(0, 5)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/projects/${p.id}`}
                          onClick={onClose}
                          className="font-medium text-blue-600 hover:underline hover:text-blue-800 block leading-tight"
                        >
                          {p.projectName}
                        </Link>
                        <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{p.projectNumber}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/institutions/${p.leadInstitutionId}`}
                          onClick={onClose}
                          className="text-slate-600 hover:text-blue-600 hover:underline transition-colors"
                        >
                          {p.leadInstitutionName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLOR[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-500 font-mono text-[10px]">
                        {fmtDate(p.startDate)} ~ {fmtDate(p.endDate)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {inv ? fmtWon(inv.supplyAmount) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700">
                        {rv?.paidAmount ? fmtWon(rv.paidAmount) : <span className="text-slate-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 shrink-0 text-right">
          <span className="text-xs text-slate-400">총 {projects.length}건</span>
        </div>
      </div>
    </div>
  );
}

export default function ResearcherPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: encodedName } = use(params);
  const name = decodeURIComponent(encodedName);

  const { projects, taxInvoices, receivables, projectIssues, fundingAgencies, auditLog } = useStore();

  const [openFilter, setOpenFilter] = useState<FilterType | null>(null);

  const myProjects = useMemo(
    () => projects.filter((p) => p.researchLead === name),
    [projects, name],
  );

  const activeCount = myProjects.filter((p) => p.status === "ACTIVE").length;
  const completedCount = myProjects.filter((p) => p.status === "COMPLETED").length;

  const modalProjects = useMemo(() => {
    if (!openFilter) return [];
    if (openFilter === "all") return myProjects;
    if (openFilter === "active") return myProjects.filter((p) => p.status === "ACTIVE");
    return myProjects.filter((p) => p.status === "COMPLETED");
  }, [openFilter, myProjects]);

  const modalTitle: Record<FilterType, string> = {
    all: "전체 과제",
    active: "진행중 과제",
    completed: "완료 과제",
  };

  const myProjectIds = new Set(myProjects.map((p) => p.id));

  const recentIssues = useMemo(
    () =>
      projectIssues
        .filter((i) => myProjectIds.has(i.projectId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [projectIssues, myProjectIds],
  );

  const recentAudit = useMemo(
    () =>
      auditLog
        .filter((e) => myProjects.some((p) => e.entityLabel?.includes(p.projectName) || e.entityLabel?.includes(p.projectNumber)))
        .sort((a, b) => b.performedAt.localeCompare(a.performedAt))
        .slice(0, 8),
    [auditLog, myProjects],
  );

  const statItems: { label: string; value: number; color: string; filter: FilterType }[] = [
    { label: "전체 과제", value: myProjects.length, color: "text-slate-800", filter: "all" },
    { label: "진행중",    value: activeCount,        color: "text-emerald-600", filter: "active" },
    { label: "완료",      value: completedCount,     color: "text-slate-400",  filter: "completed" },
  ];

  return (
    <div className="space-y-5 w-full max-w-360 mx-auto">
      {openFilter && (
        <ProjectListModal
          title={modalTitle[openFilter]}
          projects={modalProjects}
          taxInvoices={taxInvoices}
          receivables={receivables}
          fundingAgencies={fundingAgencies}
          onClose={() => setOpenFilter(null)}
        />
      )}

      <div className="flex items-center gap-3">
        <Link href="/fees" className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
          ← 수수료 청구 관리
        </Link>
      </div>

      {/* 프로필 헤더 */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex items-center gap-6">
        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-lg font-bold shrink-0">
          {name[0]}
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-800">{name}</h1>
          <p className="text-xs text-slate-400 mt-0.5">연구책임자</p>
        </div>
        <div className="w-px h-10 bg-slate-100 mx-2 shrink-0" />
        <div className="flex gap-2">
          {statItems.map(({ label, value, color, filter }) => {
            const isActive = openFilter === filter;
            return (
              <button
                key={label}
                onClick={() => setOpenFilter(isActive ? null : filter)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors border ${
                  isActive
                    ? "bg-blue-50 border-blue-200"
                    : "border-transparent hover:bg-slate-50 hover:border-slate-200"
                }`}
              >
                <span className={`text-2xl font-bold leading-none ${isActive ? "text-blue-600" : color}`}>
                  {value}
                </span>
                <span className={`text-[11px] leading-tight transition-colors ${isActive ? "text-blue-600" : "text-slate-400"}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 담당 과제 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">담당 과제</p>
        </div>
        {myProjects.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">담당 과제가 없습니다.</div>
        ) : (
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col className="w-20" />
              <col />
              <col className="w-44" />
              <col className="w-20" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-32" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-5 py-3 text-left">전담기관</th>
                <th className="px-5 py-3 text-left">과제명</th>
                <th className="px-5 py-3 text-left">주관기관</th>
                <th className="px-5 py-3 text-center">상태</th>
                <th className="px-5 py-3 text-center">시작일</th>
                <th className="px-5 py-3 text-center">종료일</th>
                <th className="px-5 py-3 text-right">청구액</th>
                <th className="px-5 py-3 text-right">수금액</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {myProjects.map((p) => {
                const agency = fundingAgencies.find((a) => a.id === p.agencyId);
                const inv = taxInvoices.find((t) => t.projectNumber === p.projectNumber);
                const rv = receivables.find((r) => r.projectNumber === p.projectNumber);
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                        {agency?.shortName ?? p.agency.slice(0, 5)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/projects/${p.id}`} className="font-medium text-blue-600 hover:underline hover:text-blue-800 line-clamp-1 block">
                        {p.projectName}
                      </Link>
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">{p.projectNumber}</p>
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/institutions/${p.leadInstitutionId}`} className="text-slate-600 hover:text-blue-600 hover:underline transition-colors line-clamp-1 block">
                        {p.leadInstitutionName}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${STATUS_COLOR[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center text-slate-500 font-mono text-[11px]">{fmtDate(p.startDate)}</td>
                    <td className="px-5 py-4 text-center text-slate-500 font-mono text-[11px]">{fmtDate(p.endDate)}</td>
                    <td className="px-5 py-4 text-right font-mono text-slate-700 font-medium">
                      {inv ? fmtWon(inv.supplyAmount) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-emerald-700 font-medium">
                      {rv?.paidAmount ? fmtWon(rv.paidAmount) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5 min-h-48">
        {/* 최근 이슈 */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">최근 이슈</p>
          </div>
          {recentIssues.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">등록된 이슈가 없습니다.</div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentIssues.map((issue) => {
                const project = myProjects.find((p) => p.id === issue.projectId);
                return (
                  <li key={issue.id} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-700 truncate">{issue.title ?? issue.content}</p>
                        {project && (
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate">{project.projectName}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(issue.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 최근 변경이력 */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">최근 변경이력</p>
          </div>
          {recentAudit.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">변경이력이 없습니다.</div>
          ) : (
            <ul className="divide-y divide-slate-50">
              {recentAudit.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-700 truncate">{entry.entityLabel}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{entry.performedBy} · {entry.action}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 shrink-0">{fmtDate(entry.performedAt.slice(0, 10))}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
