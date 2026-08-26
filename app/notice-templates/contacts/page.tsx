"use client";

import { useState } from "react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useStore, addManagerContact, updateManagerContact, deleteManagerContact } from "@/lib/store";
import { type ManagerContact } from "@/lib/mock";
import Modal from "@/components/common/Modal";
import { useCanWrite } from "@/lib/permissions";

type ModalState = { mode: "add" } | { mode: "edit"; target: ManagerContact };

const EMPTY: Omit<ManagerContact, "id"> = { name: "", phone: "", email: "" };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ContactForm({ initial, existing, excludeId, onSubmit, onClose }: {
  initial: Omit<ManagerContact, "id">;
  existing: ManagerContact[];
  excludeId?: string;
  onSubmit: (d: Omit<ManagerContact, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const nameTrimmed = form.name.trim();
  const duplicates = nameTrimmed ? existing.filter((c) => c.id !== excludeId && c.name.trim() === nameTrimmed) : [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <Field label="이름">
          <input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="김철진" />
        </Field>
        {duplicates.length > 0 && (
          <p className="mt-1 text-[11px] text-amber-600 leading-snug">
            ⚠ 동명이인 — 이미 등록된 &quot;{nameTrimmed}&quot;님({duplicates.map((c) => c.phone).join(", ")})과 이름이 같습니다.
            공문 발송 시 과제담당자(정/부) 이름으로 이 목록을 찾기 때문에, 동명이인이 있으면 어느 쪽 연락처가 쓰일지 알 수 없습니다.
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="연락처"><input className={inputCls} value={form.phone} onChange={(e) => s("phone", e.target.value)} placeholder="070-0000-0000" /></Field>
        <Field label="이메일"><input className={inputCls} type="email" value={form.email} onChange={(e) => s("email", e.target.value)} placeholder="user@shcpa.co.kr" /></Field>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function ManagerContactsPage() {
  const canEdit = useCanWrite("notice-templates");
  const { managerContacts } = useStore();
  const [modal, setModal] = useState<ModalState | null>(null);

  function handleSubmit(data: Omit<ManagerContact, "id">) {
    if (modal?.mode === "add") addManagerContact(data);
    else if (modal?.mode === "edit") updateManagerContact(modal.target.id, data);
    setModal(null);
  }

  function handleDelete(id: string, name: string) {
    if (confirm(`"${name}" 담당자 연락처를 삭제하시겠습니까?`)) {
      deleteManagerContact(id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-800">과제담당자 연락처</p>
          <p className="text-xs text-slate-500 mt-0.5">
            여기 등록해두면 정산절차 안내 공문의 &quot;문의사항 연락처&quot; 표에서 과제담당자(정/부) 이름으로 자동으로 연락처·이메일을 찾아 채웁니다.
            이름이 여기 없으면 공문 템플릿에 등록된 기본값이 그대로 쓰입니다.
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setModal({ mode: "add" })}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            담당자 추가
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">이름</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">연락처</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">이메일</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap w-24">관리</th>
            </tr>
          </thead>
          <tbody>
            {managerContacts.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">등록된 담당자 연락처가 없습니다</td></tr>
            ) : (
              managerContacts.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">{c.name}</td>
                  <td className="px-5 py-3 text-slate-600">{c.phone || "—"}</td>
                  <td className="px-5 py-3 text-slate-600">{c.email || "—"}</td>
                  <td className="px-5 py-3 text-center">
                    {canEdit ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setModal({ mode: "edit", target: c })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                          <FiEdit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="삭제">
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    ) : <span className="text-xs text-slate-300">—</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {managerContacts.length}명 등록됨</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "담당자 연락처 추가" : "담당자 연락처 수정"} onClose={() => setModal(null)}>
          <ContactForm
            initial={modal.mode === "edit" ? modal.target : EMPTY}
            existing={managerContacts}
            excludeId={modal.mode === "edit" ? modal.target.id : undefined}
            onSubmit={handleSubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
