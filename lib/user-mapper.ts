import type { User } from "@prisma/client";
import type { SystemUser } from "./mock";
import { dbRoleToApp } from "./role-map";

/** Prisma User 행을 클라이언트가 기대하는 SystemUser 모양으로 변환한다 (비밀번호 해시는 절대 포함하지 않음). */
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
    hiworksMailPassword: u.hiworksMailPassword ?? undefined,
    phone: u.phone ?? undefined,
  };
}
