// DB(Prisma user_role: SYSTEM_ADMIN | ACCOUNTING | SETTLEMENT | GENERAL)와
// 앱 코드(SystemUser.role: ADMIN | ACCOUNTANT | SETTLEMENT | VIEWER)의 역할 이름이 서로 다르다.
// prisma/seed.ts가 시드할 때 쓴 것과 동일한 매핑을 API 라우트에서도 그대로 재사용한다.
export const APP_TO_DB_ROLE: Record<string, string> = {
  ADMIN: "SYSTEM_ADMIN",
  ACCOUNTANT: "ACCOUNTING",
  SETTLEMENT: "SETTLEMENT",
  VIEWER: "GENERAL",
};

export const DB_TO_APP_ROLE: Record<string, string> = {
  SYSTEM_ADMIN: "ADMIN",
  ACCOUNTING: "ACCOUNTANT",
  SETTLEMENT: "SETTLEMENT",
  GENERAL: "VIEWER",
};

export function dbRoleToApp(dbRole: string): string {
  return DB_TO_APP_ROLE[dbRole] ?? "VIEWER";
}

export function appRoleToDb(appRole: string): string {
  return APP_TO_DB_ROLE[appRole] ?? "GENERAL";
}
