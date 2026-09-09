import { Prisma, type PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// projectId+termNumber+institutionId 조합에 대응하는 project_term_institutions 행을 찾거나,
// 없으면 필요한 project_terms 행까지 만들어가며 새로 만든다. prisma/reseed-business-domain.ts의
// getOrCreatePti와 동일한 로직 — 시딩 시점 이후 앱에서 새 연차/참여기관이 생길 때도 그대로 재사용한다.
//
// 세금계산서 발행과 채권 생성처럼 같은 (project, term, institution)에 대해 거의 동시에 두 요청이
// 들어오면, 둘 다 "아직 없다"고 보고 동시에 project_terms/project_term_institutions를 새로 만들려다
// 하나가 유니크 제약(수정 9)에 걸려 500으로 실패할 수 있었다 — 그 결과 화면에는 방금 발행한 계산서가
// 잠깐 보였다가 서버 저장 실패로 롤백되어 사라지는 것처럼 보였다. 유니크 제약 위반을 "이미 다른 요청이
// 만들어뒀다"는 신호로 보고 그 행을 다시 조회해 쓰도록 방어한다.
//
// termYear(선택): project_terms 행을 처음 만들 때 실제 이 연차의 캘린더 연도를 알고 있는 호출측
// (예: autoGenerateTermFees가 termStartDate 기준으로 계산한 값)이 넘겨준다 — 안 넘기면 project.
// startYear로 임시 채운다(수정 10 이전엔 이게 유일한 값이라 다년차 과제의 2연차 이후가 전부 시작
// 연도로 고정돼, 세금계산서/채권의 termYear와 클라이언트가 다시 계산한 termYear가 어긋나 과제상세의
// "발행됨" 표시가 안 뜨는 원인이 됐다). 이미 만들어져 있는 행이라도 올바른 termYear를 알게 됐다면
// 그 자리에서 바로잡아, 예전에 잘못 저장된 과제도 이 함수가 다시 호출될 때(수수료 관리 탭을 열 때마다
// 실행되는 sync-fees 등) 스스로 복구되게 한다.
export async function getOrCreatePti(
  tx: Tx,
  projectId: string,
  termNumber: number,
  institutionId: string,
  role: string,
  budget: bigint,
  termYear?: number
): Promise<string> {
  const existing = await tx.projectTermInstitution.findFirst({
    where: { institutionId, projectTerm: { projectId, termNumber } },
    include: { projectTerm: true },
  });
  if (existing) {
    if (termYear !== undefined && existing.projectTerm.termYear !== termYear) {
      await tx.projectTerm.update({ where: { id: existing.projectTerm.id }, data: { termYear } });
    }
    return existing.id;
  }

  let term = await tx.projectTerm.findFirst({ where: { projectId, termNumber } });
  if (!term) {
    try {
      const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
      term = await tx.projectTerm.create({
        data: { projectId, termYear: termYear ?? project.startYear, termNumber, totalBudget: BigInt(0) },
      });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
      term = await tx.projectTerm.findFirst({ where: { projectId, termNumber } });
      if (!term) throw err;
    }
  } else if (termYear !== undefined && term.termYear !== termYear) {
    term = await tx.projectTerm.update({ where: { id: term.id }, data: { termYear } });
  }

  try {
    const row = await tx.projectTermInstitution.create({
      data: { projectTermId: term.id, institutionId, role, projectBudget: budget },
    });
    return row.id;
  } catch (err) {
    if (!isUniqueConstraintError(err)) throw err;
    const row = await tx.projectTermInstitution.findFirst({ where: { projectTermId: term.id, institutionId } });
    if (!row) throw err;
    return row.id;
  }
}
