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
  try {
    await requireUser();
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

  // 이 액션의 변경이력은 클라이언트(lib/store.ts의 record())가 /api/audit-log로 이미 자세히
  // (내용 요약·필드별 변경사항 포함) 남기므로, 여기서 같은 자원에 대해 부실한(내용 요약만 있는)
  // 기록을 또 남기지 않는다 — 예전엔 두 기록이 같은 시각에 겹쳐서 화면이 헷갈렸다.
  return Response.json({ ok: true, projectIssue: toProjectIssue(created) });
}
