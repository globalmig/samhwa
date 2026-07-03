"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addTaxInvoice, updateTaxInvoice } from "@/lib/store";
import { type TaxInvoice } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import { useCanWrite } from "@/lib/permissions";

const STATUS_MAP: Record<TaxInvoice["status"], { label: string; color: "green" | "amber" | "red" }> = {
  ISSUED: { label: "발행", color: "green" },
  MODIFIED: { label: "수정발행", color: "amber" },
  CANCELED: { label: "취소", color: "red" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: TaxInvoice };

const EMPTY: Omit<TaxInvoice, "id"> = {
  invoiceNumber: "",
  projectNumber: "",
  projectName: "",
  termYear: new Date().getFullYear(),
  termNumber: 1,
  leadInstitutionId: "",
  leadInstitutionName: "",
  issuedAt: new Date().toISOString().slice(0, 10),
  supplyAmount: 0,
  taxAmount: 0,
  totalAmount: 0,
  status: "ISSUED",
};

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

function InvoiceForm({ initial, onSubmit, onClose }: { initial: Omit<TaxInvoice, "id">; onSubmit: (d: Omit<TaxInvoice, "id">) => void; onClose: () => void }) {
  const { institutions } = useStore();
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

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
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as TaxInvoice["status"])}>
            <option value="ISSUED">발행</option>
            <option value="MODIFIED">수정발행</option>
            <option value="CANCELED">취소</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="과제번호"><input className={inputCls} value={form.projectNumber} onChange={(e) => s("projectNumber", e.target.value)} /></Field>
        <Field label="과제명"><input className={inputCls} value={form.projectName} onChange={(e) => s("projectName", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <Field label="주관기관 (수신자)">
          <select className={selectCls} value={form.leadInstitutionId} onChange={(e) => handleLeadChange(e.target.value)}>
            <option value="">선택하세요</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="연도"><input className={inputCls} type="number" value={form.termYear} onChange={(e) => s("termYear", Number(e.target.value))} /></Field>
        <Field label="연차"><input className={inputCls} type="number" min={1} value={form.termNumber} onChange={(e) => s("termNumber", Number(e.target.value))} /></Field>
        <Field label="발행일"><input className={inputCls} type="date" value={form.issuedAt} onChange={(e) => s("issuedAt", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="공급가액(원)"><input className={inputCls} type="number" min={0} value={form.supplyAmount} onChange={(e) => s("supplyAmount", Number(e.target.value))} /></Field>
        <Field label="부가세(원)"><input className={inputCls} type="number" min={0} value={form.taxAmount} onChange={(e) => s("taxAmount", Number(e.target.value))} /></Field>
        <Field label="합계(원)"><input className={inputCls} type="number" min={0} value={form.totalAmount} onChange={(e) => s("totalAmount", Number(e.target.value))} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function TaxInvoicesPage() {
  const canEdit = useCanWrite('tax-invoices');
  const { taxInvoices, projects, fundingAgencies } = useStore();
  const [filterInvoiceNumber,   setFilterInvoiceNumber]   = useState("");
  const [filterProjectNumber,   setFilterProjectNumber]   = useState("");
  const [filterProjectName,     setFilterProjectName]     = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  // 과제번호로 연결된 과제 정보(전담기관 약칭·연구책임자·당해기간·총 연차)를 함께 표시
  const enriched = useMemo(
    () =>
      taxInvoices.map((t) => {
        const project = projects.find((p) => p.projectNumber === t.projectNumber);
        const agency = project ? fundingAgencies.find((a) => a.id === project.agencyId) : undefined;
        return {
          ...t,
          agencyShortName: agency?.shortName ?? "",
          researchLead: project?.researchLead ?? "",
          termStartDate: project?.startDate ?? "",
          termEndDate: project?.endDate ?? "",
          totalTerms: project?.totalTerms ?? 0,
        };
      }),
    [taxInvoices, projects, fundingAgencies]
  );

  const filtered = useMemo(
    () =>
      enriched.filter(
        (t) =>
          (statusFilter === "ALL" || t.status === statusFilter) &&
          (filterInvoiceNumber   === "" || t.invoiceNumber.includes(filterInvoiceNumber)) &&
          (filterProjectNumber   === "" || t.projectNumber.includes(filterProjectNumber)) &&
          (filterProjectName     === "" || t.projectName.includes(filterProjectName)) &&
          (filterLeadInstitution === "" || t.leadInstitutionName.includes(filterLeadInstitution))
      ),
    [enriched, filterInvoiceNumber, filterProjectNumber, filterProjectName, filterLeadInstitution, statusFilter]
  );

  const totalSupply = filtered.filter((t) => t.status !== "CANCELED").reduce((s, t) => s + t.supplyAmount, 0);
  const totalTax = filtered.filter((t) => t.status !== "CANCELED").reduce((s, t) => s + t.taxAmount, 0);

  function handleSubmit(data: Omit<TaxInvoice, "id">) {
    if (modal?.mode === "add") addTaxInvoice(data);
    else if (modal?.mode === "edit") updateTaxInvoice(modal.target.id, data);
    setModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">세금계산서 관리 · 주관기관 앞 발행 · 전체 {taxInvoices.length}건</p>
        {canEdit && (
          <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            새 계산서 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "공급가액 합계", value: fmtWon(totalSupply), color: "text-slate-800" },
          { label: "부가세 합계", value: fmtWon(totalTax), color: "text-slate-600" },
          { label: "발행", value: `${taxInvoices.filter((t) => t.status === "ISSUED").length}건`, color: "text-green-600" },
          { label: "수정/취소", value: `${taxInvoices.filter((t) => t.status !== "ISSUED").length}건`, color: "text-amber-600" },
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
            <option value="ISSUED">발행</option>
            <option value="MODIFIED">수정발행</option>
            <option value="CANCELED">취소</option>
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
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관 (수신자)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연구책임자</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해시작일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해종료일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발행일</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">공급가액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">부가세</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">합계</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={14} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((t) => (
                  <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${t.status === "CANCELED" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{t.invoiceNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{t.projectNumber}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{t.agencyShortName || "-"}</td>
                    <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{t.leadInstitutionName}</td>
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      {t.researchLead
                        ? <Link href={`/researchers/${encodeURIComponent(t.researchLead)}`} className="text-slate-700 hover:text-blue-600 hover:underline transition-colors">{t.researchLead}</Link>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                      {t.totalTerms > 0 ? `${t.termNumber}/${t.totalTerms}` : `${t.termYear}년 ${t.termNumber}연차`}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{t.termStartDate ? fmtDate(t.termStartDate) : "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{t.termEndDate ? fmtDate(t.termEndDate) : "-"}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(t.issuedAt)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-800 whitespace-nowrap">{fmtWon(t.supplyAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">{fmtWon(t.taxAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtWon(t.totalAmount)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge label={STATUS_MAP[t.status].label} color={STATUS_MAP[t.status].color} /></td>
                    <td className="px-4 py-3 text-center">
                      {canEdit && (
                        <button onClick={() => setModal({ mode: "edit", target: t })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
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
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {taxInvoices.length}건)</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 세금계산서 추가" : "세금계산서 수정"} onClose={() => setModal(null)} size="lg">
          <InvoiceForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
