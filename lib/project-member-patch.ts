import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectMember } from "@/lib/mock";

export const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

type SharedExtra = Record<string, unknown>;

const SHARED_KEYS = [
  "feeRate", "calculatedFee", "institutionGrade", "gradeOverrides", "contactName", "contactEmail",
  "contactPhone", "recipientOverrides", "settlementType", "settlementTypeOverrides", "exemptRefGrade", "role",
] as const;

// 커넥션 풀(10) 고갈로 인한 타임아웃/재시도 유도 에러는 흔히 발생하는 일시적 문제라, 클라이언트가
// (내부 ERP 사용자 대상이라) 원인을 보고 스스로 "잠시 후 재시도"를 판단할 수 있게 Prisma 오류코드를
// 그대로 노출한다 — 쿼리문·테이블명 등 민감한 내용은 포함되지 않는다.
export function describeDbError(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2024") return "서버가 혼잡해 시간 내에 처리하지 못했습니다(P2024, DB 커넥션 풀 고갈). 잠시 후 다시 시도해주세요.";
    if (["P1001", "P1002", "P1008", "P1017"].includes(err.code)) {
      return `데이터베이스 연결 문제로 처리하지 못했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
    }
    return `데이터 처리 중 오류가 발생했습니다(${err.code}). 잠시 후 다시 시도해주세요.`;
  }
  return "참여기관 정보를 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export type MemberPatchResult =
  | { ok: true; member: ProjectMember }
  | { ok: false; status: 404; error: string };

// 같은 (institutionId, projectId)를 가리키는 여러 참여기관 patch가 동시에 들어오면(엑셀 대량 업로드와
// 수동 수정이 겹치는 등) 각 호출이 siblings를 stale 스냅샷으로 읽고 그 기준으로 트랜잭션 안에서 다시
// 쓰게 돼, 나중에 커밋되는 쪽이 앞선 변경을 덮어쓸 수 있다(lost update). 게다가 두 트랜잭션이 같은
// 행들을 서로 다른 순서로 잠그면 SQL Server가 데드락으로 감지해 하나를 강제 종료한다 — 실제로
// P2028(트랜잭션 타임아웃)·P2034(데드락/write conflict)로 관측됐다. withDbWriteSlot(동시 실행 개수
// 제한)과는 별개 문제라 슬롯을 늘려도 해결되지 않는다 — 같은 참여기관을 가리키는 요청끼리는 항상
// 순서대로(siblings 조회부터 트랜잭션 커밋까지) 실행되게 강제한다. 프로세스 인메모리 락이라 서버
// 인스턴스가 여러 개로 늘어나면 무력화된다는 점은 withDbWriteSlot과 동일(lib/db.ts 참고) — 지금은
// 단일 인스턴스 전제로 충분하다.
const _memberLocks = new Map<string, Promise<unknown>>();

export function withMemberLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = _memberLocks.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn); // 앞선 작업이 실패했어도 이어서 실행한다 — 한 건의 실패가 이후 요청을 영원히 막으면 안 된다.
  const tracked = run.catch(() => {}); // 체인 추적용 사본 — 실패를 삼켜서 다음 대기자의 .then이 끊기지 않게 한다.
  _memberLocks.set(key, tracked);
  tracked.finally(() => {
    // 그 사이 아무도 새로 대기열에 들어오지 않았을 때만(=이 항목이 여전히 최신) 정리한다 — 안 그러면
    // 방금 들어온 다음 대기자의 항목을 지워버릴 수 있다.
    if (_memberLocks.get(key) === tracked) _memberLocks.delete(key);
  });
  return run;
}

// PATCH /api/project-members/[id]와 POST /api/project-members/bulk-patch(엑셀 대량 업로드 등)가
// 공유하는 핵심 로직 — 참여기관 한 건을 patch한다. 의도적으로 write slot(withDbWriteSlot)을
// 스스로 acquire하지 않는다 — 호출자가 감싸야 한다: 단건 라우트는 이 함수 호출 한 번을 슬롯 하나로
// 감싸면 되지만, bulk-patch 라우트는 여러 건을 반복 호출하는 루프 전체를 슬롯 하나로 감싸야
// (건마다 새로 슬롯을 받지 않아야) 대량 처리 중 이 라우트가 프로세스 전체에서 동시에 점유하는 DB
// 커넥션 수가 실제로 제한된다.
export async function applyProjectMemberPatch(
  id: string,
  body: Partial<ProjectMember>,
  actorUserId: string,
): Promise<MemberPatchResult> {
  const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: PTI_INCLUDE });
  if (!anchor) return { ok: false, status: 404, error: "참여기관 정보를 찾을 수 없습니다." };

  const projectId = anchor.projectTerm.projectId;
  const institutionId = anchor.institutionId;

  // siblings 조회부터 트랜잭션 커밋까지 전체를 락 안에서 실행한다 — 락 밖에서 미리 읽어두면, 락을
  // 기다리는 동안 다른 요청이 먼저 커밋한 변경을 놓친 채(stale) 그 위에 덮어써 버린다.
  const afterMember = await withMemberLock(`${institutionId}:${projectId}`, async () => {
    const siblings = await prisma.projectTermInstitution.findMany({
      where: { institutionId, projectTerm: { projectId } },
      include: PTI_INCLUDE,
    });
    const [beforeMember] = groupPtisToMembers(siblings);

    const hasSharedPatch = SHARED_KEYS.some((k) => k in body);
    const newRole = body.role !== undefined ? (body.role === "LEAD" ? "MAIN" : "PARTICIPATING") : undefined;

    return prisma.$transaction(async (innerTx) => {
      if (hasSharedPatch || newRole) {
        for (const row of siblings) {
          const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
          const nextExtra = { ...rowExtra };
          for (const key of SHARED_KEYS) {
            if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
          }
          await innerTx.projectTermInstitution.update({
            where: { id: row.id },
            data: { extraData: JSON.stringify(nextExtra), role: newRole ?? undefined },
          });
        }
      }

      if (body.annualBudgets && body.annualBudgets.length > 0) {
        const role = newRole ?? anchor.role;
        for (const ab of body.annualBudgets) {
          const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
          const ptiId = await getOrCreatePti(innerTx, projectId, ab.termNumber, institutionId, role, budget, ab.termYear);
          const row = await innerTx.projectTermInstitution.findUniqueOrThrow({ where: { id: ptiId } });
          const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
          await innerTx.projectTermInstitution.update({
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
        await innerTx.projectTermInstitution.update({
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

      const updatedRows = await innerTx.projectTermInstitution.findMany({
        where: { institutionId, projectTerm: { projectId } },
        include: PTI_INCLUDE,
      });
      const [after] = groupPtisToMembers(updatedRows);

      await writeAuditLog(innerTx, {
        actorUserId,
        entityType: "projectMember",
        entityId: id,
        entityLabel: `${after.projectNumber} · ${after.institutionName}`,
        action: "UPDATE",
        before: beforeMember as unknown as Record<string, unknown>,
        after: after as unknown as Record<string, unknown>,
      });

      return after;
    });
  });

  return { ok: true, member: afterMember };
}
