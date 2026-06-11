"use client";

import { useState, useMemo } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addReceivable, updateReceivable } from "@/lib/store";
import { type Receivable } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

const STATUS_MAP: Record<Receivable["status"], { label: string; color: "red" | "amber" | "green" | "blue" }> = {
  OVERDUE: { label: "연체", color: "red" },
  PENDING: { label: "청구중", color: "amber" },
  PARTIAL: { label: "일부수금", color: "blue" },
  PAID: { label: "수금완료", color: "green" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: Receivable };

const EMPTY: Omit<Receivable, "id"> = {
  invoiceNumber: "",
  projectNumber: "",
  projectName: "",
  termYear: new Date().getFullYear(),
  termNumber: 1,
  leadInstitutionId: "",
  leadInstitutionName: "",
  billedAt: new Date().toISOString().slice(0, 10),
  billedAmount: 0,
  paidAmount: 0,
  receivableAmount: 0,
  dueDate: "",
  status: "PENDING",
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

function ReceivableForm({ initial, onSubmit, onClose }: { initial: Omit<Receivable, "id">; onSubmit: (d: Omit<Receivable, "id">) => void; onClose: () => void }) {
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
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Receivable["status"])}>
            <option value="PENDING">청구중</option>
            <option value="OVERDUE">연체</option>
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
        <Field label="청구액(원)"><input className={inputCls} type="number" min={0} value={form.billedAmount} onChange={(e) => s("billedAmount", Number(e.target.value))} /></Field>
        <Field label="수금액(원)"><input className={inputCls} type="number" min={0} value={form.paidAmount} onChange={(e) => s("paidAmount", Number(e.target.value))} /></Field>
        <Field label="채권잔액(원)"><input className={inputCls} type="number" min={0} value={form.receivableAmount} onChange={(e) => s("receivableAmount", Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="청구일"><input className={inputCls} type="date" value={form.billedAt} onChange={(e) => s("billedAt", e.target.value)} /></Field>
        <Field label="만기일"><input className={inputCls} type="date" value={form.dueDate} onChange={(e) => s("dueDate", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const { receivables } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      receivables.filter(
        (r) =>
          (statusFilter === "ALL" || r.status === statusFilter) &&
          (search === "" || r.projectName.includes(search) || r.projectNumber.includes(search) || r.leadInstitutionName.includes(search) || r.invoiceNumber.includes(search))
      ),
    [receivables, search, statusFilter]
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
        <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
          새 채권 추가
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "채권 잔액 합계", value: fmtWon(pendingAmount), color: "text-red-600" },
          { label: "연체액", value: fmtWon(overdueAmount), color: "text-red-700" },
          { label: "연체 건수", value: `${overdueCount}건`, color: "text-red-600" },
          { label: "수금완료", value: `${receivables.filter((r) => r.status === "PAID").length}건`, color: "text-green-600" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9z" clipRule="evenodd" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="계산서번호, 과제번호, 과제명, 주관기관 검색..." className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0">
          <option value="ALL">전체 상태</option>
          <option value="OVERDUE">연체</option>
          <option value="PENDING">청구중</option>
          <option value="PARTIAL">일부수금</option>
          <option value="PAID">수금완료</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">계산서번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구일</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수금액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">채권잔액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">만기일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.invoiceNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{r.projectNumber}</td>
                    <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{r.leadInstitutionName}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">{r.termYear}년 {r.termNumber}연차</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(r.billedAt)}</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700 whitespace-nowrap">{fmtWon(r.billedAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm text-green-700 whitespace-nowrap">{fmtWon(r.paidAmount)}</td>
                    <td className="px-4 py-3 text-right font-bold whitespace-nowrap">
                      {r.receivableAmount > 0
                        ? <span className={r.status === "OVERDUE" ? "text-red-600" : "text-amber-600"}>{fmtWon(r.receivableAmount)}</span>
                        : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs whitespace-nowrap">
                      <span className={r.status === "OVERDUE" ? "text-red-600 font-medium" : "text-slate-500"}>{fmtDate(r.dueDate)}</span>
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge label={STATUS_MAP[r.status].label} color={STATUS_MAP[r.status].color} /></td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setModal({ mode: "edit", target: r })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                        <FiEdit2 size={14} />
                      </button>
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
          <ReceivableForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
