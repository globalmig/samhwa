"use client";

import { Fragment, useMemo } from "react";
import { useStore, updatePageAccess, updateWriteAccess } from "@/lib/store";
import { PAGE_ACCESS_CATALOG, WRITE_ACCESS_CATALOG, type Role } from "@/lib/permissions";

const ROLES: { key: Role; label: string }[] = [
  { key: "ADMIN", label: "시스템 관리자" },
  { key: "ACCOUNTANT", label: "회계 담당자" },
  { key: "SETTLEMENT", label: "전담기관 담당자" },
  { key: "VIEWER", label: "조회 전용" },
];

function toggleRole(roles: Role[], role: Role, checked: boolean): Role[] {
  if (checked) return roles.includes(role) ? roles : [...roles, role];
  return roles.filter((r) => r !== role);
}

function RoleCheckbox({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      title={disabled ? "시스템 관리자는 항상 모든 권한을 가지며 해제할 수 없습니다" : undefined}
      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
    />
  );
}

export default function AdminPermissionsPage() {
  const { pageAccess, writeAccess } = useStore();

  const writeGroups = useMemo(() => {
    const groups: { group: string; items: typeof WRITE_ACCESS_CATALOG }[] = [];
    for (const item of WRITE_ACCESS_CATALOG) {
      let g = groups.find((g) => g.group === item.group);
      if (!g) {
        g = { group: item.group, items: [] };
        groups.push(g);
      }
      g.items.push(item);
    }
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">시스템 관리자 · 역할별 페이지 접근 및 기능별 권한 설정</p>
        <p className="text-xs text-slate-400 mt-1">
          시스템 관리자(ADMIN)는 항상 모든 페이지·기능에 접근할 수 있어 체크를 해제할 수 없습니다.
          여기서 바꾼 설정은 즉시 적용됩니다.
        </p>
      </div>

      {/* 페이지 접근 권한 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">페이지 접근 권한</p>
          <p className="text-xs text-slate-500 mt-0.5">역할별로 어떤 메뉴/페이지에 들어갈 수 있는지 설정합니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">페이지</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PAGE_ACCESS_CATALOG.map((item) => {
                const roles = pageAccess[item.key] ?? [];
                return (
                  <tr key={item.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-2.5 text-slate-700 whitespace-nowrap">{item.label}</td>
                    {ROLES.map((r) => (
                      <td key={r.key} className="text-center px-3 py-2.5">
                        <RoleCheckbox
                          checked={r.key === "ADMIN" ? true : roles.includes(r.key)}
                          disabled={r.key === "ADMIN"}
                          onChange={(checked) => updatePageAccess(item.key, toggleRole(roles, r.key, checked))}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기능별 쓰기 권한 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">기능별 쓰기 권한</p>
          <p className="text-xs text-slate-500 mt-0.5">공문 발송, 세금계산서 발행 등 개별 기능을 역할별로 사용할 수 있는지 설정합니다.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">기능</th>
                {ROLES.map((r) => (
                  <th key={r.key} className="text-center px-3 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {writeGroups.map((g) => (
                <Fragment key={g.group}>
                  <tr className="bg-slate-50/70">
                    <td colSpan={ROLES.length + 1} className="px-5 py-1.5 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                      {g.group}
                    </td>
                  </tr>
                  {g.items.map((item) => {
                    const roles = writeAccess[item.key] ?? [];
                    return (
                      <tr key={item.key} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors">
                        <td className="px-5 py-2.5 text-slate-700">{item.label}</td>
                        {ROLES.map((r) => (
                          <td key={r.key} className="text-center px-3 py-2.5">
                            <RoleCheckbox
                              checked={r.key === "ADMIN" ? true : roles.includes(r.key)}
                              disabled={r.key === "ADMIN"}
                              onChange={(checked) => updateWriteAccess(item.key, toggleRole(roles, r.key, checked))}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
