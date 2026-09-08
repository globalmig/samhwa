import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import type { Institution } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.institution.findMany({ include: { contacts: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, institutions: rows.map(toInstitution) });
}

export async function POST(request: Request) {
  try {
    await requireUser();
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

  const created = await prisma.institution.create({
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

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, institution: toInstitution(created) });
}
