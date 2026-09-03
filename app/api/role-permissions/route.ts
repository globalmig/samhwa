import { prisma } from "@/lib/db";
import { requireAdmin, SessionError } from "@/lib/session";
import { appRoleToDb, dbRoleToApp } from "@/lib/role-map";
import { ADMIN_ONLY_LOCKED_PAGES } from "@/lib/permission-constants";
import type { Role } from "@/lib/mock";

export const runtime = "nodejs";

const VALID_ROLES: Role[] = ["ADMIN", "ACCOUNTANT", "SETTLEMENT", "VIEWER"];

// 로그인 여부와 무관하게 열어둔다 — pageAccess/writeAccess는 앱이 뜨자마자(로그인 화면
// 렌더링 이전에도) 필요한 값이라 lib/store.ts가 별도 인증 없이 바로 불러온다.
export async function GET() {
  const rows = await prisma.rolePermission.findMany({ where: { isAllowed: true } });
  const pageAccess: Record<string, Role[]> = {};
  const writeAccess: Record<string, Role[]> = {};
  for (const row of rows) {
    const role = dbRoleToApp(row.role) as Role;
    if (row.resourceType === "MENU" && row.action === "READ") {
      (pageAccess[row.resourceKey] ??= []).push(role);
    } else if (row.resourceType === "FEATURE" && row.action === "WRITE") {
      (writeAccess[row.resourceKey] ??= []).push(role);
    }
  }
  return Response.json({ ok: true, pageAccess, writeAccess });
}

interface PatchBody {
  resourceType: "MENU" | "FEATURE";
  resourceKey: string;
  roles: string[];
}

// [권한 설정] 화면에서 체크박스 하나를 바꿀 때마다, 그 페이지/기능에 허용된 역할 전체 목록을
// 통째로 다시 저장한다(부분 patch가 아니라 "이 리소스는 이제 이 역할들만 허용" 전체 교체).
export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (body.resourceType !== "MENU" && body.resourceType !== "FEATURE") {
    return Response.json({ ok: false, error: "resourceType이 올바르지 않습니다." }, { status: 400 });
  }
  if (!body.resourceKey || !Array.isArray(body.roles)) {
    return Response.json({ ok: false, error: "resourceKey, roles는 필수입니다." }, { status: 400 });
  }

  const action = body.resourceType === "MENU" ? "READ" : "WRITE";
  let roles = Array.from(new Set(body.roles.filter((r): r is Role => VALID_ROLES.includes(r as Role))));
  // 화면 조작으로 관리자 전용 잠금 페이지(사용자관리·권한설정)에 다른 역할을 추가하거나 시스템
  // 관리자 스스로를 어떤 권한에서 빼버리는 자기잠금은 클라이언트(lib/store.ts)에서도 막지만,
  // 잘못된 값이 직접 이 API로 들어오는 경우에 대비해 서버에서도 다시 한번 강제한다.
  if (body.resourceType === "MENU" && ADMIN_ONLY_LOCKED_PAGES.includes(body.resourceKey)) {
    roles = ["ADMIN"];
  } else if (!roles.includes("ADMIN")) {
    roles = ["ADMIN", ...roles];
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { resourceType: body.resourceType, resourceKey: body.resourceKey, action } }),
    ...roles.map((role) =>
      prisma.rolePermission.create({
        data: { role: appRoleToDb(role), resourceType: body.resourceType, resourceKey: body.resourceKey, action, isAllowed: true },
      })
    ),
  ]);

  return Response.json({ ok: true });
}
