"use client";

import { useAuth } from "./auth";

type Role = "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER";

// ─── 페이지 접근 권한 ────────────────────────────────────────
const PAGE_ACCESS: Record<string, Role[]> = {
  "/":               ["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"],
  "/projects":          ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/funding-agencies":  ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/institutions":      ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/fees":           ["ADMIN", "ACCOUNTANT", "VIEWER"],
  "/fee-calculation":["ADMIN", "ACCOUNTANT"],
  "/company-class":  ["ADMIN", "ACCOUNTANT"],
  "/emails":         ["ADMIN", "ACCOUNTANT", "VIEWER"],
  "/issues":         ["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"],
  "/unclaimed":      ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/receivables":    ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/settlements":    ["ADMIN", "SETTLEMENT"],
  "/tax-invoices":   ["ADMIN", "ACCOUNTANT"],
  "/policy-history": ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  "/audit-log":      ["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"],
  "/admin/users":    ["ADMIN"],
};

// ─── 쓰기(생성/수정/삭제) 권한 ──────────────────────────────
const WRITE_ACCESS: Record<string, Role[]> = {
  fees:           ["ADMIN", "ACCOUNTANT"],
  "company-class":["ADMIN", "ACCOUNTANT"],
  unclaimed:      ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  receivables:    ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  settlements:    ["ADMIN", "SETTLEMENT"],
  "tax-invoices": ["ADMIN", "ACCOUNTANT"],
  emails:         ["ADMIN", "ACCOUNTANT"],
  projects:            ["ADMIN", "ACCOUNTANT"],
  "funding-agencies":  ["ADMIN", "ACCOUNTANT"],
  institutions:        ["ADMIN", "ACCOUNTANT"],
  users:          ["ADMIN"],
  issues:         ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
  notices:        ["ADMIN", "ACCOUNTANT", "SETTLEMENT"],
};

export function canAccessPage(role: Role | undefined, pathname: string): boolean {
  if (!role) return false;
  // 동적 경로 처리: /projects/xxx → /projects 기준 체크
  const base = pathname === "/" ? "/" : `/${pathname.split("/")[1]}`;
  const allowed = PAGE_ACCESS[base];
  if (!allowed) return true; // 명시되지 않은 페이지는 허용
  return allowed.includes(role);
}

export function canWriteDomain(role: Role | undefined, domain: string): boolean {
  if (!role) return false;
  const allowed = WRITE_ACCESS[domain];
  if (!allowed) return false;
  return allowed.includes(role);
}

// 사이드바 필터용: 해당 href에 접근 가능한 역할 목록
export function allowedRolesForPath(pathname: string): Role[] {
  const base = pathname === "/" ? "/" : `/${pathname.split("/")[1]}`;
  return PAGE_ACCESS[base] ?? (["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"] as Role[]);
}

// ─── React Hooks ─────────────────────────────────────────────

/** 특정 도메인에 쓰기 권한이 있는지 확인 */
export function useCanWrite(domain: string): boolean {
  const { user } = useAuth();
  return canWriteDomain(user?.role as Role | undefined, domain);
}

/** 현재 사용자의 역할 반환 */
export function useRole(): Role | undefined {
  const { user } = useAuth();
  return user?.role as Role | undefined;
}
