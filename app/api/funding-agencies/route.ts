import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFundingAgency } from "@/lib/funding-agency-mapper";
import type { FundingAgency } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const agencies = await prisma.fundingAgency.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, agencies: agencies.map(toFundingAgency) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<FundingAgency, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name || !body.shortName || !body.code) {
    return Response.json({ ok: false, error: "정식명칭, 약칭, 기관코드는 필수입니다." }, { status: 400 });
  }

  const created = await prisma.fundingAgency.create({
    data: {
      name: body.name,
      shortName: body.shortName,
      code: body.code,
      contactName: body.contactName ?? "",
      contactEmail: body.contactEmail ?? "",
      contactPhone: body.contactPhone ?? "",
      status: body.status ?? "ACTIVE",
      registeredAt: body.registeredAt ? new Date(body.registeredAt) : new Date(),
      website: body.website ?? null,
      noticeRecipientScope: body.noticeRecipientScope ?? "LEAD_ONLY",
      autoDetectByLeadInstitution: !!body.autoDetectByLeadInstitution,
      affiliatedInstitutionNames: body.affiliatedInstitutionNames ? JSON.stringify(body.affiliatedInstitutionNames) : null,
      specialNotes: body.specialNotes ? JSON.stringify(body.specialNotes) : null,
    },
  });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "CREATE", resourceType: "fundingAgency", resourceId: created.id, newValues: JSON.stringify({ name: created.name, shortName: created.shortName }) },
  });

  return Response.json({ ok: true, agency: toFundingAgency(created) });
}
