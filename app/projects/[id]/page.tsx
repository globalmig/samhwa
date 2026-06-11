"use client";

import { use, useState } from "react";
import Link from "next/link";
import { FiEdit2, FiCheck, FiX } from "react-icons/fi";
import { useStore, updateProject } from "@/lib/store";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";

const STATUS_MAP = {
  ACTIVE: { label: "진행중", color: "green" as const },
  COMPLETED: { label: "완료", color: "slate" as const },
  SUSPENDED: { label: "중단", color: "amber" as const },
};

const FEE_STATUS_MAP = {
  BILLED: { label: "청구완료", color: "green" as const },
  CONFIRMED: { label: "확정", color: "blue" as const },
  DRAFT: { label: "초안", color: "slate" as const },
};

const ROLE_MAP = {
  LEAD: { label: "주관", color: "blue" as const },
  PARTICIPANT: { label: "참여", color: "slate" as const },
};

const ACTION_MAP = {
  CREATE: { label: "생성", color: "blue" as const },
  UPDATE: { label: "수정", color: "amber" as const },
  DELETE: { label: "삭제", color: "red" as const },
};

const inputCls = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { projects, projectMembers, termFees, auditLog, institutions } = useStore();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLeadId, setEditLeadId] = useState("");

  const project = projects.find((p) => p.id === id);
  const members = projectMembers.filter((m) => m.projectId === id);
  const relatedFees = termFees.filter((f) => f.projectNumber === project?.projectNumber);
  const history = auditLog.filter((e) => e.entityType === "project" && e.entityId === id);

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">과제를 찾을 수 없습니다</p>
        <Link href="/projects" className="text-xs text-blue-600 hover:underline">← 과제 목록으로</Link>
      </div>
    );
  }

  const totalCalcFee = relatedFees.reduce((s, f) => s + f.calculatedFee, 0);
  const totalAppliedFee = relatedFees.reduce((s, f) => s + f.appliedFee, 0);

  function startEdit() {
    if (!project) return;
    setEditName(project.projectName);
    setEditLeadId(project.leadInstitutionId);
    setEditing(true);
  }

  function saveEdit() {
    if (!project) return;
    const inst = institutions.find((i) => i.id === editLeadId);
    updateProject(id, {
      projectName: editName.trim() || project.projectName,
      leadInstitutionId: editLeadId,
      leadInstitutionName: inst?.name ?? project.leadInstitutionName,
    });
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/projects" className="text-xs text-slate-400 hover:text-slate-600">← 과제 목록</Link>
        <span className="text-xs text-slate-300">/</span>
        <span className="text-xs text-slate-600 font-medium">{project.projectName}</span>
      </div>

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          {editing ? (
            <div className="flex-1 space-y-3 mr-4">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">과제명</label>
                <input
                  className={`${inputCls} w-full text-base font-bold`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") cancelEdit(); }}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">주관기관</label>
                <select
                  className={`${selectCls} w-64`}
                  value={editLeadId}
                  onChange={(e) => setEditLeadId(e.target.value)}
                >
                  <option value="">선택하세요</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-mono text-xs text-slate-400 mb-1">{project.projectNumber}</p>
              <h2 className="text-lg font-bold text-slate-800">{project.projectName}</h2>
              <p className="text-sm text-slate-500 mt-1">{project.agency}</p>
            </div>
          )}

          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge label={STATUS_MAP[project.status].label} color={STATUS_MAP[project.status].color} />
            {editing ? (
              <>
                <button
                  onClick={saveEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <FiCheck size={13} />
                  저장
                </button>
                <button
                  onClick={cancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <FiX size={13} />
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={startEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <FiEdit2 size={13} />
                수정
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">주관기관</p>
            <p className="text-sm font-bold text-blue-700 mt-0.5">{project.leadInstitutionName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">총사업비</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{fmtWon(project.totalBudget)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">기간</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{fmtDate(project.startDate)} ~ {fmtDate(project.endDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">연차</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{project.currentTerm}/{project.totalTerms}연차</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">참여기관</p>
            <p className="text-sm font-medium text-slate-700 mt-0.5">{members.length}개</p>
          </div>
        </div>
      </div>

      {/* 참여기관 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">참여기관 목록</h3>
          <p className="text-xs text-slate-400 mt-0.5">주관기관 포함 전체 참여기관 · 수수료 산정 기준</p>
        </div>
        {members.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">참여기관 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">기관명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">역할</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">배정예산</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">요율</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정 수수료</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/institutions/${m.institutionId}`} className="text-sm text-blue-600 hover:underline font-medium">{m.institutionName}</Link>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">{m.institutionType}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={ROLE_MAP[m.role].label} color={ROLE_MAP[m.role].color} />
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(m.budget)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{m.feeRate}%</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(m.calculatedFee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 연차수수료 현황 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">연차수수료 산정 내역</h3>
            <p className="text-xs text-slate-400 mt-0.5">합산 후 주관기관({project.leadInstitutionName})에 세금계산서 발행</p>
          </div>
          {relatedFees.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>산정 합계 <strong className="text-slate-700">{fmtWon(totalCalcFee)}</strong></span>
              <span>적용 합계 <strong className="text-slate-700">{fmtWon(totalAppliedFee)}</strong></span>
            </div>
          )}
        </div>
        {relatedFees.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">연차수수료 데이터 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">수행기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">유형</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">연차</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">예산</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">요율</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">적용액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">상태</th>
              </tr>
            </thead>
            <tbody>
              {relatedFees.map((f) => (
                <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-700">{f.institutionName}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500">{f.institutionType}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">{f.termYear}년 {f.termNumber}연차</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{fmtWon(f.budget)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{f.feeRate}%</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(f.calculatedFee)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(f.appliedFee)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge
                      label={FEE_STATUS_MAP[f.status as keyof typeof FEE_STATUS_MAP]?.label ?? f.status}
                      color={FEE_STATUS_MAP[f.status as keyof typeof FEE_STATUS_MAP]?.color ?? "slate"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 변경이력 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">변경이력</h3>
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">변경이력 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">일시</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">액션</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">수행자</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">변경 필드</th>
              </tr>
            </thead>
            <tbody>
              {history.map((e) => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 text-center font-mono text-xs text-slate-500">{e.performedAt}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={ACTION_MAP[e.action].label} color={ACTION_MAP[e.action].color} />
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-slate-700">{e.performedBy}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {e.changedFields ? Object.keys(e.changedFields).join(", ") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
