import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toProjectIssue } from "@/lib/project-issue-mapper";
import type { ProjectIssue } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.projectIssue.findMany({ include: { project: true }, orderBy: { createdAt: "desc" } });
  return Response.json({ ok: true, projectIssues: rows.map(toProjectIssue) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<ProjectIssue, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectId || !body.content) {
    return Response.json({ ok: false, error: "과제, 내용은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.projectIssue.create({
    data: {
      projectId: body.projectId,
      content: body.content,
      author: body.author,
      priority: body.priority,
      status: body.status,
      recipientGroups: body.recipientGroups ? JSON.stringify(body.recipientGroups) : null,
      recipientUserIds: body.recipientUserIds ? JSON.stringify(body.recipientUserIds) : null,
      institutionName: body.institutionName ?? null,
      noInstitution: !!body.noInstitution,
      term: body.term ?? null,
    },
    include: { project: true },
  });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "CREATE", resourceType: "projectIssue", resourceId: created.id, newValues: JSON.stringify({ content: created.content.slice(0, 100) }) },
  });

  return Response.json({ ok: true, projectIssue: toProjectIssue(created) });
}
