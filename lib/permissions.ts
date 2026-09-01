"use client";

import { useAuth } from "./auth";
import { useStore, getPageAccess, getWriteAccess } from "./store";
import type { Role } from "./mock";

export type { Role };

// 로그인 없이 접근 가능한 인증 관련 페이지 (AuthGuard·LayoutShell에서 공통으로 참조)
export const PUBLIC_AUTH_PATHS = ["/login", "/signup", "/find-id", "/find-password"];

// 페이지 접근 권한(pageAccess)·기능별 쓰기 권한(writeAccess)의 실제 값은 lib/store.ts에서
// 관리한다 — [권한 설정](/admin/permissions)에서 시스템 관리자가 화면으로 편집하면 즉시
// 반영돼야 하므로, 코드에 고정된 상수가 아니라 store의 live 상태를 그때그때 읽는다.
// 초기값은 lib/mock.ts의 initialPageAccess/initialWriteAccess를 참고.

// ─── [권한 설정] 화면에 쓰이는 라벨 카탈로그 ─────────────────────
// 여기 없는 키가 store에 남아 있어도 동작에는 문제 없다(그냥 화면에 행이 안 뜰 뿐) — 이 목록은
// 어떤 페이지/기능이 존재하는지에 대한 화면 표시용 메타데이터일 뿐, 권한 판정 로직과는 무관하다.
export const PAGE_ACCESS_CATALOG: { key: string; label: string }[] = [
  { key: "/", label: "통합 대시보드" },
  { key: "/projects", label: "과제 전체조회" },
  { key: "/fees", label: "수수료 청구 관리" },
  { key: "/fee-calculation", label: "수수료 계산" },
  { key: "/company-class", label: "수수료 기준 관리" },
  { key: "/funding-agencies", label: "전담기관 관리" },
  { key: "/notice-templates", label: "공문 양식 관리" },
  { key: "/institutions", label: "수행기관관리" },
  { key: "/emails", label: "공문 발송이력" },
  { key: "/issues", label: "이슈현황" },
  { key: "/unclaimed", label: "미청구 관리" },
  { key: "/receivables", label: "수금관리 현황" },
  { key: "/settlements", label: "기관 정산" },
  { key: "/tax-invoices", label: "세금계산서 현황" },
  { key: "/policy-history", label: "정책 변경이력" },
  { key: "/audit-log", label: "전체 변경이력" },
  { key: "/notices", label: "공지사항" },
  { key: "/admin/users", label: "권한관리(사용자)" },
  { key: "/admin/permissions", label: "권한 설정" },
];

export const WRITE_ACCESS_CATALOG: { key: string; label: string; group: string }[] = [
  { key: "projects", label: "과제 관리 편집", group: "과제 · 수수료" },
  { key: "projects-delete", label: "과제 전체 삭제", group: "과제 · 수수료" },
  { key: "fees", label: "수수료청구관리 편집", group: "과제 · 수수료" },
  { key: "fees-info-edit", label: "과제 정보수정(수신자·담당자·등록일)", group: "과제 · 수수료" },
  { key: "fees-sales", label: "매출발행·매출취소·수금관리", group: "과제 · 수수료" },
  { key: "fees-other-firm", label: "타회계법인 진행 여부 체크", group: "과제 · 수수료" },
  { key: "company-class", label: "수수료 기준 관리", group: "과제 · 수수료" },

  { key: "unclaimed", label: "미청구 관리", group: "채권 · 정산" },
  { key: "receivables", label: "수금관리 입력", group: "채권 · 정산" },
  { key: "settlements", label: "정산 관리", group: "채권 · 정산" },
  { key: "tax-invoices", label: "세금계산서 발행·취소", group: "채권 · 정산" },

  { key: "emails", label: "공문 발송(세금계산서·정산절차 안내 등)", group: "공문 · 안내" },
  { key: "simple-notices", label: "간단 안내 메일 발송(서류요청·입금확인)", group: "공문 · 안내" },
  { key: "notice-templates", label: "공문 양식 관리", group: "공문 · 안내" },
  { key: "notices", label: "공지사항 게시(헤더 알림)", group: "공문 · 안내" },

  { key: "funding-agencies", label: "전담기관 관리", group: "기관 · 시스템" },
  { key: "institutions", label: "수행기관 관리", group: "기관 · 시스템" },
  { key: "standard-attachments", label: "사업자등록증·통장사본 관리", group: "기관 · 시스템" },
  { key: "users", label: "사용자 계정 관리", group: "기관 · 시스템" },
  { key: "issues", label: "이슈 등록", group: "기관 · 시스템" },
  { key: "issues-manage", label: "이슈 수정·삭제·상태변경", group: "기관 · 시스템" },
];

// 로그인/접근거부 시 이동할 역할별 기본 페이지 (VIEWER는 통합 대시보드 비노출)
export function defaultLandingPath(role: Role | undefined): string {
  if (role === "VIEWER") return "/fees";
  return "/";
}

// 동적/중첩 경로를 pageAccess 카탈로그 키에 맞춰 매핑한다. 대부분의 키는 한 단계
// (/projects, /fees 등)라 첫 세그먼트만 봐도 되지만, "/admin/users"·"/admin/permissions"처럼
// 두 단계짜리 키도 있다 — 첫 세그먼트만 잘라 "/admin"으로 보면 카탈로그에 없는 키가 되어
// "명시되지 않은 페이지는 허용" 규칙에 걸려 아무 역할이나 통과해버린다(/admin/users/[id] 같은
// 하위 경로도 마찬가지). 그래서 실제 등록된 키 중 가장 길게(가장 구체적으로) 일치하는 것을 찾는다.
function resolvePageAccessKey(pathname: string): string {
  if (pathname === "/") return "/";
  let best: string | null = null;
  for (const key of Object.keys(getPageAccess())) {
    if (key === "/") continue;
    if (pathname === key || pathname.startsWith(`${key}/`)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ?? `/${pathname.split("/")[1]}`;
}

export function canAccessPage(role: Role | undefined, pathname: string, currentUserId?: string): boolean {
  if (!role) return false;
  // 헤더의 "내 계정" 링크(/admin/users/{내 id})는 권한관리 화면(ADMIN 전용)과 별개로,
  // 로그인한 사용자라면 누구나 자기 자신의 프로필만은 볼 수 있어야 한다.
  const selfProfileMatch = /^\/admin\/users\/([^/]+)$/.exec(pathname);
  if (selfProfileMatch && currentUserId && selfProfileMatch[1] === currentUserId) return true;
  const base = resolvePageAccessKey(pathname);
  const allowed = getPageAccess()[base];
  if (!allowed) return true; // 명시되지 않은 페이지는 허용
  return allowed.includes(role);
}

export function canWriteDomain(role: Role | undefined, domain: string): boolean {
  if (!role) return false;
  const allowed = getWriteAccess()[domain];
  if (!allowed) return false;
  return allowed.includes(role);
}

// 사이드바 필터용: 해당 href에 접근 가능한 역할 목록
export function allowedRolesForPath(pathname: string): Role[] {
  const base = resolvePageAccessKey(pathname);
  return getPageAccess()[base] ?? (["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"] as Role[]);
}

// ─── React Hooks ─────────────────────────────────────────────

/** 특정 도메인에 쓰기 권한이 있는지 확인 */
export function useCanWrite(domain: string): boolean {
  const { user } = useAuth();
  // [권한 설정]에서 편집한 내용이 이 값을 쓰는 컴포넌트에 즉시 반영되도록 store 변경을 구독한다.
  useStore();
  return canWriteDomain(user?.role as Role | undefined, domain);
}

/** 현재 사용자의 역할 반환 */
export function useRole(): Role | undefined {
  const { user } = useAuth();
  return user?.role as Role | undefined;
}
