"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useStore, addUser, updateUser, deleteUser } from "@/lib/store";
import { type SystemUser } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import { useCanWrite } from "@/lib/permissions";

const ROLE_MAP: Record<SystemUser["role"], { label: string; color: "red" | "blue" | "purple" | "slate"; desc: string }> = {
  ADMIN: { label: "시스템 관리자", color: "red", desc: "전체 권한" },
  ACCOUNTANT: { label: "회계 담당자", color: "blue", desc: "수수료·세금계산서" },
  SETTLEMENT: { label: "정산 담당자", color: "purple", desc: "정산·채권" },
  VIEWER: { label: "조회 전용", color: "slate", desc: "읽기 전용" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: SystemUser };

const EMPTY: Omit<SystemUser, "id"> = {
  name: "",
  email: "",
  role: "VIEWER",
  status: "ACTIVE",
  lastLoginAt: null,
  registeredAt: new Date().toISOString().slice(0, 10),
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

function UserForm({ initial, onSubmit, onClose }: { initial: Omit<SystemUser, "id">; onSubmit: (d: Omit<SystemUser, "id">) => void; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="이름"><input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="홍길동" /></Field>
        <Field label="이메일"><input className={inputCls} type="email" value={form.email} onChange={(e) => s("email", e.target.value)} placeholder="user@samhwa.co.kr" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="역할">
          <select className={selectCls} value={form.role} onChange={(e) => s("role", e.target.value as SystemUser["role"])}>
            <option value="ADMIN">시스템 관리자</option>
            <option value="ACCOUNTANT">회계 담당자</option>
            <option value="SETTLEMENT">정산 담당자</option>
            <option value="VIEWER">조회 전용</option>
          </select>
        </Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as SystemUser["status"])}>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </Field>
      </div>
      <Field label="등록일"><input className={inputCls} type="date" value={form.registeredAt} onChange={(e) => s("registeredAt", e.target.value)} /></Field>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const canEdit = useCanWrite('users');
  const { users } = useStore();
  const [filterName, setFilterName]   = useState("");
  const [filterEmail, setFilterEmail] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      users.filter(
        (u) =>
          (roleFilter === "ALL" || u.role === roleFilter) &&
          (statusFilter === "ALL" || u.status === statusFilter) &&
          (filterName  === "" || u.name.includes(filterName)) &&
          (filterEmail === "" || u.email.includes(filterEmail))
      ),
    [users, filterName, filterEmail, roleFilter, statusFilter]
  );

  function handleSubmit(data: Omit<SystemUser, "id">) {
    if (modal?.mode === "add") addUser(data);
    else if (modal?.mode === "edit") updateUser(modal.target.id, data);
    setModal(null);
  }

  function handleDelete(id: string, name: string) {
    if (confirm(`"${name}" 사용자를 삭제하시겠습니까?`)) {
      deleteUser(id);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">사용자 · 권한 관리 · 전체 {users.length}명</p>
        {canEdit && (
          <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
            새 사용자 추가
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 사용자", value: `${users.length}명` },
          { label: "활성", value: `${users.filter((u) => u.status === "ACTIVE").length}명` },
          { label: "관리자", value: `${users.filter((u) => u.role === "ADMIN").length}명` },
          { label: "회계/정산", value: `${users.filter((u) => u.role === "ACCOUNTANT" || u.role === "SETTLEMENT").length}명` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-600 mb-3">역할별 권한 요약</p>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(ROLE_MAP).map(([role, info]) => (
            <div key={role} className="border border-slate-100 rounded-lg p-3">
              <StatusBadge label={info.label} color={info.color} />
              <p className="text-xs text-slate-500 mt-2">{info.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 grid grid-cols-2 gap-3">
          {[
            { label: "이름",   value: filterName,  onChange: setFilterName  },
            { label: "이메일", value: filterEmail, onChange: setFilterEmail },
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
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 역할</option>
            <option value="ADMIN">시스템 관리자</option>
            <option value="ACCOUNTANT">회계 담당자</option>
            <option value="SETTLEMENT">정산 담당자</option>
            <option value="VIEWER">조회 전용</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 상태</option>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">이름</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">이메일</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">역할</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">최근 로그인</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">등록일</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-600 shrink-0">{u.name[0]}</div>
                      <span className="font-medium text-slate-800 group-hover:text-blue-600 group-hover:underline transition-colors">{u.name}</span>
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{u.email}</td>
                  <td className="px-5 py-4 text-center"><StatusBadge label={ROLE_MAP[u.role].label} color={ROLE_MAP[u.role].color} /></td>
                  <td className="px-5 py-4 text-center">
                    <StatusBadge label={u.status === "ACTIVE" ? "활성" : "비활성"} color={u.status === "ACTIVE" ? "green" : "slate"} />
                  </td>
                  <td className="px-5 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{u.lastLoginAt ?? "-"}</td>
                  <td className="px-5 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(u.registeredAt)}</td>
                  <td className="px-5 py-4 text-center">
                    {canEdit ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setModal({ mode: "edit", target: u })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                          <FiEdit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(u.id, u.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="삭제">
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
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">총 {filtered.length}명 표시 (전체 {users.length}명)</div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 사용자 추가" : "사용자 수정"} onClose={() => setModal(null)}>
          <UserForm initial={modal.mode === "edit" ? modal.target : EMPTY} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
