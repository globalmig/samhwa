"use client";

import { useState, useMemo } from "react";
import { FiEdit2, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { useStore, addTermFee, updateTermFee, updateUnclaimedFee } from "@/lib/store";
import { type TermFee, type UnclaimedFee, type InstitutionType } from "@/lib/mock";
import { fmtWon, fmtRate, fmtDate } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";

// ────────────────────────────────────────────
// 타입
// ────────────────────────────────────────────
type TermRow = {
  key: string;
  projectNumber: string;
  projectName: string;
  termYear: number;
  termNumber: number;
  leadInstitutionName: string;
  totalBudget: number;
  standardFee: number;
  appliedFee: number;
  fees: TermFee[];
  status: TermFee["status"];
  billedFee: number;
  receivableAmount: number;
  unclaimedAmount: number;
  carryoverAmount: number;
  unclaimedRecord: UnclaimedFee | null;
  finalBilledAmount: number;
  cumulativeFee: number;
};

type ModalState = { mode: "generate" } | { mode: "edit"; target: TermFee };

// ────────────────────────────────────────────
// 상태 매핑
// ────────────────────────────────────────────
const TF_STATUS: Record<TermFee["status"], { label: string; color: "green" | "blue" | "slate" }> = {
  BILLED:    { label: "청구완료", color: "green" },
  CONFIRMED: { label: "확정",    color: "blue"  },
  DRAFT:     { label: "초안",    color: "slate" },
};

const UC_STATUS: Record<UnclaimedFee["status"], { label: string; color: "amber" | "blue" | "green" }> = {
  PENDING:      { label: "대기중", color: "amber" },
  CARRIED_OVER: { label: "이월됨", color: "blue"  },
  RESOLVED:     { label: "해소됨", color: "green" },
};

// 기관유형 → companyClass 이름 매핑
const TYPE_TO_CLASS: Record<string, string> = {
  대기업: "대기업", 중견기업: "중견기업", 중소기업: "중소기업", 스타트업: "스타트업",
  대학: "대학/연구소", 정부출연연구소: "대학/연구소", 공공기관: "대학/연구소",
};

const inputCls  = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;
const COL_COUNT = 11;

// ────────────────────────────────────────────
// 과제+연차 단위 집계 hook
// ────────────────────────────────────────────
function useTermRows(): TermRow[] {
  const { termFees, projects, unclaimedFees, receivables } = useStore();

  return useMemo(() => {
    const groups = new Map<string, TermFee[]>();
    termFees.forEach((tf) => {
      const k = `${tf.projectNumber}|${tf.termYear}|${tf.termNumber}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(tf);
    });

    const rows: TermRow[] = Array.from(groups.entries()).map(([key, fees]) => {
      const f0 = fees[0];
      const project = projects.find((p) => p.projectNumber === f0.projectNumber);

      const standardFee = fees.reduce((s, f) => s + f.calculatedFee, 0);
      const appliedFee  = fees.reduce((s, f) => s + f.appliedFee,    0);
      const totalBudget = fees.reduce((s, f) => s + f.budget,        0);

      const status: TermFee["status"] = fees.some((f) => f.status === "DRAFT")
        ? "DRAFT"
        : fees.every((f) => f.status === "BILLED")
        ? "BILLED"
        : "CONFIRMED";

      const rv = receivables.find(
        (r) => r.projectNumber === f0.projectNumber && r.termYear === f0.termYear && r.termNumber === f0.termNumber
      );
      const billedFee       = rv?.billedAmount     ?? 0;
      const receivableAmount = rv?.receivableAmount ?? 0;

      // 당해 연차 PENDING 미청구
      const ucRecord = unclaimedFees.find(
        (u) => u.projectNumber === f0.projectNumber && u.termYear === f0.termYear && u.termNumber === f0.termNumber
      ) ?? null;
      const unclaimedAmount = ucRecord?.amount ?? 0;

      // 과거 연차 이월 미청구액 합계
      const carryoverAmount = unclaimedFees
        .filter(
          (u) =>
            u.projectNumber === f0.projectNumber &&
            u.status === "CARRIED_OVER" &&
            (u.termYear < f0.termYear || (u.termYear === f0.termYear && u.termNumber < f0.termNumber))
        )
        .reduce((s, u) => s + u.amount, 0);

      // 당해 최종청구액: 실제 발행 금액 우선, 없으면 신청수수료 + 이월
      const finalBilledAmount = billedFee > 0 ? billedFee : appliedFee + carryoverAmount;

      // 과제 누적수수료 (전 연차 합산)
      const cumulativeFee = termFees
        .filter((f) => f.projectNumber === f0.projectNumber)
        .reduce((s, f) => s + f.appliedFee, 0);

      return {
        key,
        projectNumber: f0.projectNumber,
        projectName: f0.projectName,
        termYear: f0.termYear,
        termNumber: f0.termNumber,
        leadInstitutionName: project?.leadInstitutionName ?? "",
        totalBudget,
        standardFee,
        appliedFee,
        fees,
        status,
        billedFee,
        receivableAmount,
        unclaimedAmount,
        carryoverAmount,
        unclaimedRecord: ucRecord,
        finalBilledAmount,
        cumulativeFee,
      };
    });

    rows.sort((a, b) => {
      if (a.projectNumber !== b.projectNumber) return a.projectNumber.localeCompare(b.projectNumber);
      if (a.termYear !== b.termYear) return b.termYear - a.termYear;
      return b.termNumber - a.termNumber;
    });

    return rows;
  }, [termFees, projects, unclaimedFees, receivables]);
}

// ────────────────────────────────────────────
// 펼치기 상세 (기관별 내역 + 미청구 관리)
// ────────────────────────────────────────────
function ExpandedDetail({ row, onEditFee }: { row: TermRow; onEditFee: (tf: TermFee) => void }) {
  const { projectMembers } = useStore();

  const roleMap = useMemo(() => {
    const m: Record<string, "LEAD" | "PARTICIPANT"> = {};
    projectMembers
      .filter((pm) => pm.projectNumber === row.projectNumber)
      .forEach((pm) => { m[pm.institutionId] = pm.role; });
    return m;
  }, [projectMembers, row.projectNumber]);

  return (
    <tr>
      <td colSpan={COL_COUNT} className="px-0 pb-0 bg-slate-50/60">
        <div className="mx-4 mb-4 mt-1 space-y-3">

          {/* 기관별 산정 내역 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">참여기관별 수수료 산정</p>
              <p className="text-xs text-slate-400">{row.fees.length}개 기관</p>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 font-medium">
                  <th className="text-left   px-4 py-2.5 whitespace-nowrap">기관명</th>
                  <th className="text-center px-4 py-2.5 whitespace-nowrap">역할</th>
                  <th className="text-center px-4 py-2.5 whitespace-nowrap">유형</th>
                  <th className="text-right  px-4 py-2.5 whitespace-nowrap">사업비</th>
                  <th className="text-center px-4 py-2.5 whitespace-nowrap">요율</th>
                  <th className="text-right  px-4 py-2.5 whitespace-nowrap">표준수수료</th>
                  <th className="text-right  px-4 py-2.5 whitespace-nowrap">신청수수료</th>
                  <th className="text-center px-4 py-2.5 whitespace-nowrap">상태</th>
                  <th className="text-center px-4 py-2.5 whitespace-nowrap">관리</th>
                </tr>
              </thead>
              <tbody>
                {row.fees.map((tf) => {
                  const role = roleMap[tf.institutionId];
                  return (
                    <tr key={tf.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{tf.institutionName}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-medium ${role === "LEAD" ? "text-blue-600" : "text-slate-400"}`}>
                          {role === "LEAD" ? "주관" : "참여"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-slate-600 whitespace-nowrap">{tf.institutionType}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap">{fmtWon(tf.budget)}</td>
                      <td className="px-4 py-2.5 text-center text-blue-700 font-medium">{fmtRate(tf.feeRate)}</td>
                      <td className="px-4 py-2.5 text-right text-slate-700 whitespace-nowrap">{fmtWon(tf.calculatedFee)}</td>
                      <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                        <span className={tf.appliedFee === 0 ? "text-amber-500" : "text-slate-800"}>
                          {tf.appliedFee === 0 ? "미적용" : fmtWon(tf.appliedFee)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <StatusBadge label={TF_STATUS[tf.status].label} color={TF_STATUS[tf.status].color} />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => onEditFee(tf)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="수정"
                        >
                          <FiEdit2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>합계</span>
              <div className="flex items-center gap-8">
                <span>사업비 <span className="font-semibold text-slate-700 ml-1">{fmtWon(row.totalBudget)}</span></span>
                <span>표준수수료 <span className="font-semibold text-slate-700 ml-1">{fmtWon(row.standardFee)}</span></span>
                <span>신청수수료 <span className="font-semibold text-slate-700 ml-1">{fmtWon(row.appliedFee)}</span></span>
              </div>
            </div>
          </div>

          {/* 미청구액 관리 */}
          {row.unclaimedRecord && (
            <div className="rounded-xl border border-amber-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-800">미청구액 관리</p>
                <p className="text-xs text-amber-600">이 연차 수수료가 아직 청구되지 않았습니다</p>
              </div>
              <div className="px-5 py-4 flex items-center gap-8 flex-wrap">
                <div className="text-xs">
                  <p className="text-slate-400 mb-1">미청구액</p>
                  <p className="font-bold text-amber-600 text-sm">{fmtWon(row.unclaimedRecord.amount)}</p>
                </div>
                <div className="text-xs">
                  <p className="text-slate-400 mb-1">발생일</p>
                  <p className="text-slate-700">{fmtDate(row.unclaimedRecord.occurredAt)}</p>
                </div>
                <div className="text-xs">
                  <p className="text-slate-400 mb-1">상태</p>
                  <select
                    value={row.unclaimedRecord.status}
                    onChange={(e) =>
                      updateUnclaimedFee(row.unclaimedRecord!.id, {
                        status: e.target.value as UnclaimedFee["status"],
                      })
                    }
                    className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="PENDING">대기중</option>
                    <option value="CARRIED_OVER">이월됨</option>
                    <option value="RESOLVED">해소됨</option>
                  </select>
                </div>
                <div className="text-xs flex items-center gap-2">
                  <p className="text-slate-400">이월처리</p>
                  <input
                    type="checkbox"
                    checked={row.unclaimedRecord.carriedOver}
                    onChange={(e) =>
                      updateUnclaimedFee(row.unclaimedRecord!.id, { carriedOver: e.target.checked })
                    }
                    className="rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 과제 요약 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">과거 이월 미청구액 (전 연차 누적)</p>
              <p className={`text-sm font-bold mt-0.5 ${row.carryoverAmount > 0 ? "text-blue-600" : "text-slate-400"}`}>
                {fmtWon(row.carryoverAmount)}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
              <p className="text-xs text-slate-400">과제 누적수수료 (전 연차 합산)</p>
              <p className="text-sm font-bold text-slate-800 mt-0.5">{fmtWon(row.cumulativeFee)}</p>
            </div>
          </div>

        </div>
      </td>
    </tr>
  );
}

// ────────────────────────────────────────────
// 연차 수수료 생성 폼 (반자동)
// ────────────────────────────────────────────
type RowState = { included: boolean; budget: number; feeRate: number; appliedFeeStr: string };

function TermGenerateForm({ onClose }: { onClose: () => void }) {
  const { projects, projectMembers, companyClasses } = useStore();
  const [projectId, setProjectId]   = useState("");
  const [termYear, setTermYear]     = useState(new Date().getFullYear());
  const [termNumber, setTermNumber] = useState(1);
  const [rows, setRows]             = useState<Record<string, RowState>>({});

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    companyClasses.forEach((c) => { m[c.name] = c.feeRate; });
    return m;
  }, [companyClasses]);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const members = useMemo(
    () => (projectId ? projectMembers.filter((m) => m.projectId === projectId) : []),
    [projectId, projectMembers]
  );

  function handleProjectChange(pid: string) {
    setProjectId(pid);
    const mems = projectMembers.filter((m) => m.projectId === pid);
    const init: Record<string, RowState> = {};
    mems.forEach((m) => {
      const rate = rateMap[TYPE_TO_CLASS[m.institutionType] ?? "중소기업"] ?? m.feeRate;
      init[m.id] = { included: true, budget: m.budget, feeRate: rate, appliedFeeStr: "" };
    });
    setRows(init);
  }

  function calcFee(id: string) {
    const r = rows[id];
    return r ? Math.round((r.budget * r.feeRate) / 100) : 0;
  }

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const included = members.filter((m) => rows[m.id]?.included);
  const totalCalc = included.reduce((s, m) => s + calcFee(m.id), 0);

  function handleSubmit() {
    if (!selectedProject) return;
    included.forEach((m) => {
      const r = rows[m.id];
      const calculated = calcFee(m.id);
      addTermFee({
        projectNumber: selectedProject.projectNumber,
        projectName:   selectedProject.projectName,
        termYear, termNumber,
        institutionId:   m.institutionId,
        institutionName: m.institutionName,
        institutionType: m.institutionType,
        budget: r.budget, feeRate: r.feeRate,
        calculatedFee: calculated,
        appliedFee: r.appliedFeeStr !== "" ? Number(r.appliedFeeStr) : calculated,
        status: "DRAFT",
      });
    });
    onClose();
  }

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">과제 선택</label>
          <select className={selectCls} value={projectId} onChange={(e) => handleProjectChange(e.target.value)}>
            <option value="">과제를 선택하세요</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">연도</label>
          <input className={inputCls} type="number" value={termYear} onChange={(e) => setTermYear(Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">연차</label>
          <input className={inputCls} type="number" min={1} value={termNumber} onChange={(e) => setTermNumber(Number(e.target.value))} />
        </div>
      </div>

      {selectedProject && (
        <p className="text-xs text-slate-400 -mt-2">
          <span className="font-mono text-slate-500">{selectedProject.projectNumber}</span>
          {" · "}주관: <span className="text-slate-600">{selectedProject.leadInstitutionName}</span>
        </p>
      )}

      {members.length > 0 ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">참여기관별 수수료 산정</span>
            <span className="text-xs text-slate-400">{members.length}개 기관 · 연차 협약 기준으로 사업비 조정 가능</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-medium">
                  <th className="px-3 py-2.5 text-center w-8">포함</th>
                  <th className="px-3 py-2.5 text-left">기관명</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">구분</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">연차 사업비(원)</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">요율</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">산정수수료</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">적용수수료 (조정시 입력)</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const r = rows[m.id];
                  if (!r) return null;
                  const calc = calcFee(m.id);
                  return (
                    <tr key={m.id} className={`border-b border-slate-50 last:border-0 transition-opacity ${!r.included ? "opacity-35" : ""}`}>
                      <td className="px-3 py-2.5 text-center">
                        <input type="checkbox" checked={r.included} onChange={(e) => setRow(m.id, { included: e.target.checked })} className="rounded" />
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800">{m.institutionName}</p>
                        <p className="text-slate-400">{m.role === "LEAD" ? "주관" : "참여"}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{m.institutionType}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" disabled={!r.included} value={r.budget}
                          onChange={(e) => setRow(m.id, { budget: Number(e.target.value) })}
                          className="w-32 text-right border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-300" />
                      </td>
                      <td className="px-3 py-2.5 text-center text-blue-700 font-medium whitespace-nowrap">{fmtRate(r.feeRate)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap font-medium">{fmtWon(calc)}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" disabled={!r.included} value={r.appliedFeeStr} placeholder={String(calc)}
                          onChange={(e) => setRow(m.id, { appliedFeeStr: e.target.value })}
                          className="w-32 text-right border border-slate-200 rounded px-2 py-1 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">포함 {included.length}개 기관 · 산정수수료 합계</span>
            <span className="font-semibold text-slate-700">{fmtWon(totalCalc)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          과제를 선택하면 참여기관 목록이 자동으로 불러와집니다
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={handleSubmit} disabled={!projectId || included.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {included.length > 0 ? `${included.length}개 기관 수수료 생성` : "수수료 생성"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// 수수료 수정 폼 (기관유형·요율·신청수수료·상태 편집)
// ────────────────────────────────────────────
const INSTITUTION_TYPES: InstitutionType[] = [
  "대기업", "중견기업", "중소기업", "스타트업", "대학", "정부출연연구소", "공공기관",
];

function TermEditForm({ target, onClose }: { target: TermFee; onClose: () => void }) {
  const { companyClasses } = useStore();

  const rateMap = useMemo(() => {
    const m: Record<string, number> = {};
    companyClasses.forEach((c) => { m[c.name] = c.feeRate; });
    return m;
  }, [companyClasses]);

  const [institutionType, setInstitutionType] = useState<InstitutionType>(target.institutionType as InstitutionType);
  const [feeRate, setFeeRate]   = useState(target.feeRate);
  const [appliedFee, setAppliedFee] = useState(target.appliedFee);
  const [status, setStatus]         = useState(target.status);

  const calculatedFee = Math.round((target.budget * feeRate) / 100);

  function handleTypeChange(type: InstitutionType) {
    setInstitutionType(type);
    const newRate = rateMap[TYPE_TO_CLASS[type] ?? type];
    if (newRate !== undefined) setFeeRate(newRate);
  }

  function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
        {children}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* 읽기 전용 기본 정보 */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
        <p className="text-xs font-medium text-slate-400 mb-2.5">기본 정보 (읽기 전용)</p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
          {([
            ["과제번호", <span className="font-mono">{target.projectNumber}</span>],
            ["과제명",   target.projectName],
            ["기관명",   target.institutionName],
            ["연차",     `${target.termYear}년 ${target.termNumber}연차`],
            ["사업비",   fmtWon(target.budget)],
          ] as [string, React.ReactNode][]).map(([label, value], i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-slate-400 shrink-0 w-16">{label}</span>
              <span className="text-slate-700">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 연차별 변경 가능 항목 */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-4 py-3 text-xs text-blue-700">
        기관 규모가 연차 중 변경된 경우 유형과 요율을 수정하세요. 표준수수료가 자동 재산정됩니다.
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="기관유형">
          <select className={selectCls} value={institutionType} onChange={(e) => handleTypeChange(e.target.value as InstitutionType)}>
            {INSTITUTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="수수료율 (%)">
          <input className={inputCls} type="number" min={0} step={0.1} value={feeRate}
            onChange={(e) => setFeeRate(Number(e.target.value))} />
        </Field>
        <Field label="표준수수료 (자동계산)">
          <div className="w-full text-sm border border-slate-100 rounded-lg px-3 py-2 bg-slate-50 text-slate-600 font-medium">
            {fmtWon(calculatedFee)}
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="신청수수료(원) — 협의 후 조정">
          <input className={inputCls} type="number" min={0} value={appliedFee}
            onChange={(e) => setAppliedFee(Number(e.target.value))} />
        </Field>
        <Field label="상태">
          <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as TermFee["status"])}>
            <option value="DRAFT">초안</option>
            <option value="CONFIRMED">확정</option>
            <option value="BILLED">청구완료</option>
          </select>
        </Field>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={() => {
            updateTermFee(target.id, { institutionType, feeRate, calculatedFee, appliedFee, status });
            onClose();
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          저장
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────
// 메인 페이지
// ────────────────────────────────────────────
export default function FeesPage() {
  const allRows    = useTermRows();
  const [search, setSearch]           = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [modal, setModal]             = useState<ModalState | null>(null);

  const filtered = useMemo(
    () =>
      allRows.filter(
        (r) =>
          (statusFilter === "ALL" || r.status === statusFilter) &&
          (search === "" ||
            r.projectName.includes(search) ||
            r.projectNumber.includes(search) ||
            r.leadInstitutionName.includes(search))
      ),
    [allRows, search, statusFilter]
  );

  const totalStandard  = filtered.reduce((s, r) => s + r.standardFee,      0);
  const totalApplied   = filtered.reduce((s, r) => s + r.appliedFee,       0);
  const totalUnclaimed = filtered.reduce((s, r) => r.unclaimedRecord?.status === "PENDING" ? s + r.unclaimedAmount : s, 0);
  const totalReceivable = filtered.reduce((s, r) => s + r.receivableAmount, 0);

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">연차별 수수료 관리 · 과제+연차 기준 · 전체 {allRows.length}건</p>
        <button onClick={() => setModal({ mode: "generate" })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" />
          </svg>
          연차 수수료 생성
        </button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "표준수수료 합계",      value: fmtWon(totalStandard),   color: "text-slate-800" },
          { label: "신청수수료 합계",      value: fmtWon(totalApplied),    color: "text-blue-600"  },
          { label: "연도별 미청구수수료",  value: fmtWon(totalUnclaimed),  color: "text-amber-600" },
          { label: "미수금 합계",          value: fmtWon(totalReceivable), color: "text-red-500"   },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 검색 + 필터 */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-slate-400 shrink-0">
          <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9z" clipRule="evenodd" />
        </svg>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="과제번호, 과제명, 주관기관 검색..."
          className="flex-1 text-sm outline-none text-slate-700 placeholder-slate-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0">
          <option value="ALL">전체 상태</option>
          <option value="BILLED">청구완료</option>
          <option value="CONFIRMED">확정</option>
          <option value="DRAFT">초안</option>
        </select>
      </div>

      {/* 메인 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="w-8 px-2 py-3" />
                <th className="text-left   px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">과제번호</th>
                <th className="text-left   px-4 py-3 text-xs font-medium text-slate-500">과제명 / 주관기관</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연차</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">표준수수료</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">신청수수료</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구수수료</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">연도별 미청구</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">당해 최종청구액</th>
                <th className="text-right  px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">미수금</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-sm text-slate-400">
                    검색 결과가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.flatMap((row) => {
                  const isExpanded = expandedKey === row.key;
                  return [
                    <tr
                      key={row.key}
                      className={`border-b border-slate-50 transition-colors ${isExpanded ? "bg-blue-50/30" : "hover:bg-slate-50"}`}
                    >
                      {/* 펼치기 버튼 */}
                      <td className="px-2 py-3 text-center">
                        <button
                          onClick={() => toggleExpand(row.key)}
                          className={`p-1 rounded transition-colors ${isExpanded ? "text-blue-600 bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                          title={isExpanded ? "접기" : "상세보기"}
                        >
                          {isExpanded ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500 whitespace-nowrap">{row.projectNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-800 text-xs max-w-xs truncate">{row.projectName}</p>
                        <p className="text-xs text-blue-600 font-medium mt-0.5">{row.leadInstitutionName}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-slate-600 whitespace-nowrap">
                        {row.termYear}년 {row.termNumber}연차
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">{fmtWon(row.standardFee)}</td>
                      <td className="px-4 py-3 text-right text-xs font-medium text-slate-800 whitespace-nowrap">{fmtWon(row.appliedFee)}</td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                        <span className={row.billedFee > 0 ? "text-green-700 font-medium" : "text-slate-300"}>
                          {row.billedFee > 0 ? fmtWon(row.billedFee) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                        {row.unclaimedAmount > 0 ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={row.unclaimedRecord?.status === "PENDING" ? "text-amber-600 font-bold" : "text-slate-500"}>
                              {fmtWon(row.unclaimedAmount)}
                            </span>
                            {row.unclaimedRecord && (
                              <StatusBadge label={UC_STATUS[row.unclaimedRecord.status].label} color={UC_STATUS[row.unclaimedRecord.status].color} />
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-bold whitespace-nowrap">
                        <span className={row.finalBilledAmount > 0 ? "text-slate-800" : "text-slate-300"}>
                          {row.finalBilledAmount > 0 ? fmtWon(row.finalBilledAmount) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs whitespace-nowrap">
                        <span className={row.receivableAmount > 0 ? "text-red-600 font-bold" : "text-slate-300"}>
                          {row.receivableAmount > 0 ? fmtWon(row.receivableAmount) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge label={TF_STATUS[row.status].label} color={TF_STATUS[row.status].color} />
                      </td>
                    </tr>,
                    isExpanded && (
                      <ExpandedDetail
                        key={`${row.key}-detail`}
                        row={row}
                        onEditFee={(tf) => setModal({ mode: "edit", target: tf })}
                      />
                    ),
                  ].filter(Boolean);
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}건 표시 (전체 {allRows.length}건)
        </div>
      </div>

      {modal?.mode === "generate" && (
        <Modal title="연차 수수료 생성" onClose={() => setModal(null)} size="xl">
          <TermGenerateForm onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "edit" && (
        <Modal title="수수료 수정" onClose={() => setModal(null)} size="md">
          <TermEditForm target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
