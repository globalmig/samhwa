"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronUp, FiArrowRight } from "react-icons/fi";
import { useStore, getUnissuedInvoiceGroups } from "@/lib/store";
import { fmtWonFull, fmtDate } from "@/lib/utils";

const PROJECT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: "진행중",  cls: "text-blue-600" },
  COMPLETED: { label: "완료",   cls: "text-slate-400" },
  SUSPENDED: { label: "중단",   cls: "text-red-500" },
};

// 당해종료일 기준 임박(30일 이내)/경과 여부 — 발행 지연 경고용
function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86_400_000);
}

function termEndUrgency(dateStr: string): { label: string; cls: string } | null {
  const days = daysUntil(dateStr);
  if (days === null) return null;
  if (days < 0) return { label: "종료일 경과", cls: "text-red-600 font-semibold" };
  if (days <= 30) return { label: "종료 임박", cls: "text-amber-600 font-semibold" };
  return null;
}

export default function UnissuedInvoicePage() {
  const { projects, termFees, taxInvoices, fundingAgencies } = useStore();
  const [filterProjectNumber, setFilterProjectNumber] = useState("");
  const [filterProjectName, setFilterProjectName] = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // 과제번호로 연결된 과제 정보(전담기관 약칭·연구책임자·당해기간·총 연차)를 함께 표시
  const enriched = useMemo(() => {
    const groups = getUnissuedInvoiceGroups(projects, termFees, taxInvoices);
    return groups.map((g) => {
      const project = projects.find((p) => p.id === g.projectId);
      const agency = project ? fundingAgencies.find((a) => a.id === project.agencyId) : undefined;
      return {
        ...g,
        agencyShortName: agency?.shortName ?? "",
        researchLead: project?.researchLead ?? "",
        termStartDate: project?.startDate ?? "",
        termEndDate: project?.endDate ?? "",
        totalTerms: project?.totalTerms ?? 0,
      };
    });
  }, [projects, termFees, taxInvoices, fundingAgencies]);

  const filtered = enriched.filter(
    (g) =>
      (filterProjectNumber === "" || g.projectNumber.includes(filterProjectNumber)) &&
      (filterProjectName === "" || g.projectName.includes(filterProjectName)) &&
      (filterLeadInstitution === "" || g.leadInstitutionName.includes(filterLeadInstitution)),
  );

  const totalAmount = enriched.reduce((s, g) => s + g.amount, 0);
  const totalTax = Math.round(totalAmount * 0.1);

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  const COL_COUNT = 9;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">세금계산서 미발행 관리 · 주관기관 기준 · 전체 {enriched.length}건</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "미발행액 합계", value: fmtWonFull(totalAmount), color: "text-amber-600" },
          { label: "미발행 부가세(10%) 합계", value: fmtWonFull(totalTax), color: "text-amber-600" },
          { label: "미발행 건수", value: `${enriched.length}건`, color: "text-slate-700" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          {[
            { label: "과제번호", value: filterProjectNumber, onChange: setFilterProjectNumber },
            { label: "과제명", value: filterProjectName, onChange: setFilterProjectName },
            { label: "주관기관", value: filterLeadInstitution, onChange: setFilterLeadInstitution },
          ].map(({ label, value, onChange }) => (
            <div key={label}>
              <p className="text-[10px] font-medium text-slate-400 mb-1">{label}</p>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`${label} 검색...`}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">약칭</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제명</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연구책임자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해시작일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해종료일</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">미발행액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={COL_COUNT} className="px-4 py-10 text-center text-sm text-slate-400">미발행 항목이 없습니다</td></tr>
              ) : (
                filtered.flatMap((g) => {
                  const isExpanded = expandedKey === g.key;
                  const ps = PROJECT_STATUS[g.projectStatus];
                  const urgency = termEndUrgency(g.termEndDate);
                  return [
                    <tr
                      key={g.key}
                      className={`border-b border-slate-50 transition-colors ${isExpanded ? "bg-blue-50/40" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => toggleExpand(g.key)}
                          className={`p-1 rounded transition-colors ${isExpanded ? "text-blue-600 bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                          title={isExpanded ? "접기" : "자세히 보기"}
                        >
                          {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{g.projectNumber}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{g.agencyShortName || "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate text-xs">{g.projectName}</td>
                      <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{g.leadInstitutionName}</td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        {g.researchLead
                          ? <Link href={`/researchers/${encodeURIComponent(g.researchLead)}`} className="text-slate-700 hover:text-blue-600 hover:underline transition-colors">{g.researchLead}</Link>
                          : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                        {g.totalTerms > 0 ? `${g.termNumber}/${g.totalTerms}` : `${g.termYear}년 ${g.termNumber}연차`}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{g.termStartDate ? fmtDate(g.termStartDate) : "-"}</td>
                      <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                        <span className={urgency?.cls ?? "text-slate-500"}>{g.termEndDate ? fmtDate(g.termEndDate) : "-"}</span>
                        {urgency && <span className={`ml-1.5 text-[10px] ${urgency.cls}`}>{urgency.label}</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{fmtWonFull(g.amount)}</td>
                      <td className={`px-4 py-3 text-center text-xs font-semibold ${ps?.cls ?? "text-slate-400"}`}>{ps?.label ?? "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <Link
                          href={`/projects/${g.projectId}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                          title="과제 상세에서 세금계산서 발행"
                        >
                          발행하기 <FiArrowRight size={12} />
                        </Link>
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={`${g.key}-detail`}>
                        <td colSpan={COL_COUNT} className="px-0 pb-0 bg-slate-50/70">
                          <div className="mx-4 mb-4 mt-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                              <p className="text-xs font-semibold text-slate-700">기관별 신청수수료 내역</p>
                            </div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-slate-100 text-slate-500 font-medium">
                                  <th className="text-left px-4 py-2.5">기관명</th>
                                  <th className="text-center px-4 py-2.5">유형</th>
                                  <th className="text-right px-4 py-2.5">신청수수료</th>
                                </tr>
                              </thead>
                              <tbody>
                                {g.fees.map((f) => (
                                  <tr key={f.id} className="border-b border-slate-50 last:border-0">
                                    <td className="px-4 py-2.5 font-medium text-slate-800">{f.institutionName}</td>
                                    <td className="px-4 py-2.5 text-center text-slate-600">{f.institutionType}</td>
                                    <td className="px-4 py-2.5 text-right text-slate-700">{fmtWonFull(f.appliedFee)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="mx-4 my-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-8 text-xs text-slate-600">
                              <div>
                                <span className="text-slate-400">공급가액</span>
                                <span className="mx-2 text-slate-300">:</span>
                                <span className="font-semibold text-slate-800">{fmtWonFull(g.amount)}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">부가세(10%)</span>
                                <span className="mx-2 text-slate-300">:</span>
                                <span className="font-semibold text-slate-800">{fmtWonFull(Math.round(g.amount * 0.1))}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">합계</span>
                                <span className="mx-2 text-slate-300">:</span>
                                <span className="font-semibold text-amber-600">{fmtWonFull(Math.round(g.amount * 1.1))}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ].filter(Boolean);
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {enriched.length}건)</div>
      </div>
    </div>
  );
}
