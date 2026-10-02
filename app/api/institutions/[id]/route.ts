import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import { writeAuditLog, UUID_RE } from "@/lib/audit";
import { invalidateCache, INSTITUTIONS_CACHE_KEY, FUNDING_AGENCIES_CACHE_KEY } from "@/lib/server-cache";
import { validateInstitutionName, renameInAffiliatedNames } from "@/lib/institution-name";
import type { Institution } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 이름 정정으로 소속기관 목록이 바뀐 전담기관 — 화면(store)이 같은 값으로 맞출 수 있게 응답에 담는다.
// 전담기관 레코드 전체(메일 비밀번호 등)를 내려보내지 않도록 필요한 필드만 둔다.
type AffiliatedNamesChange = { id: string; affiliatedInstitutionNames: string[] };

// 과제의 주관기관명은 기관 ID와 별개로 projects.extra_data에 이름 그대로 복사돼 있다(lib/project-mapper.ts) —
// 기관 원본만 바꾸면 새로고침 뒤 수수료청구관리 등에 옛 이름이 다시 보인다. 같은 트랜잭션에서 함께 맞추고,
// 예전 이름 변경 때 맞춰지지 않고 남아 있던 복사본도 이 기회에 같이 바로잡는다.
async function syncLeadInstitutionNameCopies(tx: Prisma.TransactionClient, institutionId: string, name: string): Promise<void> {
  const idLower = institutionId.toLowerCase();
  // extra_data는 JSON 문자열이라 DB에서 키로 거를 수 없다 — id 문자열이 들어 있는 과제만 먼저 좁힌 뒤
  // 실제 leadInstitutionId를 확인한다. 저장 경로에 따라 uniqueidentifier 문자열의 대소문자가 다를 수 있어 둘 다 찾는다.
  const candidates = await tx.project.findMany({
    where: { OR: [{ extraData: { contains: idLower } }, { extraData: { contains: institutionId.toUpperCase() } }] },
    select: { id: true, extraData: true },
  });
  for (const p of candidates) {
    let extra: Record<string, unknown>;
    try {
      extra = JSON.parse(p.extraData ?? "{}") as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof extra.leadInstitutionId !== "string" || extra.leadInstitutionId.toLowerCase() !== idLower) continue;
    if (extra.leadInstitutionName === name) continue;
    await tx.project.update({ where: { id: p.id }, data: { extraData: JSON.stringify({ ...extra, leadInstitutionName: name }) } });
  }
}

// 전담기관 소속기관 자동판별은 주관기관명이 목록에 정확히 일치하는지로 판정하므로, 같은 기관의 이름만
// 정정해도 목록을 그대로 두면 이후 과제 정보를 저장할 때 전담기관(RDA2→RDA1 등)이 바뀐다 — 목록의 옛
// 이름도 함께 바꿔 기존 판정을 유지한다(규칙은 lib/institution-name.ts의 renameInAffiliatedNames).
async function renameAffiliatedInstitutionName(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  institutionId: string,
  oldName: string,
  newName: string,
): Promise<AffiliatedNamesChange[]> {
  const agencies = await tx.fundingAgency.findMany({
    where: { affiliatedInstitutionNames: { not: null } },
    select: { id: true, name: true, affiliatedInstitutionNames: true },
  });
  if (agencies.length === 0) return [];
  // 옛 이름을 다른 기관이 아직 쓰고 있으면 그 기관의 판정이 바뀌지 않도록 옛 이름을 남긴다. SQL Server의
  // 문자열 비교는 대소문자·끝 공백을 무시해 실제보다 넓게 잡힐 수 있지만, 그 경우도 옛 이름을 남기는
  // 쪽이라 어느 기관의 판정도 바뀌지 않는다.
  const keepOldName = (await tx.institution.count({ where: { id: { not: institutionId }, institutionName: oldName } })) > 0;
  const changes: AffiliatedNamesChange[] = [];
  for (const agency of agencies) {
    let names: unknown;
    try {
      names = JSON.parse(agency.affiliatedInstitutionNames ?? "[]");
    } catch {
      continue;
    }
    if (!Array.isArray(names) || !names.every((n) => typeof n === "string")) continue;
    const next = renameInAffiliatedNames(names, oldName, newName, keepOldName);
    if (!next) continue;
    await tx.fundingAgency.update({ where: { id: agency.id }, data: { affiliatedInstitutionNames: JSON.stringify(next) } });
    await writeAuditLog(tx, {
      actorUserId,
      entityType: "fundingAgency",
      entityId: agency.id,
      entityLabel: agency.name,
      action: "UPDATE",
      before: { affiliatedInstitutionNames: names },
      after: { affiliatedInstitutionNames: next },
    });
    changes.push({ id: agency.id, affiliatedInstitutionNames: next });
  }
  return changes;
}

class InstitutionNotFoundError extends Error {}

// 수정 저장이 실패했을 때 화면(store)이 서버에 실제로 저장된 값으로 되돌리는 데 쓴다.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const row = UUID_RE.test(id) ? await prisma.institution.findUnique({ where: { id }, include: { contacts: true } }) : null;
  if (!row) return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true, institution: toInstitution(row) });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("institutions");
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

  // 기관명은 앞뒤 공백을 지우고, 비었거나(공백뿐 포함) DB 제한(200자)을 넘으면 저장하지 않는다.
  let nextName: string | undefined;
  if (body.name !== undefined) {
    const checked = validateInstitutionName(body.name);
    if (!checked.ok) return Response.json({ ok: false, error: checked.error }, { status: 400 });
    nextName = checked.name;
  }

  if (!UUID_RE.test(id)) return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });

  let result;
  try {
    // 이름 정정은 과제 복사본·전담기관 소속기관 목록까지 여러 행을 함께 고치므로, 다른 쓰기 라우트처럼
    // 동시 실행 수를 제한하고(withDbWriteSlot) 데드락이면 재시도한다. 원격 DB 왕복이 쌓여도 기본
    // 트랜잭션 시간(5초)에 걸려 중간에 끊기지 않도록 여유를 둔다.
    result = await withDbWriteSlot(() => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      // 트랜잭션 첫 문장에서 이 기관 행을 갱신해 배타 잠금을 잡고, 그 뒤에 수정 전 값을 읽는다(lib/receivable-write.ts와
      // 같은 방식). 트랜잭션 밖에서 읽은 옛 이름을 쓰면, 같은 기관의 이름 정정이 동시에 들어왔을 때 뒤 요청이
      // 이미 바뀐 소속기관 목록에서 옛 이름을 찾지 못해 목록이 기관명과 어긋난 채로 남는다.
      const { count } = await tx.institution.updateMany({ where: { id }, data: { updatedAt: new Date() } });
      if (count === 0) throw new InstitutionNotFoundError();
      const before = await tx.institution.findUniqueOrThrow({ where: { id }, include: { contacts: true } });

      await tx.institution.update({
        where: { id },
        data: {
          institutionName: nextName,
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
          await tx.institutionContact.update({
            where: { id: primary.id },
            data: { name: body.contactName, phone: body.contactPhone ?? primary.phone, email: body.contactEmail ?? primary.email },
          });
        } else if (body.contactName) {
          await tx.institutionContact.create({
            data: { institutionId: id, name: body.contactName, phone: body.contactPhone || null, email: body.contactEmail || null, isPrimary: true },
          });
        }
      }

      if (nextName !== undefined) await syncLeadInstitutionNameCopies(tx, id, nextName);
      const agencies = nextName !== undefined && nextName !== before.institutionName
        ? await renameAffiliatedInstitutionName(tx, actor.userId, id, before.institutionName, nextName)
        : [];

      const full = await tx.institution.findUniqueOrThrow({ where: { id }, include: { contacts: true } });
      const afterInstitution = toInstitution(full);
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        entityType: "institution",
        entityId: id,
        entityLabel: afterInstitution.name,
        action: "UPDATE",
        before: toInstitution(before) as unknown as Record<string, unknown>,
        after: afterInstitution as unknown as Record<string, unknown>,
      });
      return { institution: afterInstitution, agencies };
    }, { maxWait: 10_000, timeout: 30_000 })));
  } catch (err) {
    if (err instanceof InstitutionNotFoundError) {
      return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return Response.json({ ok: false, error: "이미 등록된 사업자등록번호입니다." }, { status: 409 });
    }
    console.error("기관 수정 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "기관 정보를 수정하지 못했습니다.") }, { status: 500 });
  }

  invalidateCache(INSTITUTIONS_CACHE_KEY);
  if (result.agencies.length > 0) invalidateCache(FUNDING_AGENCIES_CACHE_KEY);
  return Response.json({ ok: true, institution: result.institution, fundingAgencies: result.agencies });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("institutions");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.institution.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "기관을 찾을 수 없습니다." }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.institution.delete({ where: { id } });
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        entityType: "institution",
        entityId: target.id,
        entityLabel: target.institutionName,
        action: "DELETE",
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: `"${target.institutionName}"은(는) 다른 데이터에서 참조 중이라 삭제할 수 없습니다. 삭제 대신 상태를 "비활성"으로 변경해주세요.` },
        { status: 409 }
      );
    }
    throw err;
  }

  invalidateCache(INSTITUTIONS_CACHE_KEY);
  return Response.json({ ok: true });
}
