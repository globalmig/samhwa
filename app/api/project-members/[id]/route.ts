import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { PTI_INCLUDE, applyProjectMemberPatch, describeDbError } from "@/lib/project-member-patch";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

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

  // applyProjectMemberPatch 자체는 write slot을 잡지 않으므로(bulk-patch가 여러 건을 슬롯 하나로
  // 묶어 호출할 수 있어야 해서), 단건 호출인 여기서 직접 한 번 감싼다 — lib/project-member-patch.ts
  // 상단 주석 참고. anchor/siblings 조회까지 슬롯 안에서 실행해야, 대량 업로드 중 이 라우트가
  // 실제로 점유하는 DB 커넥션 수가 MAX_CONCURRENT_WRITES로 제한된다(그렇지 않으면 조회가 무제한
  // 동시 실행돼 DATABASE_URL의 connectionLimit을 고갈시킬 수 있다).
  let result;
  try {
    result = await withDbWriteSlot(() => applyProjectMemberPatch(id, body, actor.userId));
  } catch (err) {
    // anchor 조회부터 트랜잭션까지, 이 요청이 하는 모든 DB 작업 중 어디서든 터지는 에러(커넥션
    // 풀 고갈, BigInt 변환 실패, 제약조건 위반 등)를 그대로 흘려보내면 Next.js가 빈 본문의 500을
    // 응답하고, 클라이언트는 res.json()에서 "Unexpected end of JSON input"이라는 원인과 무관한
    // 에러만 보게 된다 — 여기서 잡아 서버 로그에 전체 스택을 남기고, 클라이언트에도 파싱 가능한
    // (Prisma 오류코드가 실린) 에러 응답을 준다.
    console.error(`[project-members PATCH] id=${id} body=${JSON.stringify(body)} 처리 중 오류:`, err);
    return Response.json({ ok: false, error: describeDbError(err) }, { status: 500 });
  }

  if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
  return Response.json({ ok: true, member: result.member });
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
    // 실행해, 대량 처리 중 이 라우트가 동시에 점유하는 DB 커넥션 수를 묶는다.
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
