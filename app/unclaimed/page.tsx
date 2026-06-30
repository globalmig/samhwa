"use client";

import { useState, useMemo } from "react";
import { FiEdit2, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { useStore, addUnclaimedFee, updateUnclaimedFee } from "@/lib/store";
import { type UnclaimedFee } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import { useCanWrite } from "@/lib/permissions";

const STATUS_MAP: Record<UnclaimedFee["status"], { label: string; color: "amber" | "blue" | "green" }> = {
  PENDING: { label: "대기중", color: "amber" },
  CARRIED_OVER: { label: "이월됨", color: "blue" },
  RESOLVED: { label: "해소됨", color: "green" },
};

const RV_STATUS: Record<string, { label: string; cls: string }> = {
  OVERDUE:  { label: "미수",      cls: "text-red-600 font-medium" },
  PENDING:  { label: "대기중",    cls: "text-amber-600 font-medium" },
  PARTIAL:  { label: "일부입금",  cls: "text-blue-600 font-medium" },
  PAID:     { label: "완료",      cls: "text-green-600 font-medium" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: UnclaimedFee };

const EMPTY: Omit<UnclaimedFee, "id"> = {
  projectNumber: "",
  projectName: "",
  leadInstitutionId: "",
  leadInstitutionName: "",
  termYear: new Date().getFullYear(),
  termNumber: 1,
  amount: 0,
  occurredAt: new Date().toISOString().slice(0, 10),
  carriedOver: false,
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

function UnclaimedForm({ initial, onSubmit, onClose }: { initial: Omit<UnclaimedFee, "id">; onSubmit: (d: Omit<UnclaimedFee, "id">) => void; onClose: () => void }) {
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
        <Field label="미청구액(원)"><input className={inputCls} type="number" min={0} value={form.amount} onChange={(e) => s("amount", Number(e.target.value))} /></Field>
        <Field label="발생일"><input className={inputCls} type="date" value={form.occurredAt} onChange={(e) => s("occurredAt", e.target.value)} /></Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as UnclaimedFee["status"])}>
            <option value="PENDING">대기중</option>
            <option value="CARRIED_OVER">이월됨</option>
            <option value="RESOLVED">해소됨</option>
          </select>
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={form.carriedOver} onChange={(e) => s("carriedOver", e.target.checked)} className="rounded" />
        이월 처리됨
      </label>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

// 인라인 확장 — 연도별 정산 내역
function ExpandedDetail({ projectNumber, colSpan }: { projectNumber: string; colSpan: number }) {
  const { receivables } = useStore();

  const rows = useMemo(() => {
    const sorted = [...receivables]
      .filter((r) => r.projectNumber === projectNumber)
      .sort((a, b) => a.termYear - b.termYear || a.termNumber - b.termNumber);

    let prevReceivable = 0;
    return sorted.map((r) => {
      const carryOver = prevReceivable > 0 ? prevReceivable : null;
      prevReceivable = r.receivableAmount;
      return { ...r, carryOver };
    });
  }, [receivables, projectNumber]);

  const totalBilled     = rows.reduce((s, r) => s + r.billedAmount, 0);
  const totalPaid       = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalReceivable = rows.reduce((s, r) => s + r.receivableAmount, 0);

  return (
    <tr>
      <td colSpan={colSpan} className="px-0 pb-0 bg-slate-50/70">
        <div className="mx-4 mb-4 mt-1 rounded-xl border border-slate-200 bg-white overflow-hidden">
          {/* 헤더 */}
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
            <p className="text-xs font-semibold text-slate-700">연도별 정산 내역</p>
          </div>

          {rows.length === 0 ? (
            <p className="px-5 py-6 text-xs text-slate-400 text-center">연결된 청구 내역이 없습니다</p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-medium">
                    <th className="text-center px-4 py-2.5 whitespace-nowrap">연도</th>
                    <th className="text-center px-4 py-2.5 whitespace-nowrap">연차</th>
                    <th className="text-right px-4 py-2.5 whitespace-nowrap">청구금액</th>
                    <th className="text-right px-4 py-2.5 whitespace-nowrap">입금금액</th>
                    <th className="text-right px-4 py-2.5 whitespace-nowrap">미수금</th>
                    <th className="text-right px-4 py-2.5 whitespace-nowrap">이월금</th>
                    <th className="text-center px-4 py-2.5 whitespace-nowrap">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const st = RV_STATUS[r.status] ?? RV_STATUS["PENDING"];
                    return (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                        <td className="text-center px-4 py-2.5 text-slate-600">{r.termYear}</td>
                        <td className="text-center px-4 py-2.5 text-blue-600 font-medium">{r.termNumber}차</td>
                        <td className="text-right px-4 py-2.5 text-slate-700">{fmtWon(r.billedAmount)}</td>
                        <td className="text-right px-4 py-2.5 text-green-700">{fmtWon(r.paidAmount)}</td>
                        <td className="text-right px-4 py-2.5">
                          <span className={r.receivableAmount > 0 ? "text-red-600 font-medium" : "text-slate-400"}>
                            {fmtWon(r.receivableAmount)}
                          </span>
                        </td>
                        <td className="text-right px-4 py-2.5 text-slate-500">
                          {r.carryOver != null ? fmtWon(r.carryOver) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className={`text-center px-4 py-2.5 ${st.cls}`}>{st.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* 요약 박스 */}
              <div className="mx-4 my-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center gap-8 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">총 청구금액</span>
                  <span className="mx-2 text-slate-300">:</span>
                  <span className="font-semibold text-slate-800">{fmtWon(totalBilled)}</span>
                </div>
                <div>
                  <span className="text-slate-400">총 입금금액</span>
                  <span className="mx-2 text-slate-300">:</span>
                  <span className="font-semibold text-green-700">{fmtWon(totalPaid)}</span>
                </div>
                <div>
                  <span className="text-slate-400">현재 누적 미수금</span>
                  <span className="mx-2 text-slate-300">:</span>
                  <span className={`font-semibold ${totalReceivable > 0 ? "text-red-600" : "text-slate-500"}`}>
                    {fmtWon(totalReceivable)}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

const PROJECT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE:    { label: "진행중",  cls: "text-blue-600" },
  COMPLETED: { label: "완료",   cls: "text-slate-400" },
  SUSPENDED: { label: "중단",   cls: "text-red-500" },
};

export default function UnclaimedPage() {
  const canEdit = useCanWrite('unclaimed');
  const { unclaimedFees, projects } = useStore();
  const [filterProjectNumber,   setFilterProjectNumber]   = useState("");
  const [filterProjectName,     setFilterProjectName]     = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      unclaimedFees.filter(
        (f) =>
          (statusFilter === "ALL" || f.status === statusFilter) &&
          (filterProjectNumber   === "" || f.projectNumber.includes(filterProjectNumber)) &&
          (filterProjectName     === "" || f.projectName.includes(filterProjectName)) &&
          (filterLeadInstitution === "" || f.leadInstitutionName.includes(filterLeadInstitution))
      ),
    [unclaimedFees, filterProjectNumber, filterProjectName, filterLeadInstitution, statusFilter]
  );

  const pending = unclaimedFees.filter((f) => f.status === "PENDING");
  const pendingAmount = pending.reduce((s, f) => s + f.amount, 0);
  const carriedOver = unclaimedFees.filter((f) => f.status === "CARRIED_OVER");
  const totalAmount = unclaimedFees.filter((f) => f.status !== "RESOLVED").reduce((s, f) => s + f.amount, 0);

  function handleSubmit(data: Omit<UnclaimedFee, "id">) {
    if (modal?.mode === "add") addUnclaimedFee(data);
    else if (modal?.mode === "edit") updateUnclaimedFee(modal.target.id, data);
    setModal(null);
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  const COL_COUNT = 9;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">미청구액 관리 · 주관기관 기준 · 전체 {unclaimedFees.length}건</p>
        {canEdit && (
          <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            새 항목 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "누적 미청구액", value: fmtWon(totalAmount), color: "text-amber-600" },
          { label: "대기중", value: `${pending.length}건 · ${fmtWon(pendingAmount)}`, color: "text-amber-600" },
          { label: "이월됨", value: `${carriedOver.length}건`, color: "text-blue-600" },
          { label: "해소됨", value: `${unclaimedFees.filter((f) => f.status === "RESOLVED").length}건`, color: "text-green-600" },
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
            { label: "주관기관", value: filterLeadInstitution, onChange: setFilterLeadInstitution },
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
            <option value="PENDING">대기중</option>
            <option value="CARRIED_OVER">이월됨</option>
            <option value="RESOLVED">해소됨</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="w-8 px-2 py-3" />
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제명</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발생 연차 / 현재</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">미청구액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발생일</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={COL_COUNT} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.flatMap((f) => {
                  const isExpanded = expandedId === f.id;
                  return [
                    <tr
                      key={f.id}
                      className={`border-b border-slate-50 transition-colors ${isExpanded ? "bg-blue-50/40" : "hover:bg-slate-50"}`}
                    >
                      {/* 펼치기 토글 */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => toggleExpand(f.id)}
                          className={`p-1 rounded transition-colors ${isExpanded ? "text-blue-600 bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                          title={isExpanded ? "접기" : "자세히 보기"}
                        >
                          {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{f.projectNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 max-w-xs truncate text-xs">{f.projectName}</td>
                      <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{f.leadInstitutionName}</td>
                      <td className="px-4 py-3 text-center">
                        {(() => {
                          const proj = projects.find((p) => p.projectNumber === f.projectNumber);
                          const ps = proj ? PROJECT_STATUS[proj.status] : null;
                          return (
                            <div className="space-y-0.5">
                              <p className="text-xs text-slate-400">{f.termYear}년 {f.termNumber}연차 발생</p>
                              {proj && ps ? (
                                <p className={`text-xs font-semibold ${ps.cls}`}>
                                  현재 {proj.currentTerm}연차 · {ps.label}
                                </p>
                              ) : (
                                <p className="text-xs text-slate-300">과제 정보 없음</p>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600 whitespace-nowrap">{fmtWon(f.amount)}</td>
                      <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(f.occurredAt)}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge label={STATUS_MAP[f.status].label} color={STATUS_MAP[f.status].color} /></td>
                      <td className="px-4 py-3 text-center">
                        {canEdit && (
                          <button onClick={() => setModal({ mode: "edit", target: f })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                            <FiEdit2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>,
                    isExpanded && (
                      <ExpandedDetail key={`${f.id}-detail`} projectNumber={f.projectNumber} colSpan={COL_COUNT} />
                    ),
                  ].filter(Boolean);
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}건 표시 (전체 {unclaimedFees.length}건)</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 미청구액 추가" : "미청구액 수정"} onClose={() => setModal(null)} size="lg">
          <UnclaimedForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
