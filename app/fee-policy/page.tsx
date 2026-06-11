"use client";

import { useState } from "react";
import { FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import { useStore, addFeePolicy, updateFeePolicy } from "@/lib/store";
import { type FeePolicy } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

const STATUS_MAP: Record<FeePolicy["status"], { label: string; color: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "적용중", color: "green" },
  EXPIRED: { label: "만료", color: "slate" },
  DRAFT: { label: "초안", color: "amber" },
};

const inputCls =
  "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

type RateRow = { typeName: string; rate: number };

function toRateRows(rates: Record<string, number>): RateRow[] {
  return Object.entries(rates).map(([typeName, rate]) => ({ typeName, rate }));
}

function fromRateRows(rows: RateRow[]): Record<string, number> {
  return Object.fromEntries(rows.filter((r) => r.typeName.trim()).map((r) => [r.typeName.trim(), r.rate]));
}

type FormData = Omit<FeePolicy, "id" | "rates"> & { rateRows: RateRow[] };

type ModalState = { mode: "add" } | { mode: "edit"; target: FeePolicy };

function PolicyForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial: FormData;
  onSubmit: (d: FormData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<FormData>(initial);

  function setField<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function addRow() {
    setForm((p) => ({ ...p, rateRows: [...p.rateRows, { typeName: "", rate: 2.0 }] }));
  }

  function removeRow(i: number) {
    setForm((p) => ({ ...p, rateRows: p.rateRows.filter((_, idx) => idx !== i) }));
  }

  function setRow(i: number, k: keyof RateRow, v: string | number) {
    setForm((p) => ({
      ...p,
      rateRows: p.rateRows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)),
    }));
  }

  return (
    <div className="p-6 space-y-5">
      {/* 기본 정보 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">정책명</label>
          <input className={inputCls} value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="2025년 상반기 정책" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">버전</label>
          <input className={inputCls} value={form.version} onChange={(e) => setField("version", e.target.value)} placeholder="v2025.1" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">설명</label>
        <input className={inputCls} value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="정책 변경 사유 및 주요 내용" />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">적용 시작일</label>
          <input className={inputCls} type="date" value={form.effectiveFrom} onChange={(e) => setField("effectiveFrom", e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">적용 종료일</label>
          <input className={inputCls} type="date" value={form.effectiveTo ?? ""} onChange={(e) => setField("effectiveTo", e.target.value || null)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">상태</label>
          <select className={inputCls} value={form.status} onChange={(e) => setField("status", e.target.value as FeePolicy["status"])}>
            <option value="DRAFT">초안</option>
            <option value="ACTIVE">적용중</option>
            <option value="EXPIRED">만료</option>
          </select>
        </div>
      </div>

      {/* 유형별 수수료 기준 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-slate-700">유형별 수수료 기준</label>
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <FiPlus size={12} />
            행 추가
          </button>
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">기관 유형</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-slate-500">요율 (%)</th>
                <th className="w-8 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {form.rateRows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-400">
                    행 추가 버튼으로 유형을 등록하세요
                  </td>
                </tr>
              )}
              {form.rateRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <input
                      className="w-full text-sm border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      value={row.typeName}
                      onChange={(e) => setRow(i, "typeName", e.target.value)}
                      placeholder="예: 중소기업"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      className="w-24 text-sm border border-slate-200 rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      type="number"
                      step={0.1}
                      min={0}
                      max={100}
                      value={row.rate}
                      onChange={(e) => setRow(i, "rate", Number(e.target.value))}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          취소
        </button>
        <button
          onClick={() => onSubmit(form)}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  );
}

const EMPTY_FORM: FormData = {
  name: "",
  version: "",
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: null,
  status: "DRAFT",
  description: "",
  createdAt: new Date().toISOString().slice(0, 10),
  createdBy: "김관리",
  rateRows: [],
};

export default function FeePolicyPage() {
  const { feePolicies } = useStore();
  const [modal, setModal] = useState<ModalState | null>(null);

  const activePolicy = feePolicies.find((p) => p.status === "ACTIVE");
  const allTypeKeys = activePolicy ? Object.keys(activePolicy.rates) : [];

  function handleSubmit(data: FormData) {
    const { rateRows, ...rest } = data;
    const rates = fromRateRows(rateRows);
    if (modal?.mode === "add") {
      addFeePolicy({ ...rest, rates });
    } else if (modal?.mode === "edit") {
      updateFeePolicy(modal.target.id, { ...rest, rates });
    }
    setModal(null);
  }

  function openEdit(policy: FeePolicy) {
    setModal({ mode: "edit", target: policy });
  }

  function getInitialForm(policy?: FeePolicy): FormData {
    if (!policy) return EMPTY_FORM;
    const { id, rates, ...rest } = policy;
    void id;
    return { ...rest, rateRows: toRateRows(rates) };
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">총 {feePolicies.length}개 버전 관리</p>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FiPlus size={12} />
          새 정책 만들기
        </button>
      </div>

      {/* 현재 적용 정책 */}
      {activePolicy && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">현재 적용</span>
                <span className="text-sm font-semibold text-blue-900">{activePolicy.name}</span>
                <span className="text-xs text-blue-600 font-mono">{activePolicy.version}</span>
              </div>
              <p className="text-xs text-blue-700 mt-1">{activePolicy.description}</p>
              <p className="text-xs text-blue-500 mt-1">
                적용 기간: {fmtDate(activePolicy.effectiveFrom)} ~ 현재 · 등록자: {activePolicy.createdBy}
              </p>
            </div>
            <button
              onClick={() => openEdit(activePolicy)}
              className="p-1.5 text-blue-400 hover:text-blue-700 hover:bg-blue-100 rounded transition-colors"
              title="수정"
            >
              <FiEdit2 size={14} />
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.entries(activePolicy.rates).map(([key, val]) => (
              <div key={key} className="bg-white rounded-lg px-3 py-2 border border-blue-200">
                <p className="text-xs text-blue-600">{key}</p>
                <p className="text-lg font-bold text-blue-800">{val}%</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 전체 정책 이력 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">정책 버전 목록</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">버전</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">정책명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">적용 기간</th>
                {allTypeKeys.map((k) => (
                  <th key={k} className="text-center px-3 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {k}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {feePolicies.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-center font-mono text-xs text-slate-600">{p.version}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
                    {fmtDate(p.effectiveFrom)} ~ {p.effectiveTo ? fmtDate(p.effectiveTo) : "현재"}
                  </td>
                  {allTypeKeys.map((k) => (
                    <td key={k} className="px-3 py-3 text-center text-sm">
                      {p.rates[k] !== undefined ? (
                        <span className={`font-medium ${p.status === "ACTIVE" ? "text-blue-700" : "text-slate-500"}`}>
                          {p.rates[k]}%
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={STATUS_MAP[p.status].label} color={STATUS_MAP[p.status].color} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="수정"
                    >
                      <FiEdit2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal
          title={modal.mode === "add" ? "새 정책 만들기" : "정책 수정"}
          onClose={() => setModal(null)}
          size="lg"
        >
          <PolicyForm
            initial={getInitialForm(modal.mode === "edit" ? modal.target : undefined)}
            onSubmit={handleSubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
