"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { FiEdit2, FiExternalLink } from "react-icons/fi";
import { useStore, addFundingAgency, updateFundingAgency, updateAgencyGuide } from "@/lib/store";
import { type FundingAgency, type FeePolicy, type AgencyGuideRow as GuideRow, type AgencyGuideTab as GuideTab } from "@/lib/mock";
import { AGENCY_GUIDE } from "@/lib/agency-guide";
import { fmtDate, fmtWon } from "@/lib/utils";
import StatusBadge from "@/components/common/StatusBadge";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import { useCanWrite } from "@/lib/permissions";


function AgencyGuideModal({ agency }: { agency: FundingAgency }) {
  const { agencyGuides } = useStore();
  const canEdit = useCanWrite("funding-agencies");
  const baseTabs: GuideTab[] = agencyGuides[agency.shortName] ?? AGENCY_GUIDE[agency.shortName] ?? [];

  const [activeTab, setActiveTab] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<GuideTab[]>([]);

  const displayTabs = isEditing ? draft : baseTabs;
  const currentTab = displayTabs[Math.min(activeTab, displayTabs.length - 1)];

  function startEdit() { setDraft(JSON.parse(JSON.stringify(baseTabs))); setIsEditing(true); }
  function cancelEdit() { setIsEditing(false); }
  function saveEdit() { updateAgencyGuide(agency.shortName, draft); setIsEditing(false); }

  function setTabLabel(ti: number, label: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : { ...t, label }));
  }
  function setCaption(ti: number, tbi: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, caption: v || undefined }),
    }));
  }
  function setNote(ti: number, tbi: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, note: v || undefined }),
    }));
  }
  function setCell(ti: number, tbi: number, ri: number, ci: number, v: string) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.map((row, k) => k !== ri ? row : {
          ...row, cells: row.cells.map((c, l) => l !== ci ? c : v),
        }),
      }),
    }));
  }
  function toggleRowEm(ti: number, tbi: number, ri: number) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.map((row, k) => k !== ri ? row : { ...row, em: !row.em }),
      }),
    }));
  }
  function addRow(ti: number, tbi: number) {
    const colCount = displayTabs[ti]?.tables[tbi]?.headers.length ?? 1;
    const newRow: GuideRow = { cells: Array(colCount).fill("") as string[] };
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : { ...tbl, rows: [...tbl.rows, newRow] }),
    }));
  }
  // 특정 행 바로 아래에 새 빈 행을 끼워 넣는다 — "행 추가"는 항상 맨 아래에만 붙는데, 표 중간에
  // 항목을 넣고 싶을 때(예: 상시점검과 연차상시점검 사이) 쓴다.
  function insertRowAfter(ti: number, tbi: number, ri: number) {
    const colCount = displayTabs[ti]?.tables[tbi]?.headers.length ?? 1;
    const newRow: GuideRow = { cells: Array(colCount).fill("") as string[] };
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: [...tbl.rows.slice(0, ri + 1), newRow, ...tbl.rows.slice(ri + 1)],
      }),
    }));
  }
  function removeRow(ti: number, tbi: number, ri: number) {
    setDraft((d) => d.map((t, i) => i !== ti ? t : {
      ...t, tables: t.tables.map((tbl, j) => j !== tbi ? tbl : {
        ...tbl, rows: tbl.rows.filter((_, k) => k !== ri),
      }),
    }));
  }

  if (!currentTab) return <div className="p-6 text-center text-sm text-slate-400">운용 안내 정보가 없습니다.</div>;

  return (
    <div>
      {/* 탭바 + 편집 컨트롤 */}
      <div className="flex items-stretch justify-between border-b border-slate-200 sticky top-0 bg-white z-10">
        <div className="flex px-2 gap-0.5 overflow-x-auto">
          {displayTabs.map((tab, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                i === activeTab ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              {isEditing ? (
                <input
                  value={tab.label}
                  onChange={(e) => { e.stopPropagation(); setTabLabel(i, e.target.value); }}
                  onClick={(e) => { e.stopPropagation(); setActiveTab(i); }}
                  className="bg-transparent outline-none border-b border-dashed border-blue-300 text-sm font-medium w-24 text-center"
                />
              ) : tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 px-4 shrink-0 border-l border-slate-100">
          {isEditing ? (
            <>
              <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
              <button onClick={saveEdit} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">저장</button>
            </>
          ) : canEdit && (
            <button onClick={startEdit} className="px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
              편집
            </button>
          )}
        </div>
      </div>

      {/* 탭 내용 */}
      <div className={`p-6 space-y-6 ${isEditing ? "bg-amber-50/20" : ""}`}>
        {currentTab.tables.map((tbl, tbi) => (
          <div key={tbi} className="space-y-2">
            {isEditing ? (
              <input
                value={tbl.caption ?? ""}
                onChange={(e) => setCaption(activeTab, tbi, e.target.value)}
                placeholder="표 제목 (선택)"
                className="text-xs font-semibold text-slate-600 uppercase tracking-wide border-b border-dashed border-slate-300 outline-none bg-transparent w-full placeholder-slate-300"
              />
            ) : tbl.caption && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{tbl.caption}</p>
            )}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {tbl.headers.map((h, hi) => (
                      <th key={hi} className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                    ))}
                    {isEditing && <th className="px-2 py-2.5 text-xs font-semibold text-slate-400 text-center w-16">조작</th>}
                  </tr>
                </thead>
                <tbody>
                  {tbl.rows.map((row, ri) => (
                    <tr key={ri} className={`border-b border-slate-50 last:border-0 ${row.em ? "bg-amber-50/70" : isEditing ? "" : "hover:bg-slate-50/50"}`}>
                      {row.cells.map((cell, ci) => {
                        const isSettlement = cell.includes("정산") && cell.includes("&");
                        const isExempt = cell.includes("면제") && !cell.includes("아님") && !cell.includes("없음");
                        const isFee = cell.includes("%");
                        const cellCls = isSettlement ? "text-violet-700 font-medium" : isExempt ? "text-emerald-700 font-medium" : isFee && row.em ? "font-bold text-blue-700" : "text-slate-700";
                        return (
                          <td key={ci} className={`px-4 py-2.5 whitespace-nowrap ${isEditing ? "text-slate-700" : cellCls}`}>
                            {isEditing ? (
                              <input
                                value={cell}
                                onChange={(e) => setCell(activeTab, tbi, ri, ci, e.target.value)}
                                className="w-full outline-none bg-transparent border-b border-dashed border-slate-300 focus:border-blue-400 text-sm min-w-15"
                              />
                            ) : cell}
                          </td>
                        );
                      })}
                      {isEditing && (
                        <td className="px-2 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => insertRowAfter(activeTab, tbi, ri)}
                              title="이 행 아래에 새 행 추가"
                              className="w-5 h-5 rounded text-[10px] flex items-center justify-center bg-blue-50 text-blue-500 hover:bg-blue-100 transition-colors"
                            >+</button>
                            <button
                              onClick={() => toggleRowEm(activeTab, tbi, ri)}
                              title="강조 토글"
                              className={`w-5 h-5 rounded text-[10px] flex items-center justify-center transition-colors ${row.em ? "bg-amber-200 text-amber-700" : "bg-slate-100 text-slate-400 hover:bg-slate-200"}`}
                            >●</button>
                            <button
                              onClick={() => removeRow(activeTab, tbi, ri)}
                              title="행 삭제"
                              className="w-5 h-5 rounded text-[10px] flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                            >✕</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isEditing && (
              <button onClick={() => addRow(activeTab, tbi)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 px-1">
                + 행 추가
              </button>
            )}
            {isEditing ? (
              <textarea
                value={tbl.note ?? ""}
                onChange={(e) => setNote(activeTab, tbi, e.target.value)}
                placeholder="※ 비고 (선택)"
                className="w-full text-[11px] text-slate-500 bg-white rounded-lg px-3 py-2 border border-slate-200 outline-none resize-none placeholder-slate-300"
                rows={2}
              />
            ) : tbl.note && (
              <p className="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">※ {tbl.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type ModalState = { mode: "add" } | { mode: "edit"; target: FundingAgency } | { mode: "detail"; target: FundingAgency } | { mode: "guide"; target: FundingAgency };

const EMPTY: Omit<FundingAgency, "id"> = {
  name: "",
  shortName: "",
  code: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  status: "ACTIVE",
  registeredAt: new Date().toISOString().slice(0, 10),
  website: "",
  noticeRecipientScope: "LEAD_ONLY",
};

const NOTICE_SCOPE_LABEL: Record<FundingAgency["noticeRecipientScope"], string> = {
  LEAD_ONLY: "주관기관만",
  LEAD_AND_PARTICIPANTS: "주관+참여기관 모두",
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

function AgencyForm({
  agencyId,
  initial,
  feePolicies,
  onSubmit,
  onClose,
}: {
  agencyId: string | null;
  initial: Omit<FundingAgency, "id">;
  feePolicies: FeePolicy[];
  onSubmit: (d: Omit<FundingAgency, "id">) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const s = (k: keyof typeof form, v: unknown) => setForm((p) => ({ ...p, [k]: v }));

  const activePolicy = agencyId
    ? feePolicies.find((p) => p.agencyId === agencyId && p.status === "ACTIVE")
    : undefined;
  const activeCommonPolicy = feePolicies.find((p) => p.agencyId === null && p.status === "ACTIVE");

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="정식명칭">
          <input className={inputCls} value={form.name} onChange={(e) => s("name", e.target.value)} placeholder="산업기술평가관리원" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="약칭">
            <input className={inputCls} value={form.shortName} onChange={(e) => s("shortName", e.target.value)} placeholder="KEIT" />
          </Field>
          <Field label="기관 코드">
            <input className={inputCls} value={form.code} onChange={(e) => s("code", e.target.value)} placeholder="KEIT" />
          </Field>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="담당자명">
          <input className={inputCls} value={form.contactName} onChange={(e) => s("contactName", e.target.value)} placeholder="홍담당" />
        </Field>
        <Field label="이메일">
          <input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => s("contactEmail", e.target.value)} placeholder="info@agency.re.kr" />
        </Field>
        <Field label="연락처">
          <input className={inputCls} value={form.contactPhone} onChange={(e) => s("contactPhone", e.target.value)} placeholder="042-000-0000" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="수수료 정책 (진행중인 정책 자동 적용)">
          <div className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 flex items-center justify-between gap-2">
            {activePolicy ? (
              <span className="text-slate-700">
                <span className="font-medium">{activePolicy.name}</span> ({activePolicy.version}) · 자체 정책
              </span>
            ) : activeCommonPolicy ? (
              <span className="text-slate-500">
                {activeCommonPolicy.name} ({activeCommonPolicy.version}) · 공통 정책 사용 중
              </span>
            ) : (
              <span className="text-slate-400">
                {agencyId ? "적용 중인 정책 없음" : "저장 후 자동 적용됩니다"}
              </span>
            )}
            <Link href="/company-class" className="text-xs text-blue-600 hover:underline whitespace-nowrap">
              정책 관리 →
            </Link>
          </div>
        </Field>
        <Field label="상태">
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as FundingAgency["status"])}>
            <option value="ACTIVE">활성</option>
            <option value="INACTIVE">비활성</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="공문·세금계산서 발송 대상">
          <select className={selectCls} value={form.noticeRecipientScope} onChange={(e) => s("noticeRecipientScope", e.target.value as FundingAgency["noticeRecipientScope"])}>
            <option value="LEAD_ONLY">주관기관만</option>
            <option value="LEAD_AND_PARTICIPANTS">주관+참여기관 모두</option>
          </select>
        </Field>
        <Field label="등록일">
          <DateInput className="w-full" value={form.registeredAt} onChange={(v) => s("registeredAt", v)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="웹사이트 (선택)">
          <input className={inputCls} value={form.website ?? ""} onChange={(e) => s("website", e.target.value)} placeholder="https://www.agency.re.kr" />
        </Field>
      </div>

      {/* 소속기관 자동판별 — RDA1/RDA2처럼 실제로는 같은 기관(예: 농촌진흥청)을 정책이 다른 여러
          전담기관 레코드로 나눠 관리할 때, 주관기관명으로 어느 레코드를 써야 할지 자동으로 골라준다
          (resolveAutoDetectedAgencyId). 소속기관 이름은 하드코딩이 아니라 여기서 직접 관리한다 —
          실제 업무에서 새로 계약을 맺는 소속기관이 계속 늘어날 수 있고, 이름이 정확히 일치해야
          인식되므로(오탈자·띄어쓰기 포함) 담당자가 직접 정확한 명칭으로 등록/수정할 수 있어야 한다. */}
      <div className="space-y-2 border border-slate-200 rounded-lg p-3 bg-slate-50/50">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={form.autoDetectByLeadInstitution ?? false}
            onChange={(e) => s("autoDetectByLeadInstitution", e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
          />
          소속기관 자동판별 — 주관기관명이 아래 목록과 일치하면 다른 전담기관을 선택해도 이 전담기관으로 자동 교정됩니다 (예: RDA1/RDA2)
        </label>
        {form.autoDetectByLeadInstitution && (
          <Field label="소속기관 목록 (한 줄에 하나씩 — 주관기관명이 정확히 일치해야 인식됩니다)">
            <textarea
              className={`${inputCls} font-mono resize-y`}
              rows={5}
              value={(form.affiliatedInstitutionNames ?? []).join("\n")}
              onChange={(e) => s("affiliatedInstitutionNames", e.target.value.split("\n").map((v) => v.trim()).filter(Boolean))}
              placeholder={"농촌진흥청\n국립원예특작과학원\n산림원예특작과학원"}
            />
          </Field>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={() => onSubmit(form)} disabled={!form.name || !form.shortName} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors">저장</button>
      </div>
    </div>
  );
}

function DetailModal({ agency, projects, termFees, feePolicies, onClose }: {
  agency: FundingAgency;
  projects: { id: string; projectName: string; projectNumber: string; status: string; currentTerm: number; totalTerms: number }[];
  termFees: { projectNumber: string; appliedFee: number; status: string }[];
  feePolicies: FeePolicy[];
  onClose: () => void;
}) {
  const agencyProjects = projects.filter((p) => (p as unknown as { agencyId: string }).agencyId === agency.id);
  const agencyProjectNumbers = new Set(agencyProjects.map((p) => p.projectNumber));
  const agencyFees = termFees.filter((f) => agencyProjectNumbers.has(f.projectNumber));
  const totalFee = agencyFees.reduce((s, f) => s + f.appliedFee, 0);
  const billedFee = agencyFees.filter((f) => f.status === "BILLED").reduce((s, f) => s + f.appliedFee, 0);
  const ownPolicy = feePolicies.find((p) => p.agencyId === agency.id && p.status === "ACTIVE");

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "관리 과제", value: `${agencyProjects.length}건` },
          { label: "수수료 합계", value: fmtWon(totalFee) },
          { label: "청구 완료", value: fmtWon(billedFee) },
        ].map((c) => (
          <div key={c.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-xs text-slate-400">담당자</span><p className="text-slate-700 mt-0.5">{agency.contactName} · {agency.contactPhone}</p></div>
        <div><span className="text-xs text-slate-400">이메일</span><p className="text-slate-700 mt-0.5">{agency.contactEmail}</p></div>
        <div><span className="text-xs text-slate-400">수수료 정책</span><p className="text-slate-700 mt-0.5">{ownPolicy ? `${ownPolicy.name} (${ownPolicy.version}) — 자체 정책` : "공통 정책 사용"}</p></div>
        <div><span className="text-xs text-slate-400">공문·세금계산서 발송 대상</span><p className="text-slate-700 mt-0.5">{NOTICE_SCOPE_LABEL[agency.noticeRecipientScope]}</p></div>
        <div><span className="text-xs text-slate-400">웹사이트</span>
          {agency.website ? (
            <a href={agency.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline mt-0.5 text-sm">
              {agency.website} <FiExternalLink size={11} />
            </a>
          ) : <p className="text-slate-300 mt-0.5">—</p>}
        </div>
      </div>

      {agencyProjects.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">관리 과제 목록</p>
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="text-left px-4 py-2.5">과제번호</th>
                  <th className="text-left px-4 py-2.5">과제명</th>
                  <th className="text-center px-3 py-2.5">연차</th>
                  <th className="text-center px-3 py-2.5">상태</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {agencyProjects.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-blue-50/40 cursor-pointer transition-colors"
                    onClick={() => window.open(`/projects/${p.id}`, "_blank")}
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-500 text-[11px]">{p.projectNumber}</td>
                    <td className="px-4 py-2.5 max-w-xs truncate">
                      <span className="text-blue-600 font-medium hover:underline">{p.projectName}</span>
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">{p.currentTerm}/{p.totalTerms}연차</td>
                    <td className="px-3 py-2.5 text-center">
                      <StatusBadge
                        label={p.status === "ACTIVE" ? "진행중" : p.status === "COMPLETED" ? "완료" : "중단"}
                        color={p.status === "ACTIVE" ? "green" : p.status === "COMPLETED" ? "slate" : "amber"}
                      />
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-300">
                      <FiExternalLink size={12} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">닫기</button>
      </div>
    </div>
  );
}

export default function FundingAgenciesPage() {
  const canEdit = useCanWrite("funding-agencies");
  const { fundingAgencies, projects, termFees, feePolicies } = useStore();
  const [modal, setModal] = useState<ModalState | null>(null);
  const [filterName,      setFilterName]      = useState("");
  const [filterShortName, setFilterShortName] = useState("");
  const [filterCode,      setFilterCode]      = useState("");

  const filtered = useMemo(
    () => fundingAgencies.filter((a) =>
      (filterName      === "" || a.name.includes(filterName)) &&
      (filterShortName === "" || a.shortName.includes(filterShortName)) &&
      (filterCode      === "" || a.code.includes(filterCode))
    ),
    [fundingAgencies, filterName, filterShortName, filterCode]
  );

  const stats = useMemo(() => {
    return fundingAgencies.map((agency) => {
      const agencyProjects = projects.filter((p) => (p as unknown as { agencyId: string }).agencyId === agency.id);
      const nums = new Set(agencyProjects.map((p) => p.projectNumber));
      const fees = termFees.filter((f) => nums.has(f.projectNumber));
      return {
        id: agency.id,
        projectCount: agencyProjects.length,
        totalFee: fees.reduce((s, f) => s + f.appliedFee, 0),
        billedFee: fees.filter((f) => f.status === "BILLED").reduce((s, f) => s + f.appliedFee, 0),
      };
    });
  }, [fundingAgencies, projects, termFees]);

  const statsById = Object.fromEntries(stats.map((s) => [s.id, s]));

  function handleSubmit(data: Omit<FundingAgency, "id">) {
    if (modal?.mode === "add") addFundingAgency(data);
    else if (modal?.mode === "edit") updateFundingAgency(modal.target.id, data);
    setModal(null);
  }

  const totalProjects = stats.reduce((s, a) => s + a.projectCount, 0);
  const totalFee = stats.reduce((s, a) => s + a.totalFee, 0);
  const activeCount = fundingAgencies.filter((a) => a.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전담기관 · 총 {fundingAgencies.length}개 기관</p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setModal({ mode: "add" })} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5z" /></svg>
              전담기관 추가
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전담기관 수", value: `${fundingAgencies.length}개` },
          { label: "활성 기관", value: `${activeCount}개` },
          { label: "관리 과제 수", value: `${totalProjects}건` },
          { label: "수수료 합계", value: fmtWon(totalFee) },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className="text-sm font-bold text-slate-800 mt-0.5">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 grid grid-cols-3 gap-3">
        {[
          { label: "기관명", value: filterName,      onChange: setFilterName      },
          { label: "약칭",   value: filterShortName, onChange: setFilterShortName },
          { label: "코드",   value: filterCode,      onChange: setFilterCode      },
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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-xs font-medium text-slate-500">전담기관명</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">약칭</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료 정책</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">발송 대상</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리 과제</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">수수료 합계</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">청구 완료</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">상태</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">등록일</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">검색 결과가 없습니다</td></tr>
            ) : (
              filtered.map((agency) => {
                const st = statsById[agency.id] ?? { projectCount: 0, totalFee: 0, billedFee: 0 };
                const ownPolicy = feePolicies.find((p) => p.agencyId === agency.id && p.status === "ACTIVE");
                return (
                  <tr key={agency.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <button
                        onClick={() => setModal({ mode: "detail", target: agency })}
                        className="text-left"
                      >
                        <p className="font-semibold text-slate-800 hover:text-blue-600 transition-colors">{agency.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{agency.contactName} · {agency.contactPhone}</p>
                      </button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-block font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{agency.shortName}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {ownPolicy ? (
                        <StatusBadge label="자체 정책" color="purple" />
                      ) : (
                        <StatusBadge label="공통 정책" color="slate" />
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge
                        label={NOTICE_SCOPE_LABEL[agency.noticeRecipientScope]}
                        color={agency.noticeRecipientScope === "LEAD_AND_PARTICIPANTS" ? "amber" : "slate"}
                      />
                    </td>
                    <td className="px-4 py-4 text-center text-sm font-medium text-slate-700">{st.projectCount}건</td>
                    <td className="px-4 py-4 text-right text-sm font-medium text-slate-800 whitespace-nowrap">{fmtWon(st.totalFee)}</td>
                    <td className="px-4 py-4 text-right text-sm text-green-700 font-medium whitespace-nowrap">{fmtWon(st.billedFee)}</td>
                    <td className="px-4 py-4 text-center">
                      <StatusBadge label={agency.status === "ACTIVE" ? "활성" : "비활성"} color={agency.status === "ACTIVE" ? "green" : "slate"} />
                    </td>
                    <td className="px-4 py-4 text-center text-xs text-slate-500 whitespace-nowrap">{fmtDate(agency.registeredAt)}</td>
                    <td className="px-4 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {AGENCY_GUIDE[agency.shortName] && (
                          <button
                            onClick={() => setModal({ mode: "guide", target: agency })}
                            className="px-2 py-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors whitespace-nowrap"
                          >
                            운용 안내
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => setModal({ mode: "edit", target: agency })} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="수정">
                            <FiEdit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <div className="px-5 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}개 표시 (전체 {fundingAgencies.length}개)
        </div>
      </div>

      {modal?.mode === "detail" && (
        <Modal title={`${modal.target.name} (${modal.target.shortName})`} onClose={() => setModal(null)} size="xl">
          <DetailModal
            agency={modal.target}
            projects={projects}
            termFees={termFees}
            feePolicies={feePolicies}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}

      {modal?.mode === "guide" && (
        <Modal
          title={`${modal.target.name} (${modal.target.shortName}) — 운용 안내`}
          onClose={() => setModal(null)}
          size="xl"
        >
          <AgencyGuideModal agency={modal.target} />
        </Modal>
      )}

      {(modal?.mode === "add" || modal?.mode === "edit") && (
        <Modal
          title={modal.mode === "add" ? "전담기관 추가" : "전담기관 수정"}
          onClose={() => setModal(null)}
          size="xl"
        >
          <AgencyForm
            agencyId={modal.mode === "edit" ? modal.target.id : null}
            initial={modal.mode === "edit" ? modal.target : EMPTY}
            feePolicies={feePolicies}
            onSubmit={handleSubmit}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
