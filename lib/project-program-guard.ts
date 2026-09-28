import { prisma } from "@/lib/db";
import { sanitizeProjectProgramFields, type ProgramPolicyLike } from "@/lib/fee-calculator";
import type { Project } from "@/lib/mock";

// 서버 쪽 최종 방어선 — 화면(폼)과 스토어(addProject/updateProject)가 이미 같은 규칙으로 걸러내지만, API를
// 직접 호출하거나 오래된 화면(배포 전 번들)이 보낸 요청은 그걸 거치지 않는다. 전담기관 정책과 모순되는
// 자율성트랙(hasAutonomyTrack=false 전담기관)/사업 유형(ICT 기금사업 정책이 없는 전담기관)은 여기서도
// 일반과제/일반 R&D로 바로잡아 저장한다.
async function loadActivePolicies(): Promise<ProgramPolicyLike[]> {
  // 정책은 전담기관 수 × 사업 유형 정도(수십 건 미만)라 필요한 컬럼만 전부 읽어도 부담이 없다.
  const rows = await prisma.feePolicy.findMany({
    where: { status: "ACTIVE" },
    select: { fundingAgencyId: true, programType: true, hasAutonomyTrack: true },
  });
  return rows.map((r) => ({
    agencyId: r.fundingAgencyId,
    status: "ACTIVE" as const,
    programType: (r.programType as Project["programType"]) ?? undefined,
    hasAutonomyTrack: r.hasAutonomyTrack,
  }));
}

export async function sanitizeProjectProgramFieldsFromDb<T extends Pick<Project, "agencyId" | "projectType" | "programType">>(project: T): Promise<T> {
  return sanitizeProjectProgramFields(project, await loadActivePolicies());
}
