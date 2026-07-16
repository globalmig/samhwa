"use client";

import { useState, useMemo } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addSettlement, updateSettlement } from "@/lib/store";
import { type Settlement } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import MoneyInput from "@/components/common/MoneyInput";
import { useCanWrite } from "@/lib/permissions";

const STATUS_MAP: Partial<Record<Settlement["status"], { label: string; color: "green" | "blue" | "slate" }>> = {
  PAID: { label: "지급완료", color: "green" },
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
            <option value="PAID">지급완료</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={form.isLead} onChange={(e) => s("isLead", e.target.checked)} className="rounded" />
        주관기관 여부
      </label>
      <div className="grid grid-cols-2 gap-4">
        <Field label="추가금(원)"><MoneyInput className={inputCls} value={form.additionalAmount} onChange={(v) => s("additionalAmount", v)} /></Field>
        <Field label="수수료(원)"><MoneyInput className={inputCls} value={form.feeAmount} onChange={(v) => s("feeAmount", v)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="지급일"><DateInput className="w-full" value={form.paidAt ?? ""} onChange={(v) => s("paidAt", v || null)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const canEdit = useCanWrite('settlements');
  const { settlements } = useStore();
  const [filterProjectNumber,    setFilterProjectNumber]    = useState("");
  const [filterProjectName,      setFilterProjectName]      = useState("");
  const [filterInstitutionName,  setFilterInstitutionName]  = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [leadFilter, setLeadFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      settlements.filter(
        (s) =>
          (statusFilter === "ALL" || s.status === statusFilter) &&
          (leadFilter === "ALL" || (leadFilter === "LEAD" ? s.isLead : !s.isLead)) &&
          (filterProjectNumber   === "" || s.projectNumber.includes(filterProjectNumber)) &&
          (filterProjectName     === "" || s.projectName.includes(filterProjectName)) &&
          (filterInstitutionName === "" || s.institutionName.includes(filterInstitutionName))
      ),
    [settlements, filterProjectNumber, filterProjectName, filterInstitutionName, statusFilter, leadFilter]
  );

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
        {canEdit && (
          <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            새 정산 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "지급 완료", value: fmtWon(paidTotal), color: "text-green-600" },
          { label: "지급완료 건수", value: `${settlements.filter((s) => s.status === "PAID").length}건`, color: "text-green-600" },
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
            { label: "과제번호", value: filterProjectNumber,   onChange: setFilterProjectNumber   },
            { label: "과제명",   value: filterProjectName,     onChange: setFilterProjectName     },
            { label: "기관명",   value: filterInstitutionName, onChange: setFilterInstitutionName },
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
          <select value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 기관</option>
            <option value="LEAD">주관기관</option>
            <option value="PARTICIPANT">참여기관</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
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
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">추가금</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">지급일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
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
                    <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                      {s.additionalAmount > 0 ? <span className="text-green-600">+{fmtWon(s.additionalAmount)}</span> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">
                      {s.feeAmount > 0 ? <span className="text-red-500">-{fmtWon(s.feeAmount)}</span> : <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(s.paidAt)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={STATUS_MAP[s.status]?.label ?? "-"} color={STATUS_MAP[s.status]?.color ?? "slate"} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canEdit && (
                        <button onClick={() => setModal({ mode: "edit", target: s })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
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
