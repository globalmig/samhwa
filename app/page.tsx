"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { agencyFeeRows, summary } from "@/lib/mock";

function fmt(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtFull(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

function fmtRate(n: number) {
  return n.toFixed(1) + "%";
}

const AGENCY_COLORS = ["bg-blue-500", "bg-orange-400", "bg-violet-500", "bg-emerald-500", "bg-slate-400"];

export default function DashboardPage() {
  const router = useRouter();
  const { receivables, projectIssues, settlements, unclaimedFees, projects } = useStore();

  // 긴급 처리 집계 임시
  const overdueReceivables = receivables.filter((r) => r.status === "OVERDUE");
  const overdueAmount = overdueReceivables.reduce((s, r) => s + r.receivableAmount, 0);
  const highIssues = projectIssues.filter((i) => i.priority === "HIGH");
  const scheduledSettlements = settlements.filter((s) => s.status === "SCHEDULED");
  const pendingUnclaimed = unclaimedFees.filter((f) => f.status === "PENDING");
  const pendingUnclaimedAmount = pendingUnclaimed.reduce((s, f) => s + f.amount, 0);

  // 과제 파이프라인
  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;
  const completedCount = projects.filter((p) => p.status === "COMPLETED").length;
  const suspendedCount = projects.filter((p) => p.status === "SUSPENDED").length;
  const totalProjects = projects.length;

  // 수금률 (agencyFeeRows 기준)
  const totalIssued = agencyFeeRows.reduce((s, r) => s + r.issuedAmount, 0);
  const totalCollected = agencyFeeRows.reduce((s, r) => s + r.collectedAmount, 0);
  const totalIssuedCount = agencyFeeRows.reduce((s, r) => s + r.issuedCount, 0);
  const collectionRate = totalIssued > 0 ? (totalCollected / totalIssued) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전체 과제 {totalProjects}건 기준</p>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          실시간 현황
        </div>
      </div>

      {/* 1구역 — 긴급 처리 항목 */}
      <section>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">긴급 처리</p>
        <div className="grid grid-cols-4 gap-3">
          {/* 연체 채권 */}
          <Link href="/receivables" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-red-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">연체 채권</p>
              {overdueReceivables.length > 0 && <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">{overdueReceivables.length}건</span>}
            </div>
            <p className={`text-base font-bold ${overdueReceivables.length > 0 ? "text-red-600" : "text-slate-300"}`}>{overdueReceivables.length > 0 ? fmt(overdueAmount) + "원" : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-red-500 transition-colors">채권 페이지에서 관리 →</p>
          </Link>

          {/* HIGH 이슈 */}
          <Link href="/issues" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">HIGH 이슈</p>
              {highIssues.length > 0 && <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5 leading-none">{highIssues.length}건</span>}
            </div>
            <p className={`text-base font-bold ${highIssues.length > 0 ? "text-amber-600" : "text-slate-300"}`}>{highIssues.length > 0 ? `미처리 ${highIssues.length}건` : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-amber-500 transition-colors">이슈 페이지에서 확인 →</p>
          </Link>

          {/* 정산 예정 */}
          <Link href="/settlements" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">정산 예정</p>
              {scheduledSettlements.length > 0 && <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full px-1.5 py-0.5 leading-none">{scheduledSettlements.length}건</span>}
            </div>
            <p className={`text-base font-bold ${scheduledSettlements.length > 0 ? "text-blue-600" : "text-slate-300"}`}>
              {scheduledSettlements.length > 0 ? `${scheduledSettlements.length}건 대기 중` : "없음"}
            </p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-blue-500 transition-colors">정산 페이지에서 관리 →</p>
          </Link>

          {/* 미청구 대기 */}
          <Link href="/unclaimed" className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-amber-300 hover:shadow-sm transition-all group">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-slate-500">미청구 대기</p>
              {pendingUnclaimed.length > 0 && <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5 leading-none">{pendingUnclaimed.length}건</span>}
            </div>
            <p className={`text-base font-bold ${pendingUnclaimed.length > 0 ? "text-amber-600" : "text-slate-300"}`}>{pendingUnclaimed.length > 0 ? fmt(pendingUnclaimedAmount) + "원" : "없음"}</p>
            <p className="text-[10px] text-slate-400 mt-1.5 group-hover:text-amber-500 transition-colors">미청구 페이지에서 관리 →</p>
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
              value: fmt(summary.totalFee),
              sub: fmtFull(summary.totalFee),
              change: summary.totalFeeChange,
              href: "/fees",
              valueColor: "text-slate-800",
            },
            {
              label: "청구액",
              value: fmt(summary.billedFee),
              sub: fmtFull(summary.billedFee),
              change: summary.billedChange,
              href: "/tax-invoices",
              valueColor: "text-slate-800",
            },
            {
              label: "미수금",
              value: fmt(summary.receivable),
              sub: fmtFull(summary.receivable),
              change: summary.receivableChange,
              href: "/receivables",
              valueColor: "text-red-600",
            },
            {
              label: "수금률",
              value: fmtRate(collectionRate),
              sub: `수금 ${fmtFull(totalCollected)}`,
              change: null,
              href: "/receivables",
              valueColor: collectionRate >= 80 ? "text-emerald-600" : collectionRate >= 50 ? "text-blue-600" : "text-red-500",
            },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="block bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-blue-300 hover:shadow-sm transition-all">
              <p className="text-xs text-slate-500">{card.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${card.valueColor}`}>{card.value}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 truncate">{card.sub}</p>
              {card.change && <p className="text-[10px] text-emerald-600 mt-1 font-medium">{card.change} 전월비</p>}
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
              {agencyFeeRows.map((row, idx) => {
                const rate = row.issuedAmount > 0 ? (row.collectedAmount / row.issuedAmount) * 100 : 0;
                return (
                  <tr
                    key={row.name}
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
                <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 tabular-nums">{totalCollected.toLocaleString("ko-KR")}</td>
                <td className="px-4 py-3 text-center text-xs font-semibold text-slate-700">{totalIssuedCount}건</td>
                <td className="px-4 py-3 text-right text-xs font-semibold text-blue-600 tabular-nums">{totalIssued > 0 ? fmtRate((totalCollected / totalIssued) * 100) : "–"}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
