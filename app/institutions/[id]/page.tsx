"use client";

import React, { use, useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiCheck, FiX } from "react-icons/fi";
import { useStore, updateInstitution, updateTermFee } from "@/lib/store";
import { type InstitutionType } from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";

const TYPE_LIST: InstitutionType[] = ["대기업", "중견기업", "중소기업", "스타트업", "대학", "정부출연연구소", "공공기관"];

const TYPE_COLOR: Record<string, "blue" | "purple" | "green" | "amber" | "slate" | "red"> = {
  대기업: "red",
  중견기업: "purple",
  중소기업: "blue",
  스타트업: "amber",
  대학: "green",
  정부출연연구소: "slate",
  공공기관: "slate",
};

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
  BILLED: { label: "청구완료", color: "green" as const },
  CONFIRMED: { label: "확정", color: "blue" as const },
  DRAFT: { label: "초안", color: "slate" as const },
};

const selectCls = "text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

// 기관유형 → companyClass 이름 매핑 (fees 페이지와 동일)
const TYPE_TO_CLASS: Record<string, string> = {
  대기업: "대기업", 중견기업: "중견기업", 중소기업: "중소기업", 스타트업: "스타트업",
  대학: "대학/연구소", 정부출연연구소: "대학/연구소", 공공기관: "대학/연구소",
};

export default function InstitutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { institutions, projects, projectMembers, termFees, auditLog, companyClasses } = useStore();

  const [typeEditing, setTypeEditing] = useState(false);
  const [newType, setNewType] = useState<InstitutionType>("중소기업");

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

  // 유형 변경 이력만 추출
  const typeHistory = useMemo(
    () => history.filter((e) => e.changedFields?.type),
    [history]
  );

  // 연차별로 사용된 기관 유형 (TermFee 기준)
  const termTypeRows = useMemo(
    () =>
      [...relatedFees]
        .sort((a, b) => a.termYear - b.termYear || a.termNumber - b.termNumber)
        .map((f) => ({ termYear: f.termYear, termNumber: f.termNumber, institutionType: f.institutionType, feeRate: f.feeRate, projectNumber: f.projectNumber })),
    [relatedFees]
  );

  const totalCalculatedFee = relatedFees.reduce((s, f) => s + f.calculatedFee, 0);
  const totalAppliedFee = relatedFees.reduce((s, f) => s + f.appliedFee, 0);

  function startTypeEdit() {
    if (!inst) return;
    setNewType(inst.type as InstitutionType);
    setTypeEditing(true);
  }

  function saveTypeChange() {
    updateInstitution(id, { type: newType });

    // 요율 맵 빌드
    const rateMap: Record<string, number> = {};
    companyClasses.forEach((c) => { rateMap[c.name] = c.feeRate; });
    const newRate = rateMap[TYPE_TO_CLASS[newType] ?? newType];

    // 현재 연차 이상(현재·미래)이면서 미청구(DRAFT·CONFIRMED)인 연차만 갱신
    // 과거 연차(termNumber < project.currentTerm)는 이미 합의된 금액이므로 변경 안 함
    relatedFees
      .filter((f) => {
        if (f.status === "BILLED") return false;
        const proj = projects.find((p) => p.projectNumber === f.projectNumber);
        return proj ? f.termNumber >= proj.currentTerm : false;
      })
      .forEach((f) => {
        const rate = newRate ?? f.feeRate;
        updateTermFee(f.id, {
          institutionType: newType,
          feeRate: rate,
          calculatedFee: Math.round((f.budget * rate) / 100),
        });
      });

    setTypeEditing(false);
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
            <h2 className="text-lg font-bold text-slate-800">{inst.name}</h2>
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

      {/* 기관 유형 관리 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">기관 유형 관리</h3>
            <p className="text-xs text-slate-400 mt-0.5">유형에 따라 수수료율이 결정됩니다. 변경 시 이력이 자동 기록됩니다.</p>
          </div>
        </div>

        {/* 현재 유형 + 변경 UI */}
        <div className="px-5 py-4 flex items-center gap-4 border-b border-slate-100">
          <div className="text-xs text-slate-400 w-20 shrink-0">현재 유형</div>
          {typeEditing ? (
            <div className="flex items-center gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as InstitutionType)}
                className={selectCls}
                autoFocus
              >
                {TYPE_LIST.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                onClick={saveTypeChange}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <FiCheck size={13} /> 저장
              </button>
              <button
                onClick={() => setTypeEditing(false)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <FiX size={13} /> 취소
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <StatusBadge label={inst.type} color={TYPE_COLOR[inst.type] ?? "slate"} />
              <button
                onClick={startTypeEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <FiEdit2 size={12} /> 유형 변경
              </button>
            </div>
          )}
        </div>

        {/* 연차별 적용 유형 */}
        {termTypeRows.length > 0 && (
          <div className="px-5 py-4 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-600 mb-3">연차별 수수료 산정 시 적용 유형</p>
            <div className="flex flex-wrap gap-2">
              {termTypeRows.map((r, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                  <span className="text-slate-500">{r.termYear}년 {r.termNumber}연차</span>
                  <span className="text-slate-300">·</span>
                  <StatusBadge label={r.institutionType} color={TYPE_COLOR[r.institutionType] ?? "slate"} />
                  <span className="text-slate-300">·</span>
                  <span className="text-blue-700 font-medium">{r.feeRate}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 유형 변경 이력 */}
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-slate-600 mb-3">유형 변경 이력</p>
          {typeHistory.length === 0 ? (
            <p className="text-xs text-slate-400">유형 변경 이력이 없습니다</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">변경 일시</th>
                  <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">이전 유형</th>
                  <th className="text-left pb-2 pr-4 font-medium whitespace-nowrap">변경 후</th>
                  <th className="text-left pb-2 font-medium whitespace-nowrap">수행자</th>
                </tr>
              </thead>
              <tbody>
                {typeHistory.map((e) => {
                  const before = e.changedFields?.type?.before as string | undefined;
                  const after  = e.changedFields?.type?.after  as string | undefined;
                  return (
                    <tr key={e.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 pr-4 font-mono text-slate-500 whitespace-nowrap">{e.performedAt}</td>
                      <td className="py-2 pr-4">
                        {before ? <StatusBadge label={before} color={TYPE_COLOR[before] ?? "slate"} /> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {after ? <StatusBadge label={after} color={TYPE_COLOR[after] ?? "slate"} /> : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="py-2 text-slate-700">{e.performedBy}</td>
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
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">적용 유형</th>
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
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.projectNumber}</td>
                  <td className="px-4 py-3 text-center text-xs text-slate-600">{f.termYear}년 {f.termNumber}연차</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={f.institutionType} color={TYPE_COLOR[f.institutionType] ?? "slate"} />
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{fmtWon(f.budget)}</td>
                  <td className="px-4 py-3 text-right text-xs text-slate-600">{f.feeRate}%</td>
                  <td className="px-4 py-3 text-right text-sm text-slate-700">{fmtWon(f.calculatedFee)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-800">{fmtWon(f.appliedFee)}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge label={FEE_STATUS_MAP[f.status].label} color={FEE_STATUS_MAP[f.status].color} />
                  </td>
                </tr>
              ))}
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
