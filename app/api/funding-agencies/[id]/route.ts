import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFundingAgency } from "@/lib/funding-agency-mapper";
import type { FundingAgency } from "@/lib/mock";

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

  let body: Partial<FundingAgency>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.fundingAgency.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "전담기관을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.fundingAgency.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      shortName: body.shortName ?? undefined,
      code: body.code ?? undefined,
      contactName: body.contactName ?? undefined,
      contactEmail: body.contactEmail ?? undefined,
      contactPhone: body.contactPhone ?? undefined,
      noticeSenderEmail: body.noticeSenderEmail ?? undefined,
      noticeSenderMailPassword: body.noticeSenderMailPassword ?? undefined,
      status: body.status ?? undefined,
      website: body.website !== undefined ? body.website : undefined,
      noticeRecipientScope: body.noticeRecipientScope ?? undefined,
      autoDetectByLeadInstitution: body.autoDetectByLeadInstitution !== undefined ? body.autoDetectByLeadInstitution : undefined,
      affiliatedInstitutionNames: body.affiliatedInstitutionNames !== undefined ? JSON.stringify(body.affiliatedInstitutionNames) : undefined,
      specialNotes: body.specialNotes !== undefined ? JSON.stringify(body.specialNotes) : undefined,
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, agency: toFundingAgency(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.fundingAgency.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "전담기관을 찾을 수 없습니다." }, { status: 404 });

  try {
    await prisma.fundingAgency.delete({ where: { id } });
  } catch (err) {
    // FK 제약(과제/수수료정책 등에서 참조 중) 위반 시 안내 메시지로 변환
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: `"${target.name}"은(는) 다른 데이터에서 참조 중이라 삭제할 수 없습니다. 삭제 대신 상태를 "비활성"으로 변경해주세요.` },
        { status: 409 }
      );
    }
    throw err;
  }

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
