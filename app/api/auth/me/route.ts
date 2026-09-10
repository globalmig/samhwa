import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";

export const runtime = "nodejs";

// 계정 상태(status)·세션 유효성(sessionVersion) 검증은 getSessionUser()가 매 요청마다
// DB를 조회해 수행한다(lib/session.ts) — 이 라우트에 한정된 특별 검사가 아니라 requireUser()를
// 쓰는 모든 API에 공통 적용된다.
export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ ok: false, user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    return Response.json({ ok: false, user: null }, { status: 401 });
  }
  return Response.json({ ok: true, user: toSystemUser(user) });
}
