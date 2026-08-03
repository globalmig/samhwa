"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FiChevronDown } from "react-icons/fi";
import { LuPanelLeft } from "react-icons/lu";
import { useAuth } from "@/lib/auth";
import { allowedRolesForPath } from "@/lib/permissions";

type Role = "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER";
type NavChild = { label: string; href: string; hidden?: boolean };
type NavItem = { label: string; href: string; hidden?: boolean; icon: React.ReactNode; children?: NavChild[] };
type NavGroup = { label?: string; hidden?: boolean; items: NavItem[] };

const navGroups: NavGroup[] = [
  // ── 대시보드 ───────────────────────────────────────────────
  {
    items: [
      {
        label: "통합 대시보드",
        href: "/",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4zm0 7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5zM2 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3z" />
          </svg>
        ),
      },
    ],
  },

  // ── 과제 관리 ──────────────────────────────────────────────
  // 세금계산서 발행, 공문 발송, 수금 입력, 이슈 등록은
  // 과제 전체조회 → 과제 클릭 → 상세 탭에서 처리
  {
    label: "과제 관리",
    items: [
      {
        label: "수수료 청구 관리",
        href: "/fees",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 0 0-2 2v1h16V6a2 2 0 0 0-2-2H4z" />
            <path fillRule="evenodd" d="M18 9H2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM4 13a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1zm5-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2H9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "과제 전체조회",
        href: "/projects",
        hidden: true,
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8zm0-4a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },

  // ── 수수료 규정 관리 ────────────────────────────────────────
  {
    label: "수수료 규정 관리",
    items: [
      {
        label: "전담기관 관리",
        href: "/funding-agencies",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h10a1 1 0 0 1 .8 1.6L14.25 7l2.55 2.4A1 1 0 0 1 16 11H6a1 1 0 0 0-1 1v3a1 1 0 1 1-2 0V6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "수수료 기준 관리",
        href: "/company-class",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 0 1-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 0 1 .947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 0 1 2.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 0 1 2.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 0 1 .947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 0 1-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 0 1-2.287-.947zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "공문 양식 관리",
        href: "/notice-templates",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 13.414 6L10 2.586A2 2 0 0 0 8.586 2H4zm1 9a1 1 0 0 0 0 2h6a1 1 0 1 0 0-2H5zm0 4a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H5zm0-8a1 1 0 0 0 0 2h2a1 1 0 1 0 0-2H5z" clipRule="evenodd" />
          </svg>
        ),
        children: [
          { label: "절차 안내 공문", href: "/notice-templates/documents" },
          { label: "수수료 청구서 양식", href: "/notice-templates/invoices" },
        ],
      },
    ],
  },

  // ── 현황 및 이력조회 ────────────────────────────────────────
  {
    label: "현황 및 이력조회",
    items: [
      {
        label: "이슈현황",
        href: "/issues",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 0 1-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "전체 변경이력",
        href: "/audit-log",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "공문 발송이력",
        href: "/emails",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 4a2 2 0 0 0-2 2v.4l9 5.4 9-5.4V6a2 2 0 0 0-2-2H3z" />
            <path d="M19 8.6l-8.55 5.13a1 1 0 0 1-.9 0L1 8.6V14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.6z" />
          </svg>
        ),
      },
    ],
  },

  // ── 채권/정산 현황 (조회 전용) ─────────────────────────────
  // 수금 등록·계산서 발행은 과제 상세(→ 수수료 관리 탭)에서 처리
  // 이 메뉴는 전체 현황 확인 용도
  {
    label: "채권/정산 현황",
    hidden: true,
    items: [
      {
        label: "세금계산서 현황",
        href: "/tax-invoices",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm0 6a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2zm1 5a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H4z" />
          </svg>
        ),
      },
      {
        label: "기관 정산",
        href: "/settlements",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },

  // ── 시스템 관리 ────────────────────────────────────────────
  {
    label: "시스템",
    items: [
      {
        label: "수행기관관리",
        href: "/institutions",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a1 1 0 1 1 0 2h-3a1 1 0 0 1-1-1v-2a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        label: "권한관리",
        href: "/admin/users",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0 0 10 1.944 11.954 11.954 0 0 0 17.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ),
      },
    ],
  },
];

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "시스템 관리자",
  ACCOUNTANT: "회계 담당자",
  SETTLEMENT: "전문기관담당자",
  VIEWER: "조회 전용",
};

// 사이드바 최소화 상태에서 아이콘에 마우스를 올리면 옆에 띄우는 라벨.
// 사이드바(nav)는 세로 스크롤 때문에 overflow가 걸려 있어, 일반적인 absolute 배치로는
// 툴팁이 사이드바 오른쪽 경계에서 잘려 보인다 — document.body로 포탈해서 화면 좌표(fixed)로
// 직접 그리면 어떤 조상의 overflow와도 무관하게 항상 온전히 보인다.
function IconTooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  return (
    <div
      ref={ref}
      className="relative shrink-0"
      onMouseEnter={() => {
        const r = ref.current?.getBoundingClientRect();
        if (r) setPos({ top: r.top + r.height / 2, left: r.right + 8 });
      }}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            style={{ top: pos.top, left: pos.left }}
            className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            {label}
          </span>,
          document.body
        )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role as Role | undefined;
  // 하위메뉴(children)가 있는 항목의 펼침/접힘 상태 — 수동으로 토글하기 전엔 하위 경로 중 하나가
  // 현재 활성 경로일 때 기본으로 펼쳐진다 (아래 expanded 계산부 참고).
  const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});
  // 그룹(예: "수수료 규정 관리") 단위 접기/펼치기 — 기본은 항상 펼쳐진 상태이고, 사용자가 직접
  // 접은 그룹만 기억한다.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  // 사이드바 전체 최소화(아이콘만 남기기) — 켜져 있으면 그룹 접기 상태와 무관하게 항상 아이콘만 보여준다.
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const visibleGroups = navGroups
    .filter((group) => !group.hidden)
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => {
          if (item.hidden) return false;
          const allowed = allowedRolesForPath(item.href);
          return !role || allowed.includes(role);
        })
        .map((item) => ({
          ...item,
          children: item.children?.filter((c) => !c.hidden),
        })),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className={`flex flex-col shrink-0 bg-slate-900 text-slate-300 transition-[width] duration-150 ${collapsed ? "w-16" : "w-60"}`}>
      {/* 로고 (+ 사이드바 최소화 토글) */}
      <div className={`flex items-center gap-2.5 py-5 border-b border-slate-700/50 ${collapsed ? "justify-center px-2" : "px-5"}`}>
        {collapsed ? (
          // 접힌 상태에선 로고 자리를 그대로 토글 버튼으로 쓴다 — 평소엔 로고, 마우스를 올리면
          // 펼치기 아이콘으로 바뀐다.
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title="사이드바 펼치기"
            className="group relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shrink-0"
          >
            <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4 transition-opacity group-hover:opacity-0">
              <path d="M2 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4zm0 7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5zM2 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3z" />
            </svg>
            <LuPanelLeft size={16} className="absolute inset-0 m-auto text-white opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ) : (
          <>
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shrink-0">
              <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
                <path d="M2 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4zm0 7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5zM2 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white truncate">Samhwa ERP</p>
              <p className="text-[10px] text-slate-400 leading-tight truncate">수수료 통합관리</p>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="사이드바 최소화"
              className="flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors shrink-0"
            >
              <LuPanelLeft size={16} />
            </button>
          </>
        )}
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {visibleGroups.map((group, gi) => {
          const groupCollapsed = group.label ? !collapsed && (collapsedGroups[group.label] ?? false) : false;
          return (
          <div key={gi}>
            {group.label && !collapsed && (
              <button
                type="button"
                onClick={() => setCollapsedGroups((p) => ({ ...p, [group.label!]: !groupCollapsed }))}
                className="w-full flex items-center gap-1 px-2 mb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-500 hover:text-slate-300 transition-colors"
              >
                <span className="flex-1 text-left">{group.label}</span>
                <FiChevronDown size={11} className={`shrink-0 transition-transform ${groupCollapsed ? "-rotate-90" : ""}`} />
              </button>
            )}
            {!groupCollapsed && (
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const hasChildren = !!item.children?.length && !collapsed;
                if (!hasChildren) {
                  const link = (
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 py-2 rounded-md text-sm transition-colors ${collapsed ? "justify-center px-0" : "px-2.5"} ${
                        isActive(item.href)
                          ? "bg-blue-600 text-white"
                          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                  return (
                    <li key={item.href}>
                      {collapsed ? <IconTooltip label={item.label}>{link}</IconTooltip> : link}
                    </li>
                  );
                }
                const childActive = item.children!.some((c) => isActive(c.href));
                const expanded = manualExpanded[item.href] ?? childActive;
                return (
                  <li key={item.href}>
                    <button
                      type="button"
                      onClick={() => setManualExpanded((p) => ({ ...p, [item.href]: !expanded }))}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                        childActive ? "text-slate-200" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      <FiChevronDown size={13} className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded && (
                      <ul className="mt-0.5 ml-3.75 pl-3 space-y-0.5 border-l border-slate-700/60">
                        {item.children!.map((child) => (
                          <li key={child.href}>
                            <Link
                              href={child.href}
                              className={`block px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                                isActive(child.href)
                                  ? "bg-blue-600 text-white"
                                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                              }`}
                            >
                              {child.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            )}
          </div>
          );
        })}
      </nav>

      {/* 하단 사용자 */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className={`flex items-center gap-2.5 py-2 ${collapsed ? "justify-center px-0" : "px-2.5"}`}>
          {(() => {
            const avatar = (
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-600 text-xs text-white font-medium shrink-0">
                {user?.name?.[0] ?? "?"}
              </div>
            );
            return collapsed ? (
              <IconTooltip label={`${user?.name ?? "-"} · ${ROLE_LABELS[user?.role ?? ""] ?? "-"}`}>{avatar}</IconTooltip>
            ) : (
              avatar
            );
          })()}
          {!collapsed && (
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.name ?? "-"}</p>
            <p className="text-[10px] text-slate-500 truncate">{ROLE_LABELS[user?.role ?? ""] ?? "-"}</p>
          </div>
          )}
        </div>
      </div>
    </aside>
  );
}
