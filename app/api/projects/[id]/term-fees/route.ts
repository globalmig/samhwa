import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toTermFee, type TermFeeWithRelations } from "@/lib/term-fee-mapper";
import { toTermFeeCalc } from "@/lib/term-fee-calc-mapper";

export const runtime = "nodejs";

// project/institution은 toTermFee(lib/term-fee-mapper.ts)가 실제로 쓰는 필드만 select한다 —
// app/api/term-fees/route.ts의 INCLUDE와 동일한 이유(과다조회 방지).
const INCLUDE = {
  projectTermInstitution: {
    include: {
      projectTerm: { include: { project: { select: { projectNumber: true, projectName: true } } } },
      institution: { select: { institutionName: true, institutionType: true } },
    },
  },
} as const;

type Params = { params: Promise<{ id: string }> };

// 과제 상세의 수수료 탭이 다른 사용자의 변경을 주기적으로 반영하는 데 쓴다(lib/store.ts
// startPollingProjectFees) — GET /api/term-fees(전체 테이블)를 그대로 재사용하면 이 과제 하나만 보는
// 동안에도 회사 전체 연차수수료를 매번 다시 받아오게 되므로, 이 과제분(termFees+termFeeCalcs)만
// 좁혀서 한 번에 돌려준다. 조회 전용이라 requireWriteAccess가 아니라 requireUser만 확인한다.
export async function GET(request: Request, { params }: Params) {
  const { id: projectId } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const [termFeeRows, termFeeCalcRows] = await Promise.all([
    prisma.termFee.findMany({
      where: { projectTermInstitution: { projectTerm: { projectId } } },
      include: INCLUDE,
    }),
    prisma.termFeeCalc.findMany({ where: { projectId } }),
  ]);

  return Response.json({
    ok: true,
    termFees: (termFeeRows as TermFeeWithRelations[]).map(toTermFee),
    termFeeCalcs: termFeeCalcRows.map(toTermFeeCalc),
  });
}
