"use client";

import { useState } from "react";
import Link from "next/link";
import { FiEdit2, FiCheck, FiX } from "react-icons/fi";
import { useStore, updateInstitution } from "@/lib/store";
import { validateInstitutionName, findAgenciesNewlyMatchingName } from "@/lib/institution-name";

// 목록에서 기관명을 직접 입력해 정정한다 — 기관 ID는 그대로 두고 기관 원본(수행기관)의 이름만 바꾸므로
// 과제·청구·수금 연결은 유지되고, 같은 기관을 쓰는 다른 과제에도 새 이름이 반영된다. 과제에 복사된
// 기관명·전담기관 소속기관 목록은 updateInstitution(서버 포함)이 함께 맞춘다.
export default function InstitutionNameInlineEdit({
  institutionId,
  displayName,
  canEdit,
}: {
  institutionId: string;
  displayName: string;
  canEdit: boolean;
}) {
  const { institutions, projectMembers, fundingAgencies } = useStore();
  // null이면 보기 상태, 문자열이면 입력 중인 값.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const institution = institutions.find((i) => i.id === institutionId);

  function startEdit() {
    if (!institution) return;
    // 목록에 보이는 이름이 과제에 복사된 옛 이름일 수 있어, 입력칸은 기관 원본 이름에서 시작한다.
    setDraft(institution.name);
    setError("");
  }

  function cancel() {
    setDraft(null);
    setError("");
  }

  function save() {
    if (draft === null || !institution) return cancel();
    const checked = validateInstitutionName(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (checked.name === institution.name) return cancel();

    const projectCount = new Set(projectMembers.filter((m) => m.institutionId === institution.id).map((m) => m.projectId)).size;
    const lines = [
      `기관명을 "${institution.name}" → "${checked.name}"(으)로 바꿉니다.`,
      `이 기관이 참여한 과제 ${projectCount}건 전체에 새 이름이 반영됩니다.`,
    ];
    const affiliated = fundingAgencies.filter((a) => (a.affiliatedInstitutionNames ?? []).includes(institution.name));
    if (affiliated.length > 0) {
      lines.push(`전담기관 ${affiliated.map((a) => a.shortName).join(", ")}의 소속기관 목록도 새 이름으로 함께 바뀌어 기존 전담기관 판정이 유지됩니다.`);
    }
    const newlyMatching = findAgenciesNewlyMatchingName(fundingAgencies, institution.name, checked.name);
    if (newlyMatching.length > 0) {
      const names = newlyMatching.map((a) => a.shortName).join(", ");
      lines.push(`주의: 새 이름이 ${names}의 소속기관 목록에 있어, 이 기관이 주관인 과제의 정보를 저장하면 전담기관이 ${names}(으)로 바뀔 수 있습니다.`);
    }
    lines.push("", "계속하시겠습니까?");
    if (!confirm(lines.join("\n"))) return;

    updateInstitution(institution.id, { name: checked.name });
    cancel();
  }

  if (draft === null) {
    return (
      <div className="flex items-center gap-0.5 min-w-0">
        <Link href={`/institutions/${institutionId}`} className="block truncate text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors" title={displayName}>
          {displayName}
        </Link>
        {canEdit && institution && (
          <button
            type="button"
            onClick={startEdit}
            title="기관명 수정"
            className="shrink-0 p-0.5 rounded text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-blue-600 hover:bg-blue-50 transition"
          >
            <FiEdit2 size={11} />
          </button>
        )}
      </div>
    );
  }

  // 열 너비가 좁아(table-fixed) 입력칸은 셀 밖 오른쪽 칸 위로 겹쳐 띄운다. 왼쪽 고정열(z-10)과 헤더보다는
  // 아래에 그려지도록 z-index를 낮게 둔다.
  return (
    <div className="relative z-5 w-64">
      <div className="flex items-center gap-1 rounded-lg border border-blue-200 bg-white p-1 shadow-lg">
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) save();
            else if (e.key === "Escape") cancel();
          }}
          aria-invalid={!!error}
          className={`min-w-0 flex-1 rounded border px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 ${
            error ? "border-red-300 focus:ring-red-500/30" : "border-slate-200 focus:ring-blue-500/30"
          }`}
        />
        <button type="button" onClick={save} title="저장 (Enter)" className="shrink-0 rounded p-1 text-blue-600 hover:bg-blue-50">
          <FiCheck size={13} />
        </button>
        <button type="button" onClick={cancel} title="취소 (Esc)" className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100">
          <FiX size={13} />
        </button>
      </div>
      {error && <p className="mt-0.5 text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
