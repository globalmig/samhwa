import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

// projectId+termNumber+institutionId 조합에 대응하는 project_term_institutions 행을 찾거나,
// 없으면 필요한 project_terms 행까지 만들어가며 새로 만든다. prisma/reseed-business-domain.ts의
// getOrCreatePti와 동일한 로직 — 시딩 시점 이후 앱에서 새 연차/참여기관이 생길 때도 그대로 재사용한다.
export async function getOrCreatePti(
  tx: Tx,
  projectId: string,
  termNumber: number,
  institutionId: string,
  role: string,
  budget: bigint
): Promise<string> {
  const existing = await tx.projectTermInstitution.findFirst({
    where: { institutionId, projectTerm: { projectId, termNumber } },
  });
  if (existing) return existing.id;

  let term = await tx.projectTerm.findFirst({ where: { projectId, termNumber } });
  if (!term) {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    term = await tx.projectTerm.create({
      data: { projectId, termYear: project.startYear, termNumber, totalBudget: BigInt(0) },
    });
  }

  const row = await tx.projectTermInstitution.create({
    data: { projectTermId: term.id, institutionId, role, projectBudget: budget },
  });
  return row.id;
}
