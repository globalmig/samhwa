"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useStore, addProject, updateProject, deleteProject } from "@/lib/store";
import { type Project } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

const STATUS_MAP: Record<Project["status"], { label: string; color: "green" | "slate" | "amber" }> = {
  ACTIVE: { label: "진행중", color: "green" },
  COMPLETED: { label: "완료", color: "slate" },
  SUSPENDED: { label: "중단", color: "amber" },
};

type ModalState = { mode: "add" } | { mode: "edit"; target: Project };

const EMPTY: Omit<Project, "id"> = {
  projectNumber: "",
  projectName: "",
  agency: "",
  leadInstitutionId: "",
  leadInstitutionName: "",
  totalBudget: 0,
  startDate: "",
  endDate: "",
  totalTerms: 1,
  currentTerm: 1,
  status: "ACTIVE",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

function ProjectForm({
  initial,
  onSubmit,
  onClose,
}: {
  initial: Omit<Project, "id">;
  onSubmit: (data: Omit<Project, "id">) => void;
  onClose: () => void;
}) {
  const { institutions } = useStore();
  const [form, setForm] = useState(initial);
  const set = (field: keyof typeof form, value: unknown) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  function handleLeadChange(institutionId: string) {
    const inst = institutions.find((i) => i.id === institutionId);
    set("leadInstitutionId", institutionId);
    set("leadInstitutionName", inst?.name ?? "");
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="과제번호">
          <input className={inputCls} value={form.projectNumber} onChange={(e) => set("projectNumber", e.target.value)} placeholder="RS-2024-00000000" />
        </Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => set("status", e.target.value as Project["status"])}>
            <option value="ACTIVE">진행중</option>
            <option value="COMPLETED">완료</option>
            <option value="SUSPENDED">중단</option>
          </select>
        </Field>
      </div>
      <Field label="과제명">
        <input className={inputCls} value={form.projectName} onChange={(e) => set("projectName", e.target.value)} placeholder="과제명을 입력하세요" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="전문기관">
          <input className={inputCls} value={form.agency} onChange={(e) => set("agency", e.target.value)} placeholder="산업기술평가관리원" />
        </Field>
        <Field label="주관기관">
          <select className={selectCls} value={form.leadInstitutionId} onChange={(e) => handleLeadChange(e.target.value)}>
            <option value="">선택하세요</option>
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="총사업비 (원)">
          <input className={inputCls} type="number" value={form.totalBudget} onChange={(e) => set("totalBudget", Number(e.target.value))} />
        </Field>
        <Field label="총연차">
          <input className={inputCls} type="number" min={1} value={form.totalTerms} onChange={(e) => set("totalTerms", Number(e.target.value))} />
        </Field>
        <Field label="현재연차">
          <input className={inputCls} type="number" min={1} value={form.currentTerm} onChange={(e) => set("currentTerm", Number(e.target.value))} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="시작일">
          <input className={inputCls} type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
        </Field>
        <Field label="종료일">
          <input className={inputCls} type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">
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

export default function ProjectsPage() {
  const { projects, projectMembers } = useStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [agencyFilter, setAgencyFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const agencies = useMemo(() => [...new Set(projects.map((p) => p.agency))], [projects]);

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (statusFilter === "ALL" || p.status === statusFilter) &&
          (agencyFilter === "ALL" || p.agency === agencyFilter) &&
          (search === "" ||
            p.projectName.includes(search) ||
            p.projectNumber.includes(search) ||
            p.agency.includes(search) ||
            p.leadInstitutionName.includes(search))
      ),
    [projects, search, statusFilter, agencyFilter]
  );

  const totalBudget = filtered.reduce((s, p) => s + p.totalBudget, 0);

  function handleSubmit(data: Omit<Project, "id">) {
    if (modal?.mode === "add") {
      addProject(data);
    } else if (modal?.mode === "edit") {
      updateProject(modal.target.id, data);
    }
    setModal(null);
  }

  function handleDelete(id: string, name: string) {
    if (confirm(`"${name}" 과제를 삭제하시겠습니까?`)) {
      deleteProject(id);
    }
  }

  function memberCount(projectId: string) {
    return projectMembers.filter((m) => m.projectId === projectId).length;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전체 {projects.length}건 과제 등록</p>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" />
          </svg>
          새 과제 추가
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 과제", value: `${projects.length}건`, color: "text-slate-800" },
          { label: "진행중", value: `${projects.filter((p) => p.status === "ACTIVE").length}건`, color: "text-blue-600" },
          { label: "완료", value: `${projects.filter((p) => p.status === "COMPLETED").length}건`, color: "text-slate-500" },
          { label: "조회 사업비 합계", value: fmtWon(totalBudget), color: "text-slate-800" },
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
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="과제번호, 과제명, 전문기관, 주관기관 검색..."
          className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400"
        />
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white"
          >
            <option value="ALL">전체 상태</option>
            <option value="ACTIVE">진행중</option>
            <option value="COMPLETED">완료</option>
            <option value="SUSPENDED">중단</option>
          </select>
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white"
          >
            <option value="ALL">전체 전문기관</option>
            {agencies.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제명</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">주관기관</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">전문기관</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">총사업비</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">기간</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">참여기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{p.projectNumber}</td>
                    <td className="px-4 py-3">
                      <Link href={`/projects/${p.id}`} className="font-medium text-slate-800 hover:text-blue-600 transition-colors max-w-xs truncate block">
                        {p.projectName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-blue-700 font-medium whitespace-nowrap">{p.leadInstitutionName}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">{p.agency}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">{fmtWon(p.totalBudget)}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{p.currentTerm}/{p.totalTerms}연차</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(p.startDate)} ~ {fmtDate(p.endDate)}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{memberCount(p.id)}개</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={STATUS_MAP[p.status].label} color={STATUS_MAP[p.status].color} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setModal({ mode: "edit", target: p })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                          <FiEdit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(p.id, p.projectName)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="삭제">
                          <FiTrash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}건 표시 (전체 {projects.length}건)
        </div>
      </div>

      {modal && (
        <Modal
          title={modal.mode === "add" ? "새 과제 추가" : "과제 수정"}
          onClose={() => setModal(null)}
          size="lg"
        >
          <ProjectForm
            initial={modal.mode === "edit" ? modal.target : EMPTY}
            onSubmit={handleSubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
