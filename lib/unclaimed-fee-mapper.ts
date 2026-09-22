import type { UnclaimedFee as PrismaUnclaimedFee, ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution } from "@prisma/client";
import type { UnclaimedFee } from "./mock";

// project/institution은 실제로 쓰는 필드(아래 toUnclaimedFee 참고)만 좁혀서 select한다 — project의
// extraData(NVarChar(Max), 연차별 이력이 쌓인 JSON)까지 매 행마다 통째로 끌고 오면 미청구건이
// 쌓일수록 이 API가 느려진다.
export type UnclaimedFeeWithRelations = PrismaUnclaimedFee & {
  projectTermInstitution: ProjectTermInstitution & {
    projectTerm: ProjectTerm & { project: Pick<PrismaProject, "projectNumber" | "projectName"> };
    institution: Pick<PrismaInstitution, "institutionName">;
  };
};

const DB_TO_MOCK_STATUS: Record<string, UnclaimedFee["status"]> = {
  UNCLAIMED: "PENDING", CARRIED_OVER: "CARRIED_OVER", SETTLED: "RESOLVED",
};
export const MOCK_TO_DB_STATUS: Record<string, string> = {
  PENDING: "UNCLAIMED", CARRIED_OVER: "CARRIED_OVER", RESOLVED: "SETTLED",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toUnclaimedFee(u: UnclaimedFeeWithRelations): UnclaimedFee {
  const pti = u.projectTermInstitution;
  return {
    id: u.id,
    projectNumber: pti.projectTerm.project.projectNumber,
    projectName: pti.projectTerm.project.projectName,
    leadInstitutionId: pti.institutionId,
    leadInstitutionName: pti.institution.institutionName,
    termYear: u.fiscalYear,
    termNumber: pti.projectTerm.termNumber,
    amount: Number(u.unclaimedAmount),
    occurredAt: toDateStr(u.createdAt),
    carriedOver: u.status === "CARRIED_OVER",
    status: DB_TO_MOCK_STATUS[u.status] ?? "PENDING",
  };
}
