"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { allowedRolesForPath } from "@/lib/permissions";

type Role = "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER";
type NavGroup = { label?: string; hidden?: boolean; items: { label: string; href: string; hidden?: boolean; icon: React.ReactNode }[] };

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

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role as Role | undefined;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const visibleGroups = navGroups
    .filter((group) => !group.hidden)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.hidden) return false;
        const allowed = allowedRolesForPath(item.href);
        return !role || allowed.includes(role);
      }),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <aside className="flex flex-col w-60 shrink-0 bg-slate-900 text-slate-300 overflow-y-auto">
      {/* 로고 */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-700/50">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
          <svg viewBox="0 0 20 20" fill="white" className="w-4 h-4">
            <path d="M2 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4zm9 0a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4zm0 7a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5zM2 13a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Samhwa ERP</p>
          <p className="text-[10px] text-slate-400 leading-tight">수수료 통합관리</p>
        </div>
      </div>

      {/* 네비게이션 */}
      <nav className="flex-1 px-3 py-4 space-y-5">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="px-2 mb-1 text-[10px] font-semibold tracking-widest uppercase text-slate-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors ${
                      isActive(item.href)
                        ? "bg-blue-600 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    }`}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* 하단 사용자 */}
      <div className="px-3 py-4 border-t border-slate-700/50">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-600 text-xs text-white font-medium shrink-0">
            {user?.name?.[0] ?? "?"}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">{user?.name ?? "-"}</p>
            <p className="text-[10px] text-slate-500 truncate">{ROLE_LABELS[user?.role ?? ""] ?? "-"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
