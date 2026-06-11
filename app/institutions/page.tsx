"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useStore, addInstitution, updateInstitution, deleteInstitution } from "@/lib/store";
import { type Institution, type InstitutionType } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

const TYPE_LIST: InstitutionType[] = ["대기업", "중견기업", "중소기업", "스타트업", "대학", "정부출연연구소", "공공기관"];

const TYPE_COLOR: Record<InstitutionType, "blue" | "purple" | "green" | "amber" | "slate" | "red"> = {
  대기업: "red",
  중견기업: "purple",
  중소기업: "blue",
  스타트업: "amber",
  대학: "green",
  정부출연연구소: "slate",
  공공기관: "slate",
};

type ModalState = { mode: "add" } | { mode: "edit"; target: Institution };

const EMPTY: Omit<Institution, "id"> = {
  name: "",
  type: "중소기업",
  bizNumber: "",
  representativeName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  projectCount: 0,
  registeredAt: new Date().toISOString().slice(0, 10),
  status: "ACTIVE",
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

function InstitutionForm({
  initial,
  isEdit = false,
  onSubmit,
  onClose,
}: {
  initial: Omit<Institution, "id">;
  isEdit?: boolean;
  onSubmit: (d: Omit<Institution, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <div className="p-6 space-y-4">
      {isEdit && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0 mt-0.5 text-amber-500">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" clipRule="evenodd" />
          </svg>
          <span>
            기관 유형은 수수료율에 직접 영향을 주므로 이력 관리가 필요합니다.
            유형 변경 및 연차별 이력 확인은 <strong>기관 상세 페이지</strong>에서 진행해주세요.
          </span>
        </div>
      )}

      <div className={isEdit ? "" : "grid grid-cols-2 gap-4"}>
        {isEdit ? (
          <Field label="기관명"><input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="(주)기관명" /></Field>
        ) : (
          <>
            <Field label="기관명"><input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="(주)기관명" /></Field>
            <Field label="유형">
              <select className={selectCls} value={form.type} onChange={(e) => s("type", e.target.value as InstitutionType)}>
                {TYPE_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="사업자등록번호"><input className={inputCls} value={form.bizNumber} onChange={(e) => s("bizNumber", e.target.value)} placeholder="000-00-00000" /></Field>
        <Field label="대표자명"><input className={inputCls} value={form.representativeName} onChange={(e) => s("representativeName", e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="담당자명"><input className={inputCls} value={form.contactName} onChange={(e) => s("contactName", e.target.value)} /></Field>
        <Field label="담당자 연락처"><input className={inputCls} value={form.contactPhone} onChange={(e) => s("contactPhone", e.target.value)} placeholder="02-0000-0000" /></Field>
      </div>
      <Field label="담당자 이메일"><input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => s("contactEmail", e.target.value)} placeholder="contact@institution.kr" /></Field>
      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="등록일"><input className={inputCls} type="date" value={form.registeredAt} onChange={(e) => s("registeredAt", e.target.value)} /></Field>
          <Field label="상태">
            <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Institution["status"])}>
              <option value="ACTIVE">활성</option>
              <option value="INACTIVE">비활성</option>
            </select>
          </Field>
        </div>
      )}
      {isEdit && (
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Institution["status"])}>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

export default function InstitutionsPage() {
  const { institutions } = useStore();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      institutions.filter(
        (i) =>
          (typeFilter === "ALL" || i.type === typeFilter) &&
          (statusFilter === "ALL" || i.status === statusFilter) &&
          (search === "" || i.name.includes(search) || i.bizNumber.includes(search) || i.contactName.includes(search))
      ),
    [institutions, search, typeFilter, statusFilter]
  );

  function handleSubmit(data: Omit<Institution, "id">) {
    if (modal?.mode === "add") addInstitution(data);
    else if (modal?.mode === "edit") updateInstitution(modal.target.id, data);
    setModal(null);
  }

  function handleDelete(id: string, name: string) {
    if (confirm(`"${name}" 기관을 삭제하시겠습니까?`)) deleteInstitution(id);
  }

  const activeCount = institutions.filter((i) => i.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전체 {institutions.length}개 기관 · 활성 {activeCount}개</p>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
          새 기관 추가
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 기관", value: `${institutions.length}개` },
          { label: "기업", value: `${institutions.filter((i) => ["대기업","중견기업","중소기업","스타트업"].includes(i.type)).length}개` },
          { label: "대학/연구소", value: `${institutions.filter((i) => ["대학","정부출연연구소","공공기관"].includes(i.type)).length}개` },
          { label: "활성", value: `${activeCount}개` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9z" clipRule="evenodd" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="기관명, 사업자번호, 담당자 검색..." className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400" />
        <div className="flex items-center gap-2 shrink-0">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 유형</option>
            {TYPE_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
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
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">기관명</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">유형</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">사업자번호</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">담당자</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">이메일</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제 수</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">등록일</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
            ) : (
              filtered.map((inst) => (
                <tr key={inst.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/institutions/${inst.id}`} className="font-semibold text-blue-600 hover:underline">
                      {inst.name}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">{inst.representativeName} 대표</p>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge label={inst.type} color={TYPE_COLOR[inst.type]} />
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500 font-mono whitespace-nowrap">{inst.bizNumber}</td>
                  <td className="px-4 py-4 text-sm text-slate-700 whitespace-nowrap">{inst.contactName}</td>
                  <td className="px-4 py-4 text-xs text-slate-500 whitespace-nowrap">{inst.contactEmail}</td>
                  <td className="px-4 py-4 text-center text-sm font-medium text-slate-700">{inst.projectCount}건</td>
                  <td className="px-4 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(inst.registeredAt)}</td>
                  <td className="px-4 py-4 text-center">
                    <StatusBadge label={inst.status === "ACTIVE" ? "활성" : "비활성"} color={inst.status === "ACTIVE" ? "green" : "slate"} />
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="flex items-center justify-center gap-0.5">
                      <button onClick={() => setModal({ mode: "edit", target: inst })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                        <FiEdit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(inst.id, inst.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="삭제">
                        <FiTrash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}개 표시 (전체 {institutions.length}개)
        </div>
      </div>

      {modal && (
        <Modal title={modal.mode === "add" ? "새 기관 추가" : "기관 정보 수정"} onClose={() => setModal(null)} size="lg">
          <InstitutionForm initial={modal.mode === "edit" ? modal.target : EMPTY} isEdit={modal.mode === "edit"} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
