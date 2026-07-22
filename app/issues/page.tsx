"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { FiPlus, FiX, FiCheck, FiEdit2, FiTrash2, FiDownload } from "react-icons/fi";
import { useStore, addProjectIssue, updateProjectIssue, deleteProjectIssue } from "@/lib/store";
import { useCanWrite } from "@/lib/permissions";
import type { ProjectIssue, IssueRecipientGroup } from "@/lib/mock";
import UserMultiSelect from "@/components/common/UserMultiSelect";

const PRIORITY_STYLE: Record<string, string> = {
  HIGH:   "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW:    "bg-slate-100 text-slate-500",
};
const PRIORITY_LABEL: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };

const STATUS_STYLE: Record<string, string> = {
  OPEN:        "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED:    "bg-green-100 text-green-700",
};
const STATUS_LABEL: Record<string, string> = {
  OPEN:        "미처리",
  IN_PROGRESS: "진행중",
  RESOLVED:    "완료",
};

const inp = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const sel = `${inp} bg-white`;

const RECIPIENT_OPTIONS: { value: IssueRecipientGroup; label: string }[] = [
  { value: "MANAGER",    label: "담당자" },
  { value: "ACCOUNTANT", label: "회계담당자 전체" },
  { value: "SETTLEMENT", label: "전문기관담당자 전체" },
];

type EditDraft = {
  content: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  recipientGroups: IssueRecipientGroup[];
  recipientUserIds: string[];
  institutionName: string;
  noInstitution: boolean;
};

export default function IssuesPage() {
  const canCreate = useCanWrite('issues');
  const canManage = useCanWrite('issues-manage');
  const { projectIssues, projects, fundingAgencies, users } = useStore();
  const selectableUsers = users.filter((u) => u.status === "ACTIVE");

  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH" | "MEDIUM" | "LOW">("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "OPEN" | "IN_PROGRESS" | "RESOLVED">("ALL");
  const [agencyFilter, setAgencyFilter] = useState("ALL");
  const [projectNumberFilter, setProjectNumberFilter] = useState("");
  const [institutionFilter, setInstitutionFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [showForm, setShowForm] = useState(false);

  // New issue form state
  const [formProjectId, setFormProjectId] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formPriority, setFormPriority] = useState<"HIGH" | "MEDIUM" | "LOW">("MEDIUM");
  const [formStatus, setFormStatus] = useState<"OPEN" | "IN_PROGRESS" | "RESOLVED">("OPEN");
  const [formRecipients, setFormRecipients] = useState<IssueRecipientGroup[]>([]);
  const [formRecipientUserIds, setFormRecipientUserIds] = useState<string[]>([]);
  const [formInstitutionName, setFormInstitutionName] = useState("");
  const [formNoInstitution, setFormNoInstitution] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>({
    content: "", priority: "MEDIUM", status: "OPEN", recipientGroups: [],
    recipientUserIds: [], institutionName: "", noInstitution: false,
  });

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function toggleFormRecipient(group: IssueRecipientGroup) {
    setFormRecipients((prev) => prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]);
  }

  function toggleEditRecipient(group: IssueRecipientGroup) {
    setEditDraft((d) => ({
      ...d,
      recipientGroups: d.recipientGroups.includes(group) ? d.recipientGroups.filter((g) => g !== group) : [...d.recipientGroups, group],
    }));
  }

  const sorted = [...projectIssues].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const filtered = sorted.filter((issue) => {
    if (priorityFilter !== "ALL" && issue.priority !== priorityFilter) return false;
    if (statusFilter !== "ALL" && issue.status !== statusFilter) return false;
    const project = projects.find((p) => p.id === issue.projectId);
    if (agencyFilter !== "ALL" && project?.agencyId !== agencyFilter) return false;
    if (projectNumberFilter !== "" && !issue.projectNumber.includes(projectNumberFilter)) return false;
    if (institutionFilter !== "" && !(project?.leadInstitutionName ?? "").includes(institutionFilter)) return false;
    if (authorFilter !== "" && !issue.author.includes(authorFilter)) return false;
    return true;
  });

  function submitIssue() {
    const project = projects.find((p) => p.id === formProjectId);
    if (!project || !formContent.trim()) return;
    addProjectIssue({
      projectId: project.id,
      projectNumber: project.projectNumber,
      content: formContent.trim(),
      author: "김관리",
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16),
      priority: formPriority,
      status: formStatus,
      recipientGroups: formRecipients,
      recipientUserIds: formRecipientUserIds,
      institutionName: formNoInstitution ? undefined : (formInstitutionName.trim() || undefined),
      noInstitution: formNoInstitution,
    });
    setFormContent("");
    setFormPriority("MEDIUM");
    setFormStatus("OPEN");
    setFormProjectId("");
    setFormRecipients([]);
    setFormRecipientUserIds([]);
    setFormInstitutionName("");
    setFormNoInstitution(false);
    setShowForm(false);
  }

  function startEdit(issue: ProjectIssue) {
    setEditingId(issue.id);
    setEditDraft({
      content: issue.content, priority: issue.priority, status: issue.status ?? "OPEN",
      recipientGroups: issue.recipientGroups ?? [], recipientUserIds: issue.recipientUserIds ?? [],
      institutionName: issue.institutionName ?? "", noInstitution: issue.noInstitution ?? false,
    });
  }

  function saveEdit() {
    if (!editingId || !editDraft.content.trim()) return;
    updateProjectIssue(editingId, {
      content: editDraft.content.trim(),
      priority: editDraft.priority,
      status: editDraft.status,
      recipientGroups: editDraft.recipientGroups,
      recipientUserIds: editDraft.recipientUserIds,
      institutionName: editDraft.noInstitution ? undefined : (editDraft.institutionName.trim() || undefined),
      noInstitution: editDraft.noInstitution,
    });
    setEditingId(null);
  }

  function exportToExcel() {
    const data = filtered.map((issue) => {
      const project = projects.find((p) => p.id === issue.projectId);
      const agency = fundingAgencies.find((a) => a.id === project?.agencyId);
      return {
        "우선순위": PRIORITY_LABEL[issue.priority],
        "진행여부": STATUS_LABEL[issue.status ?? "OPEN"],
        "내용": issue.content,
        "과제": project?.projectName ?? issue.projectNumber,
        "과제번호": issue.projectNumber,
        "전담기관": agency ? `${agency.shortName} · ${agency.name}` : "",
        "기관명": issue.noInstitution ? "해당없음" : (issue.institutionName ?? ""),
        "작성자": issue.author,
        "작성일시": issue.createdAt,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "이슈현황");
    XLSX.writeFile(wb, `이슈현황_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function confirmDelete(id: string) {
    deleteProjectIssue(id);
    setDeletingId(null);
  }

  const highCount = projectIssues.filter((i) => i.priority === "HIGH").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">이슈 / 메모 현황</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            전체 <span className="text-slate-600 font-medium">{projectIssues.length}건</span>
            {highCount > 0 && (
              <span className="ml-2 text-red-500 font-medium">높음 {highCount}건</span>
            )}
            <span className="mx-1.5 text-slate-200">·</span>
            진행중 <span className="text-blue-600 font-medium">{projectIssues.filter((i) => i.status === "IN_PROGRESS").length}건</span>
            <span className="mx-1.5 text-slate-200">·</span>
            완료 <span className="text-green-600 font-medium">{projectIssues.filter((i) => i.status === "RESOLVED").length}건</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <FiDownload size={12} /> 엑셀 다운로드
          </button>
          {canCreate && (
            <button onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              {showForm ? <><FiX size={12} /> 닫기</> : <><FiPlus size={12} /> 이슈 등록</>}
            </button>
          )}
        </div>
      </div>

      {/* New issue form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-blue-200 px-5 py-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-700">새 이슈 등록</h3>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">과제 선택</label>
            <select value={formProjectId} onChange={(e) => setFormProjectId(e.target.value)}
              className={`${sel} w-full`}>
              <option value="">과제를 선택하세요</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">이슈 발생 기관명</label>
            <div className="flex items-center gap-2">
              <input value={formInstitutionName} onChange={(e) => setFormInstitutionName(e.target.value)}
                disabled={formNoInstitution} placeholder="기관명을 입력하세요"
                className={`${inp} flex-1 disabled:bg-slate-50 disabled:text-slate-400`} />
              <label className="flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap">
                <input type="checkbox" checked={formNoInstitution}
                  onChange={(e) => { setFormNoInstitution(e.target.checked); if (e.target.checked) setFormInstitutionName(""); }}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                <span className="text-xs text-slate-600">선택 필요 없음</span>
              </label>
            </div>
          </div>
          <textarea value={formContent} onChange={(e) => setFormContent(e.target.value)}
            placeholder="이슈 또는 메모 내용을 입력하세요"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            rows={3} maxLength={500} />
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs text-slate-500 mr-2">중요도</label>
              <select value={formPriority} onChange={(e) => setFormPriority(e.target.value as typeof formPriority)}
                className={`${sel} w-24`}>
                <option value="HIGH">높음</option>
                <option value="MEDIUM">보통</option>
                <option value="LOW">낮음</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mr-2">진행여부</label>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as typeof formStatus)}
                className={`${sel} w-24`}>
                <option value="OPEN">미처리</option>
                <option value="IN_PROGRESS">진행중</option>
                <option value="RESOLVED">완료</option>
              </select>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">알림 받을 대상(전체) <span className="text-slate-400 font-normal">· 선택 안 하면 과제 담당자에게만 전달</span></p>
            <div className="flex items-center gap-3">
              {RECIPIENT_OPTIONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={formRecipients.includes(value)}
                    onChange={() => toggleFormRecipient(value)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                  <span className="text-xs text-slate-600">{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1.5">알림 받을 대상(개인) <span className="text-slate-400 font-normal">· 위 전체 선택과 별개로 특정 인원을 추가 지정</span></p>
            <UserMultiSelect
              users={selectableUsers}
              selectedIds={formRecipientUserIds}
              onChange={setFormRecipientUserIds}
              placeholder="이름으로 검색..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
            <button onClick={submitIssue} disabled={!formProjectId || !formContent.trim()}
              className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
              <FiCheck size={12} /> 등록
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* 검색 필터 */}
        <div className="px-5 py-3 grid grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] font-medium text-slate-400 mb-1">전담기관</p>
            <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value)}
              className={`${sel} w-full`}>
              <option value="ALL">전담기관 전체</option>
              {fundingAgencies.map((a) => (
                <option key={a.id} value={a.id}>{a.shortName} · {a.name}</option>
              ))}
            </select>
          </div>
          {[
            { label: "과제번호", value: projectNumberFilter, onChange: setProjectNumberFilter },
            { label: "기관명",   value: institutionFilter,   onChange: setInstitutionFilter   },
            { label: "작성자",   value: authorFilter,        onChange: setAuthorFilter         },
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

        {/* 우선순위 · 진행여부 */}
        <div className="px-5 py-3 flex flex-wrap items-center gap-0">
          <div className="flex items-center gap-1.5 pr-5 border-r border-slate-100">
            <span className="text-[11px] font-medium text-slate-400 mr-0.5 shrink-0">우선순위</span>
            {(["ALL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
              <button key={p} onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                  priorityFilter === p
                    ? "bg-blue-600 text-white font-medium"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                {p === "ALL" ? "전체" : PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 px-5 border-r border-slate-100">
            <span className="text-[11px] font-medium text-slate-400 mr-0.5 shrink-0">진행여부</span>
            {(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED"] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                  statusFilter === s
                    ? "bg-blue-600 text-white font-medium"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}>
                {s === "ALL" ? "전체" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(agencyFilter !== "ALL" || projectNumberFilter !== "" || institutionFilter !== "" || authorFilter !== "") && (
              <button
                onClick={() => { setAgencyFilter("ALL"); setProjectNumberFilter(""); setInstitutionFilter(""); setAuthorFilter(""); }}
                className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors">
                초기화
              </button>
            )}
            <span className="text-xs text-slate-400 shrink-0">{filtered.length}건</span>
          </div>
        </div>
      </div>

      {/* Issues table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {priorityFilter !== "ALL" || statusFilter !== "ALL" || agencyFilter !== "ALL"
              || projectNumberFilter !== "" || institutionFilter !== "" || authorFilter !== ""
              ? "필터 조건에 맞는 이슈가 없습니다"
              : "등록된 이슈가 없습니다"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                <th className="text-center px-4 py-3 w-24">우선순위</th>
                <th className="text-center px-4 py-3 w-20">진행여부</th>
                <th className="text-left px-4 py-3">내용</th>
                <th className="text-left px-4 py-3">과제</th>
                <th className="text-center px-4 py-3 w-20">작성자</th>
                <th className="text-center px-4 py-3 w-36">작성일시</th>
                <th className="text-center px-4 py-3 w-24">바로가기</th>
                {canManage && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((issue) => {
                const project = projects.find((p) => p.id === issue.projectId);
                const isEditing = editingId === issue.id;
                const isDeleting = deletingId === issue.id;

                if (isEditing) {
                  return (
                    <Fragment key={issue.id}>
                      <tr className="border-b border-blue-100 bg-blue-50/30">
                        <td className="px-4 py-3 text-center">
                          <select value={editDraft.priority}
                            onChange={(e) => setEditDraft((d) => ({ ...d, priority: e.target.value as typeof editDraft.priority }))}
                            className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="HIGH">높음</option>
                            <option value="MEDIUM">보통</option>
                            <option value="LOW">낮음</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <select value={editDraft.status}
                            onChange={(e) => setEditDraft((d) => ({ ...d, status: e.target.value as typeof editDraft.status }))}
                            className="text-[10px] font-semibold border border-slate-200 rounded px-1.5 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                            <option value="OPEN">미처리</option>
                            <option value="IN_PROGRESS">진행중</option>
                            <option value="RESOLVED">완료</option>
                          </select>
                        </td>
                        <td className="px-4 py-3" colSpan={4}>
                          <textarea
                            value={editDraft.content}
                            onChange={(e) => setEditDraft((d) => ({ ...d, content: e.target.value }))}
                            className="w-full text-sm border border-blue-300 rounded-lg px-3 py-1.5 text-slate-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                            rows={2} maxLength={500} autoFocus />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {project && (
                            <Link href={`/projects/${project.id}`}
                              className="text-xs text-blue-500 hover:underline hover:text-blue-700 transition-colors">
                              과제 상세 →
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={saveEdit} disabled={!editDraft.content.trim()}
                              className="flex items-center gap-0.5 px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">
                              <FiCheck size={11} /> 저장
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                              취소
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100 bg-blue-50/30">
                        <td className="px-4 pt-1 pb-2" colSpan={8}>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-20 shrink-0">이슈 발생 기관</span>
                            <input value={editDraft.institutionName}
                              onChange={(e) => setEditDraft((d) => ({ ...d, institutionName: e.target.value }))}
                              disabled={editDraft.noInstitution} placeholder="기관명을 입력하세요"
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white disabled:bg-slate-50 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-400 w-48" />
                            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                              <input type="checkbox" checked={editDraft.noInstitution}
                                onChange={(e) => setEditDraft((d) => ({ ...d, noInstitution: e.target.checked, institutionName: e.target.checked ? "" : d.institutionName }))}
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                              <span className="text-xs text-slate-600">선택 필요 없음</span>
                            </label>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100 bg-blue-50/30">
                        <td className="px-4 pb-1" colSpan={8}>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-500 w-20 shrink-0">대상(전체)</span>
                            {RECIPIENT_OPTIONS.map(({ value, label }) => (
                              <label key={value} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox" checked={editDraft.recipientGroups.includes(value)}
                                  onChange={() => toggleEditRecipient(value)}
                                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
                                <span className="text-xs text-slate-600">{label}</span>
                              </label>
                            ))}
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-blue-100 bg-blue-50/30">
                        <td className="px-4 pb-3" colSpan={8}>
                          <div className="flex items-start gap-3">
                            <span className="text-xs text-slate-500 w-20 shrink-0 pt-1.5">대상(개인)</span>
                            <div className="flex-1 max-w-sm">
                              <UserMultiSelect
                                users={selectableUsers}
                                selectedIds={editDraft.recipientUserIds}
                                onChange={(ids) => setEditDraft((d) => ({ ...d, recipientUserIds: ids }))}
                                placeholder="이름으로 검색..."
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                }

                return (
                  <tr key={issue.id} className={`border-b border-slate-50 transition-colors ${isDeleting ? "bg-red-50" : "hover:bg-slate-50"}`}>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded whitespace-nowrap ${PRIORITY_STYLE[issue.priority]}`}>
                        {PRIORITY_LABEL[issue.priority]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded ${STATUS_STYLE[issue.status ?? "OPEN"]}`}>
                        {STATUS_LABEL[issue.status ?? "OPEN"]}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-md">
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{issue.content}</p>
                      {!issue.noInstitution && issue.institutionName && (
                        <p className="text-[11px] text-slate-400 mt-0.5">기관: {issue.institutionName}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-700 line-clamp-1">
                        {project?.projectName ?? issue.projectNumber}
                      </p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{issue.projectNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-600">{issue.author}</td>
                    <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{issue.createdAt}</td>
                    <td className="px-4 py-3 text-center">
                      {project && (
                        <Link href={`/projects/${project.id}`}
                          className="text-xs text-blue-500 hover:underline hover:text-blue-700 transition-colors">
                          과제 상세 →
                        </Link>
                      )}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {isDeleting ? (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => confirmDelete(issue.id)}
                              className="px-2 py-1 text-[10px] font-medium text-white bg-red-500 rounded hover:bg-red-600 transition-colors">
                              삭제
                            </button>
                            <button onClick={() => setDeletingId(null)}
                              className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded transition-colors">
                              취소
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => startEdit(issue)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                              <FiEdit2 size={13} />
                            </button>
                            <button onClick={() => setDeletingId(issue.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                              <FiTrash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
