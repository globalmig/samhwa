"use client";

import { useState, useMemo } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addSettlement, updateSettlement } from "@/lib/store";
import { type Settlement } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

const STATUS_MAP: Record<Settlement["status"], { label: string; color: "green" | "blue" | "slate" }> = {
  PAID: { label: "지급완료", color: "green" },
  SCHEDULED: { label: "정산예정", color: "blue" },
  PENDING: { label: "처리중", color: "slate" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: Settlement };

const EMPTY: Omit<Settlement, "id"> = {
  projectNumber: "",
  projectName: "",
  termYear: new Date().getFullYear(),
  institutionId: "",
  institutionName: "",
  isLead: false,
  settlementAmount: 0,
  additionalAmount: 0,
  feeAmount: 0,
  scheduledAmount: 0,
  paidAt: null,
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

function SettlementForm({ initial, onSubmit, onClose }: { initial: Omit<Settlement, "id">; onSubmit: (d: Omit<Settlement, "id">) => void; onClose: () => void }) {
  const { institutions } = useStore();
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  function handleInstitutionChange(instId: string) {
    const inst = institutions.find((i) => i.id === instId);
    s("institutionId", instId);
    s("institutionName", inst?.name ?? "");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="과제번호"><input className={inputCls} value={form.projectNumber} onChange={(e) => s("projectNumber", e.target.value)} /></Field>
        <Field label="과제명"><input className={inputCls} value={form.projectName} onChange={(e) => s("projectName", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="정산기관">
          <select className={selectCls} value={form.institutionId} onChange={(e) => handleInstitutionChange(e.target.value)}>
            <option value="">선택하세요</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
        <Field label="연도"><input className={inputCls} type="number" value={form.termYear} onChange={(e) => s("termYear", Number(e.target.value))} /></Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Settlement["status"])}>
            <option value="PENDING">처리중</option>
            <option value="SCHEDULED">정산예정</option>
            <option value="PAID">지급완료</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={form.isLead} onChange={(e) => s("isLead", e.target.checked)} className="rounded" />
        주관기관 여부
      </label>
      <div className="grid grid-cols-2 gap-4">
        <Field label="정산금(원)"><input className={inputCls} type="number" min={0} value={form.settlementAmount} onChange={(e) => s("settlementAmount", Number(e.target.value))} /></Field>
        <Field label="추가금(원)"><input className={inputCls} type="number" min={0} value={form.additionalAmount} onChange={(e) => s("additionalAmount", Number(e.target.value))} /></Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="수수료(원)"><input className={inputCls} type="number" min={0} value={form.feeAmount} onChange={(e) => s("feeAmount", Number(e.target.value))} /></Field>
        <Field label="정산예정금(원)"><input className={inputCls} type="number" min={0} value={form.scheduledAmount} onChange={(e) => s("scheduledAmount", Number(e.target.value))} /></Field>
        <Field label="지급일"><input className={inputCls} type="date" value={form.paidAt ?? ""} onChange={(e) => s("paidAt", e.target.value || null)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const { settlements } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [leadFilter, setLeadFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      settlements.filter(
        (s) =>
          (statusFilter === "ALL" || s.status === statusFilter) &&
          (leadFilter === "ALL" || (leadFilter === "LEAD" ? s.isLead : !s.isLead)) &&
          (search === "" || s.projectName.includes(search) || s.projectNumber.includes(search) || s.institutionName.includes(search))
      ),
    [settlements, search, statusFilter, leadFilter]
  );

  const scheduledTotal = settlements.filter((s) => s.status !== "PAID").reduce((acc, s) => acc + s.scheduledAmount, 0);
  const paidTotal = settlements.filter((s) => s.status === "PAID").reduce((acc, s) => acc + s.scheduledAmount, 0);

  function handleSubmit(data: Omit<Settlement, "id">) {
    if (modal?.mode === "add") addSettlement(data);
    else if (modal?.mode === "edit") updateSettlement(modal.target.id, data);
    setModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">기관 정산 관리 · 전체 {settlements.length}건</p>
        <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
          새 정산 추가
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "정산 예정 합계", value: fmtWon(scheduledTotal), color: "text-blue-600" },
          { label: "지급 완료", value: fmtWon(paidTotal), color: "text-green-600" },
          { label: "예정 건수", value: `${settlements.filter((s) => s.status === "SCHEDULED").length}건`, color: "text-blue-600" },
          { label: "지급완료 건수", value: `${settlements.filter((s) => s.status === "PAID").length}건`, color: "text-green-600" },
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
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="과제번호, 과제명, 기관명 검색..." className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400" />
        <div className="flex items-center gap-2 shrink-0">
          <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 기관</option>
            <option value="LEAD">주관기관</option>
            <option value="PARTICIPANT">참여기관</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="SCHEDULED">정산예정</option>
            <option value="PAID">지급완료</option>
            <option value="PENDING">처리중</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">기관명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">정산금</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">추가금</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">정산예정금</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">지급일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((s) => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{s.projectNumber}</td>
                    <td className="px-4 py-3">
                      <p className={`font-medium max-w-xs truncate text-sm ${s.isLead ? "text-blue-700" : "text-slate-800"}`}>{s.institutionName}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{s.projectName}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={s.isLead ? "주관" : "참여"} color={s.isLead ? "blue" : "slate"} />
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{s.termYear}년</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-700 whitespace-nowrap">{fmtWon(s.settlementAmount)}</td>
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                      {s.additionalAmount > 0 ? <span className="text-green-600">+{fmtWon(s.additionalAmount)}</span> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">
                      {s.feeAmount > 0 ? <span className="text-red-500">-{fmtWon(s.feeAmount)}</span> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-800 whitespace-nowrap">{fmtWon(s.scheduledAmount)}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(s.paidAt)}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge label={STATUS_MAP[s.status].label} color={STATUS_MAP[s.status].color} /></td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setModal({ mode: "edit", target: s })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                        <FiEdit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {settlements.length}건)</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 정산 추가" : "정산 수정"} onClose={() => setModal(null)} size="lg">
          <SettlementForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
