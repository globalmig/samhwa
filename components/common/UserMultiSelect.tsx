"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";

interface UserOption {
  id: string;
  name: string;
}

interface Props {
  users: UserOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

// 드롭다운 항목 기준 대략적인 높이 — 입력창이 화면/스크롤 컨테이너 아래쪽에 가까워서 이 공간이
// 안 나오면 위로 펼친다(DispatchModal의 DispatchDropdown과 동일한 이유).
const DROPDOWN_HEIGHT_ESTIMATE = 192; // max-h-48

// 인원이 늘어나도 스캔하기 쉬운 검색형 다중선택 위젯 — 선택된 사람은 태그로 보여주고,
// 입력창에 포커스하면 이름으로 걸러지는 드롭다운에서 추가로 고를 수 있다.
export default function UserMultiSelect({ users, selectedIds, onChange, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // 드롭다운을 형제 요소로 두면(position: absolute) 이슈 등록 폼 같은 스크롤 컨테이너나
  // overflow-hidden 카드 안에서 아래쪽이 그 경계에 잘려 나머지 후보가 안 보인다 — fixed 좌표를
  // 계산해 document.body에 포탈로 그린다.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!open || !rootRef.current) { setPos(null); return; }
    const rect = rootRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < DROPDOWN_HEIGHT_ESTIMATE && rect.top > spaceBelow;
    setPos(openUpward
      ? { bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width }
      : { top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [open]);

  const selectedUsers = selectedIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserOption => !!u);

  const candidates = users.filter(
    (u) => !selectedIds.includes(u.id) && u.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  function add(id: string) {
    onChange([...selectedIds, id]);
    setQuery("");
  }
  function remove(id: string) {
    onChange(selectedIds.filter((i) => i !== id));
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className="flex flex-wrap items-center gap-1.5 min-h-[34px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus-within:ring-2 focus-within:ring-blue-500/30 focus-within:border-blue-400 cursor-text"
        onClick={() => setOpen(true)}
      >
        {selectedUsers.map((u) => (
          <span key={u.id} className="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium text-blue-700 bg-blue-50 rounded-full">
            {u.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); remove(u.id); }}
              className="text-blue-400 hover:text-blue-700 rounded-full hover:bg-blue-100 p-0.5">
              <FiX size={11} />
            </button>
          </span>
        ))}
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selectedUsers.length === 0 ? (placeholder ?? "이름으로 검색...") : ""}
          className="flex-1 min-w-[80px] text-xs outline-none text-slate-700 py-0.5 bg-transparent"
        />
      </div>
      {open && pos && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-50 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg"
          style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }}
        >
          {candidates.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">
              {users.length === selectedIds.length ? "모든 인원이 선택됨" : "검색 결과 없음"}
            </p>
          ) : (
            candidates.map((u) => (
              <button key={u.id} type="button" onClick={() => add(u.id)}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 transition-colors">
                {u.name}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
