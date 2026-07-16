"use client";

import React, { use, useState } from "react";
import Link from "next/link";
import { useStore, updateInstitution, updateProjectMember } from "@/lib/store";
import { fmtWon } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import { useCanWrite } from "@/lib/permissions";

const ROLE_MAP = {
  LEAD: { label: "주관기관", color: "blue" as const },
  PARTICIPANT: { label: "참여기관", color: "slate" as const },
};

const ACTION_MAP = {
  CREATE: { label: "생성", color: "blue" as const },
  UPDATE: { label: "수정", color: "amber" as const },
  DELETE: { label: "삭제", color: "red" as const },
};

const FEE_STATUS_MAP = {
  BILLED:    { label: "청구완료", color: "green"  as const },
  CONFIRMED: { label: "확정",    color: "blue"   as const },
  DRAFT:     { label: "초안",    color: "slate"  as const },
  SCHEDULED: { label: "예정",    color: "amber"  as const },
};

type Classification = {
  agencyName: string;
  agencyShortName: string;
  category1: string;
  category2: string;
};

function normalizeClassification(raw?: string | null): Pick<Classification, "category1" | "category2"> {
  const value = raw ?? "일반";
  if (value.includes("자율")) return { category1: "자율성트랙", category2: "자율성트랙" };
  if (value.includes("최우수") || value.includes("(S)") || value === "S") return { category1: "S", category2: "최우수" };
  if (value.includes("우수") || /[ABC]/.test(value)) return { category1: "A~C", category2: "우수" };
  return { category1: "일반", category2: "일반" };
}

// 등급별 정산구분 기본값 — "일반"이면 위탁정산, "S"/"A~C"면 자체정산
function defaultSettlementType(category1: string): "위탁정산" | "자체정산" {
  return category1 === "일반" ? "위탁정산" : "자체정산";
}

export default function InstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { institutions, projects, projectMembers, termFees, auditLog, fundingAgencies } = useStore();
  const canEdit = useCanWrite('institutions');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const inst = institutions.find((i) => i.id === id);

  if (!inst) {
    return (
      <div className="flex flex-col items-center justify-center h-60 gap-3">
        <p className="text-sm text-slate-500">기관을 찾을 수 없습니다</p>
        <Link href="/institutions" className="text-xs text-blue-600 hover:underline">← 기관 목록으로</Link>
      </div>
    );
  }

  const myMemberships = projectMembers.filter((m) => m.institutionId === id);
  const leadProjects = myMemberships.filter((m) => m.role === "LEAD");
  const participantProjects = myMemberships.filter((m) => m.role === "PARTICIPANT");
  const relatedFees = termFees.filter((f) => f.institutionId === id);
  const history = auditLog.filter((e) => e.entityType === "institution" && e.entityId === id);
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectsByNumber = new Map(projects.map((project) => [project.projectNumber, project]));
  const agenciesById = new Map(fundingAgencies.map((agency) => [agency.id, agency]));

  function getClassification(projectId: string, rawGrade?: string | null): Classification {
    const project = projectsById.get(projectId);
    const agency = project ? agenciesById.get(project.agencyId) : undefined;
    const classification = normalizeClassification(rawGrade);
    return {
      agencyName: agency?.name ?? project?.agency ?? "미지정 전담기관",
      agencyShortName: agency?.shortName ?? project?.agency ?? "미지정",
      category1: classification.category1,
      category2: classification.category2,
    };
  }

  function getFeeClassification(projectNumber: string): Classification {
    const project = projectsByNumber.get(projectNumber);
    const member = myMemberships.find((m) => m.projectNumber === projectNumber);
    if (!project) {
      const classification = normalizeClassification(member?.institutionGrade);
      return { agencyName: "미지정 전담기관", agencyShortName: "미지정", ...classification };
    }
    return getClassification(project.id, member?.institutionGrade);
  }

  const totalCalculatedFee = relatedFees.reduce((s, f) => s + f.calculatedFee, 0);
  const totalAppliedFee = relatedFees.reduce((s, f) => s + f.appliedFee, 0);

  // 기관명 옆 "일반/S/A~C" 뱃지 — 참여 과제 중 가장 우수한 등급(S > A~C > 일반) 기준으로 표시
  const memberClassifications = myMemberships.map((m) => normalizeClassification(m.institutionGrade).category1);
  const overallCategory1 = memberClassifications.includes("S")
    ? "S"
    : memberClassifications.includes("A~C")
      ? "A~C"
      : "일반";

  function startNoteEdit() {
    setNoteDraft(inst!.note ?? "");
    setEditingNote(true);
  }
  function saveNote() {
    updateInstitution(id, { note: noteDraft });
    setEditingNote(false);
  }
  function handleSettlementTypeChange(memberId: string, value: "위탁정산" | "자체정산") {
    updateProjectMember(memberId, { settlementType: value });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/institutions" className="text-xs text-slate-400 hover:text-slate-600">← 기관 목록</Link>
        <span className="text-xs text-slate-300">/</span>
        <span className="text-xs text-slate-600 font-medium">{inst.name}</span>
      </div>

      {/* 기본 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">{inst.name}</h2>
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{overallCategory1}</span>
              <span className="text-xs text-slate-400">기본 정산방식 {defaultSettlementType(overallCategory1)}</span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">{inst.representativeName} 대표</p>
          </div>
          <StatusBadge label={inst.status === "ACTIVE" ? "활성" : "비활성"} color={inst.status === "ACTIVE" ? "green" : "slate"} />
        </div>
        <div className="grid grid-cols-4 gap-4 pt-4 border-t border-slate-100">
          <div>
            <p className="text-xs text-slate-400">사업자번호</p>
            <p className="text-sm font-mono text-slate-700 mt-0.5">{inst.bizNumber}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">담당자</p>
            <p className="text-sm text-slate-700 mt-0.5">{inst.contactName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">연락처</p>
            <p className="text-sm text-slate-700 mt-0.5">{inst.contactPhone}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">이메일</p>
            <p className="text-sm text-slate-700 mt-0.5">{inst.contactEmail}</p>
          </div>
        </div>
      </div>

      {/* 특이사항 */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">특이사항</h3>
          {canEdit && !editingNote && (
            <button onClick={startNoteEdit} className="text-xs text-blue-600 hover:underline">
              {inst.note ? "수정" : "추가"}
            </button>
          )}
        </div>
        {editingNote ? (
          <div className="space-y-2">
            <textarea
              className="w-full min-h-20 resize-y text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="기관 관련 특이사항을 기록하세요"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingNote(false)} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveNote} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{inst.note || "등록된 특이사항이 없습니다."}</p>
        )}
      </div>

      {/* 과제별 구분 내용 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">과제별 구분 내용</h3>
            <p className="text-xs text-slate-400 mt-0.5">기관 고정 유형이 아니라, 참여한 과제의 전담기관 기준으로 구분1/구분2를 확인합니다.</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {myMemberships.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">참여 과제 구분 내용이 없습니다.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제번호</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">전담기관</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분1</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분2</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">정산구분</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">역할</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">배정 예산</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">요율</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">산정 수수료</th>
                </tr>
              </thead>
              <tbody>
                {myMemberships.map((m) => {
                  const classification = getClassification(m.projectId, m.institutionGrade);
                  const project = projectsById.get(m.projectId);
                  return (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {project ? (
                          <Link href={`/projects/${project.id}`} className="font-mono text-xs text-blue-600 hover:underline">{m.projectNumber}</Link>
                        ) : (
                          <span className="font-mono text-xs text-slate-500">{m.projectNumber}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{classification.agencyShortName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{classification.agencyName}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{classification.category1}</span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-slate-700">{classification.category2}</td>
                      <td className="px-4 py-3 text-center">
                        {canEdit ? (
                          <select
                            value={m.settlementType ?? defaultSettlementType(classification.category1)}
                            onChange={(e) => handleSettlementTypeChange(m.id, e.target.value as "위탁정산" | "자체정산")}
                            className={`text-xs font-medium px-2 py-0.5 rounded border-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                              (m.settlementType ?? defaultSettlementType(classification.category1)) === "자체정산" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            <option value="위탁정산">위탁정산</option>
                            <option value="자체정산">자체정산</option>
                          </select>
                        ) : (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                            (m.settlementType ?? defaultSettlementType(classification.category1)) === "자체정산" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}>
                            {m.settlementType ?? defaultSettlementType(classification.category1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge label={ROLE_MAP[m.role].label} color={ROLE_MAP[m.role].color} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(m.budget)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600">{m.feeRate}%</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(m.calculatedFee)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 과제 참여 현황 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "총 참여 과제", value: `${myMemberships.length}건` },
          { label: "주관기관 역할", value: `${leadProjects.length}건`, note: "세금계산서 수신 대상" },
          { label: "참여기관 역할", value: `${participantProjects.length}건`, note: "수수료 산정 대상" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className="text-sm font-bold mt-0.5 text-slate-800">{s.value}</p>
            {s.note && <p className="text-xs text-slate-400 mt-0.5">{s.note}</p>}
          </div>
        ))}
      </div>

      {/* 참여 과제 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">참여 과제 목록</h3>
        </div>
        {myMemberships.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">참여 과제 없음</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제번호</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제명</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">역할</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">배정 예산</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">요율</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">산정 수수료</th>
              </tr>
            </thead>
            <tbody>
              {myMemberships.map((m) => {
                const proj = projects.find((p) => p.id === m.projectId);
                return (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      {proj ? (
                        <Link href={`/projects/${proj.id}`} className="font-mono text-xs text-blue-600 hover:underline">{m.projectNumber}</Link>
                      ) : (
                        <span className="font-mono text-xs text-slate-500">{m.projectNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{proj?.projectName ?? "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={ROLE_MAP[m.role].label} color={ROLE_MAP[m.role].color} />
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(m.budget)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{m.feeRate}%</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(m.calculatedFee)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* 연차수수료 내역 */}
      {relatedFees.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">연차수수료 산정 내역</h3>
            <div className="flex items-center gap-4 text-xs text-slate-500">
              <span>산정액 합계 <strong className="text-slate-700">{fmtWon(totalCalculatedFee)}</strong></span>
              <span>적용액 합계 <strong className="text-slate-700">{fmtWon(totalAppliedFee)}</strong></span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">과제번호</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">연차</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분1</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">구분2</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">예산</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">요율</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">산정액</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-slate-500">적용액</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500">상태</th>
              </tr>
            </thead>
            <tbody>
              {relatedFees.map((f) => {
                const classification = getFeeClassification(f.projectNumber);
                return (
                  <tr key={f.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.projectNumber}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600">{f.termYear}년 {f.termNumber}연차</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{classification.category1}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-sm text-slate-700">{classification.category2}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{fmtWon(f.budget)}</td>
                    <td className="px-4 py-3 text-right text-xs text-slate-600">{f.feeRate}%</td>
                    <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(f.calculatedFee)}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(f.appliedFee)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge label={FEE_STATUS_MAP[f.status].label} color={FEE_STATUS_MAP[f.status].color} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 변경이력 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">전체 변경이력</h3>
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
                  <td className="px-4 py-3 text-xs text-slate-500">{e.changedFields ? Object.keys(e.changedFields).join(", ") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
