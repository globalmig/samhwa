"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore, getUnissuedInvoiceGroups } from "@/lib/store";
import { isOverdueByRule } from "@/lib/notifications";

function fmtFull(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtRate(n: number) {
  return n.toFixed(1) + "%";
}

const AGENCY_COLORS = ["bg-blue-500", "bg-orange-400", "bg-violet-500", "bg-emerald-500", "bg-slate-400"];

export default function DashboardPage() {
  const router = useRouter();
  const { receivables, projectIssues, termFees, taxInvoices, projects, fundingAgencies } = useStore();

  // 연도별 대시보드 — 배정일(과제 등록일) 기준. 등록일 미입력 과제는 연도별 집계에서 제외한다.
  // 올해 연도는 등록된 과제가 아직 없어도 항상 선택지에 포함해 — 해가 바뀔 때마다 자동으로 새 연도가
  // 드롭다운에 나타나고, 그 해 첫 과제가 등록되기 전에도 미리 선택할 수 있다.
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    years.add(String(new Date().getFullYear()));
    for (const p of projects) {
      if (p.registeredAt) years.add(p.registeredAt.slice(0, 4));
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [projects]);
  const [selectedYear, setSelectedYear] = useState<"ALL" | string>("ALL");

  const projects_ = useMemo(
    () => (selectedYear === "ALL" ? projects : projects.filter((p) => p.registeredAt?.slice(0, 4) === selectedYear)),
    [projects, selectedYear]
  );
  const unregisteredCount = useMemo(() => projects.filter((p) => !p.registeredAt).length, [projects]);
  const projectNumbers = useMemo(() => new Set(projects_.map((p) => p.projectNumber)), [projects_]);
  const receivables_ = useMemo(
    () => (selectedYear === "ALL" ? receivables : receivables.filter((r) => projectNumbers.has(r.projectNumber))),
    [receivables, selectedYear, projectNumbers]
  );
  const termFees_ = useMemo(
    () => (selectedYear === "ALL" ? termFees : termFees.filter((f) => projectNumbers.has(f.projectNumber))),
    [termFees, selectedYear, projectNumbers]
  );
  const taxInvoices_ = useMemo(
    () => (selectedYear === "ALL" ? taxInvoices : taxInvoices.filter((t) => projectNumbers.has(t.projectNumber))),
    [taxInvoices, selectedYear, projectNumbers]
  );
  const projectIssues_ = useMemo(
    () => (selectedYear === "ALL" ? projectIssues : projectIssues.filter((i) => projectNumbers.has(i.projectNumber))),
    [projectIssues, selectedYear, projectNumbers]
  );

  // 긴급 처리 집계 임시
  const overdueReceivables = receivables_.filter((r) => isOverdueByRule(r));
  const overdueAmount = overdueReceivables.reduce((s, r) => s + r.receivableAmount, 0);
  const highIssues = projectIssues_.filter((i) => i.priority === "HIGH");
  const unissuedGroups = getUnissuedInvoiceGroups(projects_, termFees_, taxInvoices_);
  const unissuedAmount = unissuedGroups.reduce((s, g) => s + g.amount, 0);

  // 과제 파이프라인
  const activeCount = projects_.filter((p) => p.status === "ACTIVE").length;
  const completedCount = projects_.filter((p) => p.status === "COMPLETED").length;
  const suspendedCount = projects_.filter((p) => p.status === "SUSPENDED").length;
  const totalProjects = projects_.length;

  // 핵심 지표 — termFees·receivables 실집계 (정적 더미 대신 store 기준)
  const totalFee = termFees_.reduce((s, f) => s + f.appliedFee, 0);
  const totalBilled = receivables_.reduce((s, r) => s + r.billedAmount, 0);
  const totalReceivable = receivables_.reduce((s, r) => s + r.receivableAmount, 0);
  const totalCollected = receivables_.reduce((s, r) => s + r.paidAmount, 0);
  const collectionRate = totalBilled > 0 ? (totalCollected / totalBilled) * 100 : 0;

  // 전담기관별 수금 현황 — receivables를 과제번호로 전담기관에 연결해 집계
  const agencyRows = useMemo(() => {
    const projectByNumber = new Map(projects_.map((p) => [p.projectNumber, p]));
    const map = new Map<string, { id: string; name: string; issuedAmount: number; collectedAmount: number; issuedCount: number }>();
    for (const r of receivables_) {
      const project = projectByNumber.get(r.projectNumber);
      const agency = project ? fundingAgencies.find((a) => a.id === project.agencyId) : undefined;
      if (!agency) continue;
      const entry = map.get(agency.id) ?? { id: agency.id, name: agency.name, issuedAmount: 0, collectedAmount: 0, issuedCount: 0 };
      entry.issuedAmount += r.billedAmount;
      entry.collectedAmount += r.paidAmount;
      entry.issuedCount += 1;
      map.set(agency.id, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.issuedAmount - a.issuedAmount);
  }, [receivables_, projects_, fundingAgencies]);

  const totalIssued = agencyRows.reduce((s, r) => s + r.issuedAmount, 0);
  const totalIssuedCount = agencyRows.reduce((s, r) => s + r.issuedCount, 0);
  const totalRowsCollected = agencyRows.reduce((s, r) => s + r.collectedAmount, 0);

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {selectedYear === "ALL" ? "전체" : `${selectedYear}년`} 과제 {totalProjects}건 기준
          </p>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-slate-100 border-0 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            <option value="ALL">누적</option>
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          실시간 현황
        </div>
      </div>
      {selectedYear !== "ALL" && unregisteredCount > 0 && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          등록일(배정일) 미입력 과제 {unregisteredCount}건은 연도별 집계에서 제외됩니다. 정확한 통계를 위해 과제 상세에서 담당자·등록일을 입력해 주세요.
        </p>
      )}

      {/* 1구역 — 긴급 처리 항목 */}
      <section>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">긴급 처리</p>
        <div className="grid grid-cols-3 gap-3">
          {/* 연체 채권 */}
          <Link href="/receivables" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-red-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">연체 채권</p>
              {overdueReceivables.length > 0 && <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">{overdueReceivables.length}건</span>}
            </div>
            <p className={`text-lg font-bold ${overdueReceivables.length > 0 ? "text-red-600" : "text-slate-300"}`}>{overdueReceivables.length > 0 ? fmtFull(overdueAmount) : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-red-500 transition-colors">채권 페이지에서 관리 →</p>
          </Link>

          {/* HIGH 이슈 */}
          <Link href="/issues" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">HIGH 이슈</p>
              {highIssues.length > 0 && <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5 leading-none">{highIssues.length}건</span>}
            </div>
            <p className={`text-lg font-bold ${highIssues.length > 0 ? "text-amber-600" : "text-slate-300"}`}>{highIssues.length > 0 ? `미처리 ${highIssues.length}건` : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-amber-500 transition-colors">이슈 페이지에서 확인 →</p>
          </Link>

          {/* 세금계산서 미발행 */}
          <Link href="/unclaimed" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">미발행한 금액</p>
              {unissuedGroups.length > 0 && <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5 leading-none">{unissuedGroups.length}건</span>}
            </div>
            <p className={`text-lg font-bold ${unissuedGroups.length > 0 ? "text-amber-600" : "text-slate-300"}`}>{unissuedGroups.length > 0 ? fmtFull(unissuedAmount) : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-amber-500 transition-colors">미발행 페이지에서 관리 →</p>
          </Link>
        </div>
      </section>

      {/* 2구역 — 핵심 지표 */}
      <section>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">핵심 지표</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "총 수수료",
              value: fmtFull(totalFee),
              href: "/fees",
              valueColor: "text-slate-800",
            },
            {
              label: "청구액",
              value: fmtFull(totalBilled),
              href: "/tax-invoices",
              valueColor: "text-slate-800",
            },
            {
              label: "미수금",
              value: fmtFull(totalReceivable),
              href: "/receivables",
              valueColor: "text-red-600",
            },
            {
              label: "수금률",
              value: fmtRate(collectionRate),
              sub: `수금 ${fmtFull(totalCollected)}`,
              href: "/receivables",
              valueColor: collectionRate >= 80 ? "text-emerald-600" : collectionRate >= 50 ? "text-blue-600" : "text-red-500",
            },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${card.valueColor}`}>{card.value}</p>
              {card.sub && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{card.sub}</p>}
            </Link>
          ))}
        </div>
      </section>

      {/* 3구역 — 과제 파이프라인 */}
      <section className="bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-800">과제 파이프라인</p>
          <Link href="/projects" className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
            전체 보기 →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "진행중", count: activeCount, status: "ACTIVE", color: "text-blue-600", bg: "bg-blue-50", bar: "bg-blue-500", hover: "hover:ring-blue-300" },
            { label: "완료", count: completedCount, status: "COMPLETED", color: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500", hover: "hover:ring-emerald-300" },
            { label: "중단", count: suspendedCount, status: "SUSPENDED", color: "text-slate-400", bg: "bg-slate-50", bar: "bg-slate-300", hover: "hover:ring-slate-300" },
          ].map((item) => (
            <Link key={item.label} href={`/projects?status=${item.status}`} className={`block ${item.bg} rounded-lg px-4 py-3 ring-1 ring-transparent ${item.hover} transition-all`}>
              <p className="text-xs text-slate-500 mb-1">{item.label}</p>
              <p className={`text-2xl font-bold ${item.color}`}>
                {item.count}
                <span className="text-sm font-normal ml-1">건</span>
              </p>
              <div className="mt-2 h-1.5 bg-white/70 rounded-full overflow-hidden">
                <div className={`h-full ${item.bar} rounded-full`} style={{ width: totalProjects > 0 ? `${(item.count / totalProjects) * 100}%` : "0%" }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{totalProjects > 0 ? Math.round((item.count / totalProjects) * 100) : 0}%</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 4구역 — 전담기관별 수금 현황 */}
      <section className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">전담기관별 수금 현황</h2>
            <p className="text-xs text-slate-400 mt-0.5">행 클릭 시 해당 기관 과제 목록으로 이동</p>
          </div>
          <Link href="/projects" className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
            전체 과제 보기 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">전담기관</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구액 (원)</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수금액 (원)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구 건수</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수금률</th>
                <th className="w-8 px-3" />
              </tr>
            </thead>
            <tbody>
              {agencyRows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">청구 내역이 없습니다</td></tr>
              ) : agencyRows.map((row, idx) => {
                const rate = row.issuedAmount > 0 ? (row.collectedAmount / row.issuedAmount) * 100 : 0;
                return (
                  <tr
                    key={row.id}
                    className="group border-b border-slate-50 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/projects?agency=${encodeURIComponent(row.name)}`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${AGENCY_COLORS[idx % AGENCY_COLORS.length]}`} />
                        <span className="text-sm font-medium text-slate-700 group-hover:text-blue-700">{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-700 tabular-nums">{row.issuedAmount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3.5 text-right text-sm text-slate-700 tabular-nums">{row.collectedAmount.toLocaleString("ko-KR")}</td>
                    <td className="px-4 py-3.5 text-center text-sm text-slate-600">{row.issuedCount}건</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">
                      <span className={`text-sm font-semibold ${rate >= 90 ? "text-emerald-600" : rate >= 50 ? "text-blue-600" : "text-red-500"}`}>{row.issuedAmount > 0 ? fmtRate(rate) : "–"}</span>
                    </td>
                    <td className="px-3 py-3.5 text-slate-300 group-hover:text-blue-400">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707a1 1 0 0 1 1.414-1.414l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="px-5 py-3 text-xs font-semibold text-slate-600">합계</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 tabular-nums">{totalIssued.toLocaleString("ko-KR")}</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 tabular-nums">{totalRowsCollected.toLocaleString("ko-KR")}</td>
                <td className="px-4 py-3 text-center text-xs font-semibold text-slate-700">{totalIssuedCount}건</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-blue-600 tabular-nums">{totalIssued > 0 ? fmtRate((totalRowsCollected / totalIssued) * 100) : "–"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
