"use client";

import { useState, useMemo } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addReceivable, updateReceivable } from "@/lib/store";
import { type Receivable } from "@/lib/mock";
import { fmtWon, fmtDate, addMonths } from "@/lib/utils";
import Link from "next/link";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import MoneyInput from "@/components/common/MoneyInput";
import { useCanWrite } from "@/lib/permissions";
import { isOverdueByRule } from "@/lib/notifications";

const STATUS_MAP: Record<Receivable["status"], { label: string; color: "red" | "amber" | "green" | "blue" }> = {
  OVERDUE: { label: "미수", color: "red" },
  PENDING: { label: "청구중", color: "amber" },
  PARTIAL: { label: "일부수금", color: "blue" },
  PAID: { label: "수금완료", color: "green" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: Receivable };

function makeEmpty(): Omit<Receivable, "id"> {
  const billedAt = new Date().toISOString().slice(0, 10);
  return {
    invoiceNumber: "",
    projectNumber: "",
    projectName: "",
    termYear: new Date().getFullYear(),
    termNumber: 1,
    leadInstitutionId: "",
    leadInstitutionName: "",
    billedAt,
    billedAmount: 0,
    paidAmount: 0,
    receivableAmount: 0,
    dueDate: addMonths(billedAt, 3),
    status: "OVERDUE", // 기본 상태 = 미수 (STATUS_MAP.OVERDUE.label 참고)
  };
}

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ReceivableForm({ initial, onSubmit, onClose }: { initial: Omit<Receivable, "id">; onSubmit: (d: Omit<Receivable, "id">) => void; onClose: () => void }) {
  const { institutions } = useStore();
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  // 청구일이 바뀌면 만기일(청구일+3개월)도 함께 갱신한다 — 단, 사용자가 만기일을
  // 자동계산값과 다르게 직접 수정해둔 경우엔 건드리지 않는다.
  function handleBilledAtChange(nextBilledAt: string) {
    setForm((p) => {
      const wasAutoSynced = p.dueDate === addMonths(p.billedAt, 3);
      return {
        ...p,
        billedAt: nextBilledAt,
        dueDate: wasAutoSynced ? addMonths(nextBilledAt, 3) : p.dueDate,
      };
    });
  }

  function handleLeadChange(instId: string) {
    const inst = institutions.find((i) => i.id === instId);
    s("leadInstitutionId", instId);
    s("leadInstitutionName", inst?.name ?? "");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="계산서번호"><input className={inputCls} value={form.invoiceNumber} onChange={(e) => s("invoiceNumber", e.target.value)} placeholder="2024-08-00001" /></Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Receivable["status"])}>
            <option value="PENDING">청구중</option>
            <option value="OVERDUE">미수</option>
            <option value="PARTIAL">일부수금</option>
            <option value="PAID">수금완료</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="과제번호"><input className={inputCls} value={form.projectNumber} onChange={(e) => s("projectNumber", e.target.value)} /></Field>
        <Field label="과제명"><input className={inputCls} value={form.projectName} onChange={(e) => s("projectName", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="주관기관">
          <select className={selectCls} value={form.leadInstitutionId} onChange={(e) => handleLeadChange(e.target.value)}>
            <option value="">선택하세요</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="연도"><input className={inputCls} type="number" value={form.termYear} onChange={(e) => s("termYear", Number(e.target.value))} /></Field>
        <Field label="연차"><input className={inputCls} type="number" min={1} value={form.termNumber} onChange={(e) => s("termNumber", Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="청구액(원)"><MoneyInput className={inputCls} value={form.billedAmount} onChange={(v) => s("billedAmount", v)} /></Field>
        <Field label="수금액(원)"><MoneyInput className={inputCls} value={form.paidAmount} onChange={(v) => s("paidAmount", v)} /></Field>
        <Field label="미수금(원)"><MoneyInput className={inputCls} value={form.receivableAmount} onChange={(v) => s("receivableAmount", v)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="청구일"><DateInput className="w-full" value={form.billedAt} onChange={handleBilledAtChange} /></Field>
        <Field label="만기일"><DateInput className="w-full" value={form.dueDate} onChange={(v) => s("dueDate", v)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const canEdit = useCanWrite('receivables');
  const { receivables, projects, fundingAgencies } = useStore();
  const [filterInvoiceNumber,   setFilterInvoiceNumber]   = useState("");
  const [filterProjectNumber,   setFilterProjectNumber]   = useState("");
  const [filterProjectName,     setFilterProjectName]     = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  // 과제번호로 연결된 과제 정보(전문기관 약칭·연구책임자·당해기간·총 연차)를 함께 표시
  const enriched = useMemo(
    () =>
      receivables.map((r) => {
        const project = projects.find((p) => p.projectNumber === r.projectNumber);
        const agency = project ? fundingAgencies.find((a) => a.id === project.agencyId) : undefined;
        return {
          ...r,
          agencyShortName: agency?.shortName ?? "",
          researchLead: project?.researchLead ?? "",
          termStartDate: project?.startDate ?? "",
          termEndDate: project?.endDate ?? "",
          totalTerms: project?.totalTerms ?? 0,
        };
      }),
    [receivables, projects, fundingAgencies]
  );

  const filtered = useMemo(
    () =>
      enriched.filter(
        (r) =>
          (statusFilter === "ALL" || (statusFilter === "LATE" ? isOverdueByRule(r) : r.status === statusFilter)) &&
          (filterInvoiceNumber   === "" || r.invoiceNumber.includes(filterInvoiceNumber)) &&
          (filterProjectNumber   === "" || r.projectNumber.includes(filterProjectNumber)) &&
          (filterProjectName     === "" || r.projectName.includes(filterProjectName)) &&
          (filterLeadInstitution === "" || r.leadInstitutionName.includes(filterLeadInstitution))
      ),
    [enriched, filterInvoiceNumber, filterProjectNumber, filterProjectName, filterLeadInstitution, statusFilter]
  );

  const overdueAmount = receivables.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + r.receivableAmount, 0);
  const pendingAmount = receivables.filter((r) => r.status !== "PAID").reduce((s, r) => s + r.receivableAmount, 0);
  const overdueCount = receivables.filter((r) => r.status === "OVERDUE").length;

  function handleSubmit(data: Omit<Receivable, "id">) {
    if (modal?.mode === "add") addReceivable(data);
    else if (modal?.mode === "edit") updateReceivable(modal.target.id, data);
    setModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">미수금/채권 관리 · 주관기관 기준 · 전체 {receivables.length}건</p>
        {canEdit && (
          <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            새 채권 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "미수금 합계", value: fmtWon(pendingAmount), color: "text-red-600" },
          { label: "미수액", value: fmtWon(overdueAmount), color: "text-red-700" },
          { label: "미수 건수", value: `${overdueCount}건`, color: "text-red-600" },
          { label: "수금완료", value: `${receivables.filter((r) => r.status === "PAID").length}건`, color: "text-green-600" },
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
            { label: "계산서번호", value: filterInvoiceNumber,   onChange: setFilterInvoiceNumber   },
            { label: "과제번호",   value: filterProjectNumber,   onChange: setFilterProjectNumber   },
            { label: "과제명",     value: filterProjectName,     onChange: setFilterProjectName     },
            { label: "주관기관",   value: filterLeadInstitution, onChange: setFilterLeadInstitution },
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
        <div className="px-4 py-2.5 flex justify-end">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="OVERDUE">미수</option>
            <option value="LATE">연체</option>
            <option value="PENDING">청구중</option>
            <option value="PARTIAL">일부수금</option>
            <option value="PAID">수금완료</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">계산서번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">약칭</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연구책임자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해시작일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해종료일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구일</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수금액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">미수금</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">만기일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.projectNumber}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{r.agencyShortName || "-"}</td>
                    <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{r.leadInstitutionName}</td>
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      {r.researchLead
                        ? <Link href={`/researchers/${encodeURIComponent(r.researchLead)}`} className="text-slate-700 hover:text-blue-600 hover:underline transition-colors">{r.researchLead}</Link>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                      {r.totalTerms > 0 ? `${r.termNumber}/${r.totalTerms}` : `${r.termYear}년 ${r.termNumber}연차`}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{r.termStartDate ? fmtDate(r.termStartDate) : "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{r.termEndDate ? fmtDate(r.termEndDate) : "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.billedAt)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 whitespace-nowrap">{fmtWon(r.billedAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-700 whitespace-nowrap">{fmtWon(r.paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      {r.receivableAmount > 0
                        ? <span className={r.status === "OVERDUE" || isOverdueByRule(r) ? "text-red-600" : "text-amber-600"}>{fmtWon(r.receivableAmount)}</span>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      <span className={r.status === "OVERDUE" || isOverdueByRule(r) ? "text-red-600 font-medium" : "text-slate-500"}>{fmtDate(r.dueDate)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOverdueByRule(r)
                        ? <StatusBadge label="연체" color="red" />
                        : <StatusBadge label={STATUS_MAP[r.status].label} color={STATUS_MAP[r.status].color} />}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canEdit && (
                        <button onClick={() => setModal({ mode: "edit", target: r })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                          <FiEdit2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {receivables.length}건)</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 채권 추가" : "채권 수정"} onClose={() => setModal(null)} size="lg">
          <ReceivableForm initial={modal.mode === "edit" ? modal.target : makeEmpty()} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
