"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { useStore, addInstitution, updateInstitution, deleteInstitution } from "@/lib/store";
import { type Institution } from "@/lib/mock";
import { fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import { useCanWrite } from "@/lib/permissions";
import ExcelUploadModal, { downloadExcelTemplate } from "@/components/common/ExcelUploadModal";

type ModalState = { mode: "add" } | { mode: "edit"; target: Institution };
type ClassificationSummary = {
  key: string;
  agencyName: string;
  agencyShortName: string;
  category1: string;
  category2: string;
  projectCount: number;
};

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

function normalizeClassification(raw?: string | null): Pick<ClassificationSummary, "category1" | "category2"> {
  const value = raw ?? "일반";
  if (value.includes("자율")) return { category1: "자율성트랙", category2: "자율성트랙" };
  if (value.includes("최우수") || value.includes("(S)") || value === "S") return { category1: "S", category2: "최우수" };
  if (value.includes("우수") || /[ABC]/.test(value)) return { category1: "A~C", category2: "우수" };
  return { category1: "일반", category2: "일반" };
}

function ClassificationChips({ items }: { items: ClassificationSummary[] }) {
  if (items.length === 0) return <span className="text-xs text-slate-300">참여 과제 없음</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.slice(0, 3).map((item) => (
        <span key={item.key} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
          <span className="font-semibold text-slate-800">{item.agencyShortName}</span>
          <span>{item.category1}</span>
          <span className="text-slate-300">/</span>
          <span>{item.category2}</span>
          <span className="text-slate-400">({item.projectCount})</span>
        </span>
      ))}
      {items.length > 3 && <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs text-slate-400">+{items.length - 3}</span>}
    </div>
  );
}

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
      <Field label="기관명"><input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="(주)기관명" /></Field>
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
  const canEdit = useCanWrite('institutions');
  const { institutions, projectMembers, projects, fundingAgencies } = useStore();
  const [filterName, setFilterName]               = useState("");
  const [filterBizNumber, setFilterBizNumber]     = useState("");
  const [filterContactName, setFilterContactName] = useState("");
  const [classFilter, setClassFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [modal, setModal] = useState<ModalState | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const classificationByInstitution = useMemo(() => {
    const projectsById = new Map(projects.map((project) => [project.id, project]));
    const agenciesById = new Map(fundingAgencies.map((agency) => [agency.id, agency]));
    const map = new Map<string, ClassificationSummary[]>();

    for (const member of projectMembers) {
      const project = projectsById.get(member.projectId);
      const agency = project ? agenciesById.get(project.agencyId) : undefined;
      const classification = normalizeClassification(member.institutionGrade);
      const agencyShortName = agency?.shortName ?? project?.agency ?? "미지정";
      const agencyName = agency?.name ?? project?.agency ?? "미지정 전담기관";
      const key = `${project?.agencyId ?? "none"}:${classification.category1}:${classification.category2}`;
      const current = map.get(member.institutionId) ?? [];
      const existing = current.find((item) => item.key === key);

      if (existing) existing.projectCount += 1;
      else {
        current.push({
          key,
          agencyName,
          agencyShortName,
          category1: classification.category1,
          category2: classification.category2,
          projectCount: 1,
        });
        map.set(member.institutionId, current);
      }
    }

    for (const items of map.values()) {
      items.sort((a, b) => a.agencyShortName.localeCompare(b.agencyShortName) || a.category1.localeCompare(b.category1));
    }

    return map;
  }, [fundingAgencies, projectMembers, projects]);

  const classificationOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const items of classificationByInstitution.values()) {
      for (const item of items) {
        options.set(item.key, `${item.agencyShortName} · ${item.category1}/${item.category2}`);
      }
    }
    return [...options.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [classificationByInstitution]);

  const filtered = useMemo(
    () =>
      institutions.filter(
        (i) => {
          const classifications = classificationByInstitution.get(i.id) ?? [];
          return (
            (classFilter === "ALL" || classifications.some((item) => item.key === classFilter)) &&
            (statusFilter === "ALL" || i.status === statusFilter) &&
            (filterName        === "" || i.name.includes(filterName)) &&
            (filterBizNumber   === "" || i.bizNumber.includes(filterBizNumber)) &&
            (filterContactName === "" || i.contactName.includes(filterContactName))
          );
        }
      ),
    [classFilter, classificationByInstitution, institutions, filterName, filterBizNumber, filterContactName, statusFilter]
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
  const participatingCount = institutions.filter((i) => (classificationByInstitution.get(i.id) ?? []).length > 0).length;
  const totalMembershipCount = projectMembers.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전체 {institutions.length}개 기관 · 참여기관 구분은 과제별 전담기관 기준으로 표시</p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={downloadExcelTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 9.293a1 1 0 0 1 1.414 0L9 10.586V3a1 1 0 1 1 2 0v7.586l1.293-1.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z" clipRule="evenodd" /></svg>
              양식 다운로드
            </button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 6.707a1 1 0 0 1 0-1.414l3-3a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414L11 5.414V13a1 1 0 1 1-2 0V5.414L7.707 6.707a1 1 0 0 1-1.414 0z" clipRule="evenodd" /></svg>
              엑셀 업로드
            </button>
            <button
              onClick={() => setModal({ mode: "add" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
              새 기관 추가
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체 기관", value: `${institutions.length}개` },
          { label: "참여 구분 보유", value: `${participatingCount}개` },
          { label: "참여 과제기관", value: `${totalMembershipCount}건` },
          { label: "활성", value: `${activeCount}개` },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          {[
            { label: "기관명",    value: filterName,        onChange: setFilterName        },
            { label: "사업자번호", value: filterBizNumber,   onChange: setFilterBizNumber   },
            { label: "담당자",    value: filterContactName, onChange: setFilterContactName  },
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
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white">
            <option value="ALL">전체 구분</option>
            {classificationOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
              <th className="text-left px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분 내용</th>
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
                  <td className="px-4 py-4">
                    <ClassificationChips items={classificationByInstitution.get(inst.id) ?? []} />
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
                    {canEdit ? (
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => setModal({ mode: "edit", target: inst })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                          <FiEdit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete(inst.id, inst.name)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="삭제">
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
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}개 표시 (전체 {institutions.length}개)
        </div>
      </div>

      {showUpload && <ExcelUploadModal onClose={() => setShowUpload(false)} />}

      {modal && (
        <Modal title={modal.mode === "add" ? "새 기관 추가" : "기관 정보 수정"} onClose={() => setModal(null)} size="lg">
          <InstitutionForm initial={modal.mode === "edit" ? modal.target : EMPTY} isEdit={modal.mode === "edit"} onSubmit={handleSubmit} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
