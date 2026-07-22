"use client";

import { useEffect, useRef, useState } from "react";
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

// 인원이 늘어나도 스캔하기 쉬운 검색형 다중선택 위젯 — 선택된 사람은 태그로 보여주고,
// 입력창에 포커스하면 이름으로 걸러지는 드롭다운에서 추가로 고를 수 있다.
export default function UserMultiSelect({ users, selectedIds, onChange, placeholder }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
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
        </div>
      )}
    </div>
  );
}
