import type { ProjectFeeRow } from "@/lib/mock";

const STATUS_LABEL: Record<string, { label: string; style: string }> = {
  BILLED: { label: "청구완료", style: "bg-blue-50 text-blue-700" },
  CONFIRMED: { label: "확정", style: "bg-emerald-50 text-emerald-700" },
  DRAFT: { label: "임시", style: "bg-slate-100 text-slate-500" },
  UNCLAIMED: { label: "미청구", style: "bg-amber-50 text-amber-700" },
  OVERDUE: { label: "연체", style: "bg-red-50 text-red-700" },
};

function fmt(n: number) {
  return n.toLocaleString("ko-KR");
}

interface FeeTableProps {
  rows: ProjectFeeRow[];
}

export default function FeeTable({ rows }: FeeTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              과제번호
            </th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500">과제명</th>
            <th className="text-left py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              전문기관
            </th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              연차
            </th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              기관수
            </th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              사업비
            </th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              표준수수료
            </th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              청구수수료
            </th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              미청구액
            </th>
            <th className="text-right py-3 px-4 text-xs font-semibold text-slate-500 whitespace-nowrap">
              미수금
            </th>
            <th className="text-center py-3 px-4 text-xs font-semibold text-slate-500">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.map((row) => {
            const statusInfo = STATUS_LABEL[row.status] ?? STATUS_LABEL["DRAFT"];
            return (
              <tr key={row.projectNumber} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-slate-500 whitespace-nowrap">
                  {row.projectNumber}
                </td>
                <td className="py-3 px-4">
                  <p className="font-medium text-slate-800 truncate max-w-[200px]">
                    {row.projectName}
                  </p>
                </td>
                <td className="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">
                  {row.agency}
                </td>
                <td className="py-3 px-4 text-center text-xs text-slate-600">
                  {row.termYear}년 / {row.termNumber}연차
                </td>
                <td className="py-3 px-4 text-center text-xs text-slate-600">
                  {row.memberCount}개
                </td>
                <td className="py-3 px-4 text-right text-xs text-slate-700 whitespace-nowrap">
                  {fmt(row.totalBudget)}
                </td>
                <td className="py-3 px-4 text-right text-xs text-slate-700 whitespace-nowrap">
                  {fmt(row.calculatedFee)}
                </td>
                <td className="py-3 px-4 text-right text-xs font-medium text-slate-800 whitespace-nowrap">
                  {fmt(row.billedFee)}
                </td>
                <td className="py-3 px-4 text-right text-xs whitespace-nowrap">
                  <span className={row.unclaimedFee > 0 ? "text-amber-600 font-medium" : "text-slate-400"}>
                    {row.unclaimedFee > 0 ? fmt(row.unclaimedFee) : "–"}
                  </span>
                </td>
                <td className="py-3 px-4 text-right text-xs whitespace-nowrap">
                  <span className={row.receivable > 0 ? "text-red-600 font-medium" : "text-slate-400"}>
                    {row.receivable > 0 ? fmt(row.receivable) : "–"}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${statusInfo.style}`}>
                    {statusInfo.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
