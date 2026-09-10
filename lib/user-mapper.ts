import type { User } from "@prisma/client";
import type { SystemUser } from "./mock";
import { dbRoleToApp } from "./role-map";

/** Prisma User 행을 클라이언트가 기대하는 SystemUser 모양으로 변환한다.
 *  로그인 비밀번호 해시(passwordHash)와 하이웍스 메일 비밀번호(hiworksMailPassword)는
 *  절대 포함하지 않는다 — 메일 비밀번호는 등록 여부(hiworksMailConfigured)만 내려준다. */
export function toSystemUser(u: User): SystemUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: dbRoleToApp(u.role) as SystemUser["role"],
    status: u.status as SystemUser["status"],
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    registeredAt: u.createdAt.toISOString(),
    hiworksEmail: u.hiworksEmail ?? undefined,
    hiworksMailConfigured: !!(u.hiworksEmail && u.hiworksMailPassword),
    phone: u.phone ?? undefined,
  };
}
