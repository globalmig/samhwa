import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import type { Institution } from "@/lib/mock";

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

  let body: Partial<Institution>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.institution.findUnique({ where: { id }, include: { contacts: true } });
  if (!before) return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });

  await prisma.institution.update({
    where: { id },
    data: {
      institutionName: body.name ?? undefined,
      businessNumber: body.bizNumber !== undefined ? body.bizNumber || null : undefined,
      institutionType: body.type ?? undefined,
      representativeName: body.representativeName !== undefined ? body.representativeName || null : undefined,
      phone: body.contactPhone !== undefined ? body.contactPhone || null : undefined,
      email: body.contactEmail !== undefined ? body.contactEmail || null : undefined,
      isActive: body.status !== undefined ? body.status !== "INACTIVE" : undefined,
      notes: body.note !== undefined ? body.note ?? null : undefined,
    },
  });

  if (body.contactName !== undefined) {
    const primary = before.contacts.find((c) => c.isPrimary) ?? before.contacts[0];
    if (primary) {
      await prisma.institutionContact.update({
        where: { id: primary.id },
        data: { name: body.contactName, phone: body.contactPhone ?? primary.phone, email: body.contactEmail ?? primary.email },
      });
    } else if (body.contactName) {
      await prisma.institutionContact.create({
        data: { institutionId: id, name: body.contactName, phone: body.contactPhone || null, email: body.contactEmail || null, isPrimary: true },
      });
    }
  }

  const updated = await prisma.institution.findUniqueOrThrow({ where: { id }, include: { contacts: true } });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, institution: toInstitution(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.institution.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });

  try {
    await prisma.institution.delete({ where: { id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: `"${target.institutionName}"은(는) 다른 데이터에서 참조 중이라 삭제할 수 없습니다. 삭제 대신 상태를 "비활성"으로 변경해주세요.` },
        { status: 409 }
      );
    }
    throw err;
  }

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
