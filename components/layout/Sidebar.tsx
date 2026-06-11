"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navGroups = [
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
  {
    label: "과제 관리",
    items: [
      {
        label: "과제/연차 관리",
        href: "/projects",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M9 2a1 1 0 0 0-.894.553L7.382 4H4a1 1 0 0 0 0 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a1 1 0 1 0 0-2h-3.382l-.724-1.447A1 1 0 0 0 11 2H9z" />
          </svg>
        ),
      },
      {
        label: "기관 관리",
        href: "/institutions",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4zm3 1h2v2H7V5zm0 4h2v2H7V9zm0 4h2v2H7v-2zm4-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
          </svg>
        ),
      },
      {
        label: "유형별 수수료 기준",
        href: "/company-class",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2 4a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H3a1 1 0 0 1-1-1zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H3z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "수수료",
    items: [
      {
        label: "수수료 정책 엔진",
        href: "/fee-policy",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 0 1-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 0 1 .947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 0 1 2.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 0 1 2.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 0 1 .947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 0 1-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 0 1-2.287-.947zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "연차별 수수료 관리",
        href: "/fees",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 0 1-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 0 1-.567.267z" />
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-13a1 1 0 1 0-2 0v.092a4.535 4.535 0 0 0-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 1 0-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 1 0 2 0v-.092a4.535 4.535 0 0 0 1.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0 0 11 9.092V7.151c.391.127.68.317.843.504a1 1 0 1 0 1.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "미청구액 관리",
        href: "/unclaimed",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M5 2a2 2 0 0 0-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 0 0-2-2H5zm4.707 3.707a1 1 0 0 0-1.414-1.414l-3 3a1 1 0 0 0 0 1.414l3 3a1 1 0 0 0 1.414-1.414L8.414 9H10a3 3 0 0 1 3 3 1 1 0 1 0 2 0 5 5 0 0 0-5-5H8.414l1.293-1.293z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
    ],
  },
  {
    label: "채권/정산",
    items: [
      {
        label: "미수금/채권 관리",
        href: "/receivables",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M4 4a2 2 0 0 0-2 2v1h16V6a2 2 0 0 0-2-2H4z" />
            <path
              fillRule="evenodd"
              d="M18 9H2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM4 13a1 1 0 0 1 1-1h1a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1zm5-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2H9z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "기관 정산 관리",
        href: "/settlements",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M6 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.414A2 2 0 0 0 15.414 6L12 2.586A2 2 0 0 0 10.586 2H6zm2 10a1 1 0 1 0 0 2h4a1 1 0 1 0 0-2H8zm0-3a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H8zm1-5a1 1 0 0 1 1-1v1h1a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1V4z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
    ],
  },
  {
    label: "발행/발송",
    items: [
      {
        label: "세금계산서 관리",
        href: "/tax-invoices",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "이메일 발송 관리",
        href: "/emails",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0 0 16 4H4a2 2 0 0 0-1.997 1.884z" />
            <path d="m18 8.118-8 4-8-4V14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.118z" />
          </svg>
        ),
      },
    ],
  },
  {
    label: "시스템",
    items: [
      {
        label: "정책 변경 이력",
        href: "/policy-history",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm1-12a1 1 0 1 0-2 0v4a1 1 0 0 0 .293.707l2.828 2.829a1 1 0 1 0 1.415-1.415L11 9.586V6z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "전체 변경이력",
        href: "/audit-log",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zm0 4a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
      {
        label: "권한 관리",
        href: "/admin/users",
        icon: (
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              fillRule="evenodd"
              d="M2.166 4.999A11.954 11.954 0 0 0 10 1.944 11.954 11.954 0 0 0 17.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ),
      },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

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
        {navGroups.map((group, gi) => (
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
            관
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-300 truncate">시스템 관리자</p>
            <p className="text-[10px] text-slate-500 truncate">admin@samhwa.co.kr</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
