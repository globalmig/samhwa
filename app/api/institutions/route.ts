import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Institution } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.institution.findMany({ include: { contacts: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, institutions: rows.map(toInstitution) });
}

export async function POST(request: Request) {
  let actor;
  try {
    // "수행기관관리" 화면의 등록 폼뿐 아니라, 참여기관 추가(InstitutionQuickAdd, "projects" 권한)와
    // 수수료청구관리의 RCMS 엑셀 일괄등록("fees" 권한)에서도 그 자리에서 새 기관을 만들 수 있어
    // 셋 중 하나만 있어도 통과한다 — 버튼이 보이는데 API만 막히는 일이 없도록.
    actor = await requireWriteAccess(["institutions", "projects", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Institution, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name) return Response.json({ ok: false, error: "기관명은 필수입니다." }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.institution.create({
      data: {
        institutionName: body.name,
        businessNumber: body.bizNumber || null,
        institutionType: body.type,
        representativeName: body.representativeName || null,
        phone: body.contactPhone || null,
        email: body.contactEmail || null,
        isActive: body.status !== "INACTIVE",
        notes: body.note ?? null,
        contacts: body.contactName
          ? { create: [{ name: body.contactName, phone: body.contactPhone || null, email: body.contactEmail || null, isPrimary: true }] }
          : undefined,
      },
      include: { contacts: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "institution",
      entityId: row.id,
      entityLabel: row.institutionName,
      action: "CREATE",
    });
    return row;
  });

  return Response.json({ ok: true, institution: toInstitution(created) });
}
