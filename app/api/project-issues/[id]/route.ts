import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toProjectIssue } from "@/lib/project-issue-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectIssue } from "@/lib/mock";

// 이슈 내용 미리보기 — 감사이력 라벨에 과제번호와 함께 붙여 어떤 이슈인지 한눈에 알아볼 수 있게 한다
// (app/api/project-issues/route.ts의 CREATE와 동일한 규칙).
function issueLabel(projectNumber: string, content: string): string {
  const trimmed = content.trim();
  const preview = trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
  return `${projectNumber} 이슈: ${preview}`;
}

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("issues-manage");
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

  const before = await prisma.projectIssue.findUnique({ where: { id }, include: { project: true } });
  if (!before) return Response.json({ ok: false, error: "이슈를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.projectIssue.update({
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
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "projectIssue",
      entityId: id,
      entityLabel: issueLabel(row.project.projectNumber, row.content),
      action: "UPDATE",
      before: toProjectIssue(before) as unknown as Record<string, unknown>,
      after: toProjectIssue(row) as unknown as Record<string, unknown>,
    });
    return row;
  });

  return Response.json({ ok: true, projectIssue: toProjectIssue(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("issues-manage");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.projectIssue.findUnique({ where: { id }, include: { project: true } });
  if (!target) return Response.json({ ok: false, error: "이슈를 찾을 수 없습니다." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.projectIssue.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "projectIssue",
      entityId: target.id,
      entityLabel: issueLabel(target.project.projectNumber, target.content),
      action: "DELETE",
    });
  });

  return Response.json({ ok: true });
}
