"use client";

import { useState } from "react";
import { FiEdit2 } from "react-icons/fi";
import { useStore, addCompanyClass, updateCompanyClass } from "@/lib/store";
import { type CompanyClass } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import Modal from "@/components/common/Modal";

type ModalState = { mode: "add" } | { mode: "edit"; target: CompanyClass };

const EMPTY: Omit<CompanyClass, "id"> = {
  name: "",
  feeRate: 2.0,
  criteria: "",
  projectCount: 0,
  updatedAt: new Date().toISOString().slice(0, 10),
};

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ClassForm({ initial, onSubmit, onClose }: { initial: Omit<CompanyClass, "id">; onSubmit: (d: Omit<CompanyClass, "id">) => void; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="분류명"><input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="중소기업" /></Field>
        <Field label="수수료율 (%)"><input className={inputCls} type="number" step={0.1} min={0} value={form.feeRate} onChange={(e) => s("feeRate", Number(e.target.value))} /></Field>
      </div>
      <Field label="적용 기준"><input className={inputCls} value={form.criteria} onChange={(e) => s("criteria", e.target.value)} placeholder="기준 설명" /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="과제 수"><input className={inputCls} type="number" min={0} value={form.projectCount} onChange={(e) => s("projectCount", Number(e.target.value))} /></Field>
        <Field label="최종수정일"><input className={inputCls} type="date" value={form.updatedAt} onChange={(e) => s("updatedAt", e.target.value)} /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function CompanyClassPage() {
  const { companyClasses } = useStore();
  const [modal, setModal] = useState<ModalState | null>(null);

  const minRate = Math.min(...companyClasses.map((c) => c.feeRate));
  const maxRate = Math.max(...companyClasses.map((c) => c.feeRate));
  const totalProjects = companyClasses.reduce((s, c) => s + c.projectCount, 0);

  function handleSubmit(data: Omit<CompanyClass, "id">) {
    if (modal?.mode === "add") addCompanyClass(data);
    else if (modal?.mode === "edit") updateCompanyClass(modal.target.id, data);
    setModal(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{companyClasses.length}개 분류 체계 운영 중</p>
        <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
          새 분류 추가
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "분류 수", value: `${companyClasses.length}개` },
          { label: "최저 요율", value: `${minRate}%` },
          { label: "최고 요율", value: `${maxRate}%` },
          { label: "관리 과제 총합", value: `${totalProjects}건` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">기업분류 목록</h2>
          <p className="text-xs text-slate-400 mt-0.5">수수료 계산에 적용되는 기업 분류 및 요율 정보</p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">분류명</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500">수수료율</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">적용 기준</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제 수</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">최종 수정일</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody>
            {companyClasses.map((cls) => (
              <tr key={cls.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td className="px-5 py-4"><p className="font-semibold text-slate-800">{cls.name}</p></td>
                <td className="px-5 py-4 text-center">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-50 text-blue-700">{cls.feeRate}%</span>
                </td>
                <td className="px-5 py-4 text-sm text-slate-600">{cls.criteria}</td>
                <td className="px-5 py-4 text-center text-sm text-slate-700 font-medium">{cls.projectCount}건</td>
                <td className="px-5 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(cls.updatedAt)}</td>
                <td className="px-5 py-4 text-center">
                  <button onClick={() => setModal({ mode: "edit", target: cls })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                    <FiEdit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-4 bg-blue-50 border-t border-blue-100">
          <p className="text-xs text-blue-700 font-medium">적용 정책: v2024.2 (2024.07.01 시행)</p>
          <p className="text-xs text-blue-600 mt-0.5">수수료율은 현재 활성 정책 기준이며, 과거 과제는 당시 정책이 적용됩니다.</p>
        </div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 분류 추가" : "분류 수정"} onClose={() => setModal(null)}>
          <ClassForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
