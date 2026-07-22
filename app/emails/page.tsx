"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { type EmailDispatch, type Project } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";

// 메일 제목의 "[RS-2024-00000000]" 형태에서 과제번호를 추출해 관련 과제를 찾는다.
function getEmailProject(e: EmailDispatch, projects: Project[]): Project | undefined {
  const m = e.subject.match(/\[([^\]]+)\]/);
  const projectNumber = m?.[1];
  return projectNumber ? projects.find((p) => p.projectNumber === projectNumber) : undefined;
}

const TYPE_MAP: Record<EmailDispatch["emailType"], { label: string; color: "blue" | "indigo" | "purple" | "slate" | "teal" }> = {
  TAX_INVOICE: { label: "세금계산서 공문", color: "blue" },
  FEE_DETAIL: { label: "수수료 산출내역 안내", color: "indigo" },
  SETTLEMENT_NOTICE: { label: "정산절차 안내 공문", color: "purple" },
  OTHER: { label: "기타 공문", color: "slate" },
};
const REVERSE_TYPE = { label: "역발행 수수료 공문", color: "teal" as const };

// 실제 emailType(TAX_INVOICE 등)과 별개로, 역발행 요청 여부를 반영한 "표시용 유형"을 계산한다 —
// 역발행 요청 공문은 세금계산서 공문과 발송 목적이 달라 목록/필터에서 구분해서 보여줘야 한다.
function displayType(e: EmailDispatch): { key: string; label: string; color: "blue" | "indigo" | "purple" | "slate" | "teal" } {
  if (e.emailType === "TAX_INVOICE" && e.isReverseRequest) return { key: "REVERSE_INVOICE", ...REVERSE_TYPE };
  return { key: e.emailType, ...TYPE_MAP[e.emailType] };
}

const CATEGORY_LABEL: Record<NonNullable<EmailDispatch["feeCategory"]>, string> = {
  ANNUAL: "연차상시점검수수료",
  SETTLEMENT: "위탁정산수수료",
};

const STATUS_MAP: Record<EmailDispatch["status"], { label: string; color: "green" | "red" | "amber" }> = {
  SUCCESS: { label: "발송완료", color: "green" },
  FAILED: { label: "발송실패", color: "red" },
  PENDING: { label: "대기", color: "amber" },
};

export default function EmailDispatchesPage() {
  const router = useRouter();
  const { emailDispatches, projects, fundingAgencies } = useStore();
  const [filterRecipient, setFilterRecipient] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterProjectNumber, setFilterProjectNumber] = useState("");
  const [filterResearchLead, setFilterResearchLead] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(
    () =>
      [...emailDispatches]
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
        .filter((e) => {
          if (typeFilter !== "ALL" && displayType(e).key !== typeFilter) return false;
          if (statusFilter !== "ALL" && e.status !== statusFilter) return false;
          if (filterRecipient !== "" && !e.recipientInstitution.includes(filterRecipient) && !e.recipientEmail.includes(filterRecipient)) return false;
          if (filterSubject !== "" && !e.subject.includes(filterSubject)) return false;
          if (filterProjectNumber.trim() || filterResearchLead.trim()) {
            const project = getEmailProject(e, projects);
            if (
              filterProjectNumber.trim() &&
              !(project?.projectNumber ?? "").toLowerCase().includes(filterProjectNumber.trim().toLowerCase())
            ) return false;
            if (
              filterResearchLead.trim() &&
              !(project?.researchLead ?? "").toLowerCase().includes(filterResearchLead.trim().toLowerCase())
            ) return false;
          }
          return true;
        }),
    [emailDispatches, filterRecipient, filterSubject, filterProjectNumber, filterResearchLead, typeFilter, statusFilter, projects]
  );

  const successCount = emailDispatches.filter((e) => e.status === "SUCCESS").length;
  const failedCount = emailDispatches.filter((e) => e.status === "FAILED").length;
  const pendingCount = emailDispatches.filter((e) => e.status === "PENDING").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">공문 발송이력 · 전체 {emailDispatches.length}건</p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 발송", value: `${emailDispatches.length}건`, color: "text-slate-800" },
          { label: "발송완료", value: `${successCount}건`, color: "text-emerald-600" },
          { label: "발송실패", value: `${failedCount}건`, color: "text-red-600" },
          { label: "대기", value: `${pendingCount}건`, color: "text-amber-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 grid grid-cols-4 gap-3">
          {[
            { label: "수신기관 / 이메일", value: filterRecipient, onChange: setFilterRecipient },
            { label: "제목", value: filterSubject, onChange: setFilterSubject },
            { label: "과제번호", value: filterProjectNumber, onChange: setFilterProjectNumber },
            { label: "연구책임자", value: filterResearchLead, onChange: setFilterResearchLead },
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
        <div className="px-4 py-2.5 flex justify-end gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 유형</option>
            <option value="TAX_INVOICE">세금계산서 공문</option>
            <option value="REVERSE_INVOICE">역발행 수수료 공문</option>
            <option value="FEE_DETAIL">수수료 산출내역 안내</option>
            <option value="SETTLEMENT_NOTICE">정산절차 안내 공문</option>
            <option value="OTHER">기타 공문</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="SUCCESS">발송완료</option>
            <option value="FAILED">발송실패</option>
            <option value="PENDING">대기</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-36">발송일시</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수신기관</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">제목</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">전담기관 약칭</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연구책임자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해시작일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해종료일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">첨부</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발송인</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((e) => {
                  const project = getEmailProject(e, projects);
                  const agency = fundingAgencies.find((a) => a.id === project?.agencyId);
                  return (
                  <tr
                    key={e.id}
                    onClick={() => router.push(`/emails/${e.id}`)}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">{e.sentAt}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-sm font-medium text-slate-800">{e.recipientInstitution}</p>
                      <p className="text-xs text-slate-400">{e.recipientEmail}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm text-slate-700">{e.subject}</p>
                      {e.feeCategory && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {CATEGORY_LABEL[e.feeCategory]}{e.isReverseRequest ? " · 역발행 요청" : ""}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{agency?.shortName ?? "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap font-mono">{project?.projectNumber ?? "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{project?.researchLead ?? "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{project?.startDate ? fmtDate(project.startDate) : "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{project?.endDate ? fmtDate(project.endDate) : "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={displayType(e).label} color={displayType(e).color} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{e.attachments.length}개</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={STATUS_MAP[e.status].label} color={STATUS_MAP[e.status].color} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{e.senderName}</td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {emailDispatches.length}건)</div>
      </div>
    </div>
  );
}
