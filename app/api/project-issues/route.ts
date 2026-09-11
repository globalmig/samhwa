import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toProjectIssue } from "@/lib/project-issue-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectIssue } from "@/lib/mock";

// 이슈 내용 미리보기 — 감사이력 라벨에 과제번호와 함께 붙여 어떤 이슈인지 한눈에 알아볼 수 있게 한다.
function issueLabel(projectNumber: string, content: string): string {
  const trimmed = content.trim();
  const preview = trimmed.length > 30 ? `${trimmed.slice(0, 30)}…` : trimmed;
  return `${projectNumber} 이슈: ${preview}`;
}

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.projectIssue.findMany({ include: { project: true }, orderBy: { createdAt: "desc" } });
  return Response.json({ ok: true, projectIssues: rows.map(toProjectIssue) });
}

export async function POST(request: Request) {
  let actor;
  try {
    // 이슈현황/과제상세의 수동 등록("issues")뿐 아니라, 수수료청구관리의 RCMS 엑셀 일괄등록("fees")도
    // 처리 결과를 이슈로 남긴다.
    actor = await requireWriteAccess(["issues", "fees"]);
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

  const created = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
    const row = await tx.projectIssue.create({
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
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "projectIssue",
      entityId: row.id,
      entityLabel: issueLabel(row.project.projectNumber, row.content),
      action: "CREATE",
    });
    return row;
  }));

  return Response.json({ ok: true, projectIssue: toProjectIssue(created) });
}
