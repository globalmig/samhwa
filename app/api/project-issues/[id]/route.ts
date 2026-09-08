import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toProjectIssue } from "@/lib/project-issue-mapper";
import type { ProjectIssue } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<ProjectIssue>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.projectIssue.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "이슈를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.projectIssue.update({
    where: { id },
    data: {
      content: body.content ?? undefined,
      priority: body.priority ?? undefined,
      status: body.status ?? undefined,
      recipientGroups: body.recipientGroups !== undefined ? JSON.stringify(body.recipientGroups) : undefined,
      recipientUserIds: body.recipientUserIds !== undefined ? JSON.stringify(body.recipientUserIds) : undefined,
    },
    include: { project: true },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, projectIssue: toProjectIssue(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.projectIssue.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "이슈를 찾을 수 없습니다." }, { status: 404 });

  await prisma.projectIssue.delete({ where: { id } });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
