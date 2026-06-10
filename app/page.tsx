import StatCard from "@/components/dashboard/StatCard";
import FeeTable from "@/components/dashboard/FeeTable";
import { summary, projectFeeRows, institutionRows, agencyBreakdown } from "@/lib/mock";

function fmt(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
  return n.toLocaleString("ko-KR");
}

function fmtFull(n: number) {
  return n.toLocaleString("ko-KR") + "원";
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">2024년 기준 · 전체 과제 종합</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          마지막 업데이트: 2024-12-10 09:32
        </div>
      </div>

      {/* KPI 카드 4개 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="총 수수료 (2024)"
          value={fmt(summary.totalFee)}
          sub={fmtFull(summary.totalFee)}
          change={summary.totalFeeChange}
          changeType="up"
          variant="default"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-13a1 1 0 1 0-2 0v.092a4.535 4.535 0 0 0-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 1 0-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 1 0 2 0v-.092a4.535 4.535 0 0 0 1.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0 0 11 9.092V7.151c.391.127.68.317.843.504a1 1 0 1 0 1.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
        <StatCard
          label="누적 미청구액"
          value={fmt(summary.unclaimedFee)}
          sub={fmtFull(summary.unclaimedFee)}
          change={summary.unclaimedChange}
          changeType="down"
          variant="warning"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M5 2a2 2 0 0 0-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 0 0-2-2H5zm4.707 3.707a1 1 0 0 0-1.414-1.414l-3 3a1 1 0 0 0 0 1.414l3 3a1 1 0 0 0 1.414-1.414L8.414 9H10a3 3 0 0 1 3 3 1 1 0 1 0 2 0 5 5 0 0 0-5-5H8.414l1.293-1.293z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
        <StatCard
          label="미수금 (채권 잔액)"
          value={fmt(summary.receivable)}
          sub={fmtFull(summary.receivable)}
          change={summary.receivableChange}
          changeType="up"
          variant="danger"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M4 4a2 2 0 0 0-2 2v1h16V6a2 2 0 0 0-2-2H4z" />
              <path
                fillRule="evenodd"
                d="M18 9H2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM4 13a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1zm5-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2H9z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
        <StatCard
          label="정산 예정금"
          value={fmt(summary.scheduledSettlement)}
          sub={fmtFull(summary.scheduledSettlement)}
          change={summary.settlementChange}
          changeType="up"
          variant="success"
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path
                fillRule="evenodd"
                d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8zm0-3a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8zm1-5a1 1 0 0 1 1-1v1h1a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1V4z"
                clipRule="evenodd"
              />
            </svg>
          }
        />
      </div>

      {/* 메인 콘텐츠: 과제 테이블 + 사이드 패널 */}
      <div className="grid grid-cols-3 gap-4">
        {/* 과제별 수수료 현황 테이블 (좌 2/3) */}
        <div className="col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">과제별 수수료 현황</h2>
              <p className="text-xs text-slate-400 mt-0.5">2024년 전체 과제 · {projectFeeRows.length}건</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                </svg>
                미청구 {projectFeeRows.filter((r) => r.unclaimedFee > 0).length}건
              </span>
              <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-md">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                  <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287zM8 5.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z" />
                </svg>
                미수금 {projectFeeRows.filter((r) => r.receivable > 0).length}건
              </span>
            </div>
          </div>
          <FeeTable rows={projectFeeRows} />
        </div>

        {/* 우측 패널 (1/3) */}
        <div className="flex flex-col gap-4">
          {/* 전문기관별 수수료 비율 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">전문기관별 수수료 비율</h2>
            <div className="space-y-3">
              {agencyBreakdown.map((item) => (
                <div key={item.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-600 truncate max-w-35">{item.name}</span>
                    <span className="text-xs font-medium text-slate-700">{item.rate}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${item.rate}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                    {(item.fee / 10_000).toFixed(0)}만원
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 수행기관별 현황 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex-1">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">주요 수행기관 현황</h2>
            <div className="space-y-3">
              {institutionRows.map((inst) => (
                <div
                  key={inst.name}
                  className="flex items-start justify-between py-2.5 border-b border-slate-50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">{inst.name}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {inst.type} · 과제 {inst.projectCount}건
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <p className="text-xs font-semibold text-slate-800">
                      {(inst.totalFee / 10_000).toFixed(0)}만
                    </p>
                    {inst.unclaimed > 0 && (
                      <p className="text-[10px] text-amber-500">
                        미청구 {(inst.unclaimed / 10_000).toFixed(0)}만
                      </p>
                    )}
                    {inst.receivable > 0 && (
                      <p className="text-[10px] text-red-500">
                        미수금 {(inst.receivable / 10_000).toFixed(0)}만
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 하단 요약 바 */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4">
        <div className="flex items-center gap-8">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
            2024년 종합
          </p>
          <div className="flex items-center gap-8 flex-wrap">
            {[
              {
                label: "총 청구수수료",
                value: projectFeeRows.reduce((s, r) => s + r.billedFee, 0),
                color: "text-blue-600",
              },
              {
                label: "총 미청구액",
                value: projectFeeRows.reduce((s, r) => s + r.unclaimedFee, 0),
                color: "text-amber-600",
              },
              {
                label: "총 미수금",
                value: projectFeeRows.reduce((s, r) => s + r.receivable, 0),
                color: "text-red-600",
              },
              {
                label: "전체 사업비",
                value: projectFeeRows.reduce((s, r) => s + r.totalBudget, 0),
                color: "text-slate-700",
              },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-[10px] text-slate-400">{item.label}</p>
                <p className={`text-sm font-bold ${item.color}`}>
                  {item.value.toLocaleString("ko-KR")}원
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
