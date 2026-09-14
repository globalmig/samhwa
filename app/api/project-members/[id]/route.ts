import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

type Params = { params: Promise<{ id: string }> };
type SharedExtra = Record<string, unknown>;

// 커넥션 풀(10) 고갈로 인한 타임아웃/재시도 유도 에러는 흔히 발생하는 일시적 문제라, 클라이언트가
// (내부 ERP 사용자 대상이라) 원인을 보고 스스로 "잠시 후 재시도"를 판단할 수 있게 Prisma 오류코드를
// 그대로 노출한다 — 쿼리문·테이블명 등 민감한 내용은 포함되지 않는다.
function describeDbError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2024") return "서버가 혼잡해 시간 내에 처리하지 못했습니다(P2024, DB 커넥션 풀 고갈). 잠시 후 다시 시도해주세요.";
    if (["P1001", "P1002", "P1008", "P1017"].includes(err.code)) {
      return `데이터베이스 연결 문제로 처리하지 못했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
    }
    return `데이터 처리 중 오류가 발생했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
  }
  return "참여기관 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    // 과제상세 수정("projects")뿐 아니라, 수수료청구관리 RCMS 엑셀 일괄등록("fees")과 수행기관관리의
    // 정산면제리스트 일괄반영("institutions", ExemptionListUploadModal → applyInstitutionGradeToProjects)도
    // 이 라우트로 참여기관 등급 등을 갱신한다.
    actor = await requireWriteAccess(["projects", "fees", "institutions"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<ProjectMember>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const sharedKeys = [
    "feeRate", "calculatedFee", "institutionGrade", "gradeOverrides", "contactName", "contactEmail",
    "contactPhone", "recipientOverrides", "settlementType", "settlementTypeOverrides", "exemptRefGrade", "role",
  ] as const;
  const hasSharedPatch = sharedKeys.some((k) => k in body);
  const newRole = body.role !== undefined ? (body.role === "LEAD" ? "MAIN" : "PARTICIPATING") : undefined;

  // anchor/siblings 조회를 트랜잭션 밖, withDbWriteSlot 밖에서 실행하면 이 두 읽기가 커넥션 풀
  // 동시성 제한(MAX_CONCURRENT_WRITES)을 안 거치고 무제한으로 몰릴 수 있다 — 엑셀 대량 업로드처럼
  // 클라이언트가 초당 여러 건을 쏘는 상황에서, 트랜잭션(쓰기)은 7개로 제한되지만 이 읽기들은
  // 그렇지 않아 DATABASE_URL의 connectionLimit(10)을 실제로 고갈시킬 수 있었다(P2024 타임아웃의
  // 유력한 원인). 그래서 한 건의 PATCH가 쓰는 모든 DB 작업(읽기+쓰기)을 통째로 같은 슬롯 안에서
  // 실행해, 이 라우트가 프로세스 전체에서 동시에 점유하는 커넥션 수를 실제로 MAX_CONCURRENT_WRITES
  // 개로 묶는다.
  let member;
  let notFound = false;
  try {
    member = await withDbWriteSlot(async () => {
      const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: PTI_INCLUDE });
      if (!anchor) {
        notFound = true;
        return undefined;
      }

      const projectId = anchor.projectTerm.projectId;
      const institutionId = anchor.institutionId;
      const siblings = await prisma.projectTermInstitution.findMany({
        where: { institutionId, projectTerm: { projectId } },
        include: PTI_INCLUDE,
      });
      const [beforeMember] = groupPtisToMembers(siblings);

      return prisma.$transaction(async (tx) => {
        if (hasSharedPatch || newRole) {
          for (const row of siblings) {
            const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
            const nextExtra = { ...rowExtra };
            for (const key of sharedKeys) {
              if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
            }
            await tx.projectTermInstitution.update({
              where: { id: row.id },
              data: { extraData: JSON.stringify(nextExtra), role: newRole ?? undefined },
            });
          }
        }

        if (body.annualBudgets && body.annualBudgets.length > 0) {
          const role = newRole ?? anchor.role;
          for (const ab of body.annualBudgets) {
            const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
            const ptiId = await getOrCreatePti(tx, projectId, ab.termNumber, institutionId, role, budget, ab.termYear);
            const row = await tx.projectTermInstitution.findUniqueOrThrow({ where: { id: ptiId } });
            const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
            await tx.projectTermInstitution.update({
              where: { id: ptiId },
              data: {
                projectBudget: budget,
                extraData: JSON.stringify({
                  ...rowExtra, cashBudget: ab.cashBudget, inKindBudget: ab.inKindBudget,
                  termStartDate: ab.termStartDate, termEndDate: ab.termEndDate, auditFirm: ab.auditFirm,
                }),
              },
            });
          }
        } else if (body.budget !== undefined || body.cashBudget !== undefined || body.inKindBudget !== undefined) {
          // annualBudgets 없이 단일 예산만 바뀐 경우 — 기존 대표 행(anchor)의 예산만 갱신
          const rowExtra: SharedExtra = anchor.extraData ? JSON.parse(anchor.extraData) : {};
          await tx.projectTermInstitution.update({
            where: { id: anchor.id },
            data: {
              projectBudget: body.budget !== undefined ? BigInt(Math.round(body.budget)) : undefined,
              extraData: JSON.stringify({
                ...rowExtra,
                cashBudget: body.cashBudget !== undefined ? body.cashBudget : rowExtra.cashBudget,
                inKindBudget: body.inKindBudget !== undefined ? body.inKindBudget : rowExtra.inKindBudget,
              }),
            },
          });
        }

        const updatedRows = await tx.projectTermInstitution.findMany({
          where: { institutionId, projectTerm: { projectId } },
          include: PTI_INCLUDE,
        });
        const [afterMember] = groupPtisToMembers(updatedRows);

        await writeAuditLog(tx, {
          actorUserId: actor.userId,
          entityType: "projectMember",
          entityId: id,
          entityLabel: `${afterMember.projectNumber} · ${afterMember.institutionName}`,
          action: "UPDATE",
          before: beforeMember as unknown as Record<string, unknown>,
          after: afterMember as unknown as Record<string, unknown>,
        });

        return afterMember;
      });
    });
  } catch (err) {
    // anchor 조회부터 트랜잭션까지, 이 요청이 하는 모든 DB 작업 중 어디서든 터지는 에러(커넥션
    // 풀 고갈, BigInt 변환 실패, 제약조건 위반 등)를 그대로 흘려보내면 Next.js가 빈 본문의 500을
    // 응답하고, 클라이언트는 res.json()에서 "Unexpected end of JSON input"이라는 원인과 무관한
    // 에러만 보게 된다 — 여기서 잡아 서버 로그에 전체 스택을 남기고, 클라이언트에도 파싱 가능한
    // (Prisma 오류코드가 실린) 에러 응답을 준다.
    console.error(`[project-members PATCH] id=${id} body=${JSON.stringify(body)} 처리 중 오류:`, err);
    return Response.json({ ok: false, error: describeDbError(err) }, { status: 500 });
  }

  if (notFound) return Response.json({ ok: false, error: "참여기관 정보를 찾을 수 없습니다." }, { status: 404 });

  return Response.json({ ok: true, member });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("projects");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let notFound = false;
  try {
    // PATCH와 동일한 이유로 anchor/siblings 조회부터 트랜잭션까지 하나의 write slot 안에서
    // 실행해, 대량 처리 중 이 라우트가 동시에 점유하는 DB 커넥션 수를 MAX_CONCURRENT_WRITES로
    // 묶는다 — [id]/route.ts PATCH 참고.
    await withDbWriteSlot(async () => {
      const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: PTI_INCLUDE });
      if (!anchor) {
        notFound = true;
        return;
      }

      const siblings = await prisma.projectTermInstitution.findMany({
        where: { institutionId: anchor.institutionId, projectTerm: { projectId: anchor.projectTerm.projectId } },
        select: { id: true },
      });
      const ptiIds = siblings.map((s) => s.id);

      await prisma.$transaction(async (tx) => {
        await tx.projectTermInstitution.deleteMany({ where: { id: { in: ptiIds } } });
        await writeAuditLog(tx, {
          actorUserId: actor.userId,
          entityType: "projectMember",
          entityId: anchor.id,
          entityLabel: `${anchor.projectTerm.project.projectNumber} · ${anchor.institution.institutionName}`,
          action: "DELETE",
        });
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: "이 참여기관은 연차수수료·미수금·세금계산서·정산 등에서 이미 참조 중이라 삭제할 수 없습니다." },
        { status: 409 }
      );
    }
    console.error(`[project-members DELETE] id=${id} 처리 중 오류:`, err);
    return Response.json({ ok: false, error: describeDbError(err) }, { status: 500 });
  }

  if (notFound) return Response.json({ ok: false, error: "참여기관 정보를 찾을 수 없습니다." }, { status: 404 });

  return Response.json({ ok: true });
}
