import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { getOrCreatePti } from "@/lib/pti-helper";
import { toTermFee, type TermFeeWithRelations } from "@/lib/term-fee-mapper";
import type { TermFee, TermFeeCalc } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const MOCK_TO_DB_TERM_FEE_STATUS: Record<string, string> = { SCHEDULED: "DRAFT", DRAFT: "DRAFT", CONFIRMED: "CONFIRMED", BILLED: "BILLED" };
const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

// autoGenerateTermFees(lib/store.ts)가 클라이언트에서 계산을 끝낸 뒤, 그 결과(해당 프로젝트분
// termFees+termFeeCalcs 전체)를 통째로 넘겨받아 DB에 반영한다. 계산 로직 자체는 여기 없다 —
// 이미 계산이 끝난 최종 상태를 그대로 반영(upsert + 빠진 것 정리)만 한다.
export async function POST(request: Request, { params }: Params) {
  const { id: projectId } = await params;
  try {
    await requireWriteAccess(["fees", "projects"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: { termFees: TermFee[]; termFeeCalcs: TermFeeCalc[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const feePolicy =
    (project.fundingAgencyId && (await prisma.feePolicy.findFirst({ where: { fundingAgencyId: project.fundingAgencyId } }))) ??
    (await prisma.feePolicy.findFirst());
  if (!feePolicy) return Response.json({ ok: false, error: "적용 가능한 수수료 정책이 없습니다." }, { status: 400 });

  // upsert 후 실제 DB id(uniqueidentifier)를 담아 클라이언트에 그대로 돌려준다 — 클라이언트가 보낸
  // t.id는 autoGenerateTermFees(lib/store.ts)가 매번 새로 발급하는 임시 id(genId("tf"))라 이 upsert가
  // projectTermInstitutionId 기준으로 찾아 쓰는 실제 DB id와 다르다. 응답으로 실제 id를 안 돌려주면
  // 클라이언트 상태(_state.termFees)엔 계속 그 임시 id가 남아있게 되고, 이후 이 행에 대해
  // updateTermFee/setTermOtherFirmHandled 등으로 PATCH(persistTermFee)를 보낼 때마다 uniqueidentifier
  // 컬럼에 "tf_xxx" 같은 문자열을 못 넣어 서버가 500으로 죽어(운영 로그에서 반복 확인됨) 조용히 저장
  // 실패하는 문제가 있었다.
  // 엑셀 대량 업로드 중 여러 과제의 이 동기화가 동시에 돌면, 건드리는 행 자체는 과제별로 안 겹쳐도
  // SQL Server가 term_fees/project_term_institutions 등 같은 테이블의 잠금 경합을 데드락으로 판단해
  // 트랜잭션을 강제 종료시킬 수 있다(P2034, 과제 삭제에서 겪은 것과 같은 패턴) — withDeadlockRetry로
  // 재시도한다. upsertedTermFees는 재시도마다 새로 채워야 하므로(안 그러면 이전 시도의 결과가 남아
  // 중복된다) 트랜잭션 콜백 안에서 선언해 그 결과를 그대로 반환받는다. 이 라우트는 try/catch가
  // 아예 없어서, 재시도가 다 실패하거나 데이터 문제(예: 잘못된 금액값)로 던지는 예외가 그대로
  // Next.js의 원인 없는 빈 500으로 나가고 있었다 — 다른 라우트들과 같은 처리를 추가한다.
  let upsertedTermFees;
  try {
    upsertedTermFees = await withDbWriteSlot(() => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      const upsertedTermFees: TermFeeWithRelations[] = [];
      // term_fee_calcs: 이 과제분 전체를 교체
      await tx.termFeeCalc.deleteMany({ where: { projectId } });
      for (const tfc of body.termFeeCalcs) {
        await tx.termFeeCalc.create({
          data: {
            projectId,
            projectNumber: tfc.projectNumber,
            projectName: tfc.projectName,
            fundingAgencyId: project.fundingAgencyId ?? tfc.agencyId,
            termYear: tfc.termYear,
            termNumber: tfc.termNumber,
            stageNumber: tfc.stageNumber,
            workType: tfc.workType,
            totalCashBudget: BigInt(Math.round(tfc.totalCashBudget)),
            coInstCount: tfc.coInstCount,
            baseFee: BigInt(Math.round(tfc.baseFee)),
            addonFee: BigInt(Math.round(tfc.addonFee)),
            standardFee: BigInt(Math.round(tfc.standardFee)),
            nonExemptCashBudget: BigInt(Math.round(tfc.nonExemptCashBudget)),
            nonExemptCoInstCount: tfc.nonExemptCoInstCount,
            nonExemptBaseFee: BigInt(Math.round(tfc.nonExemptBaseFee)),
            nonExemptAddonFee: BigInt(Math.round(tfc.nonExemptAddonFee)),
            generalFee: BigInt(Math.round(tfc.generalFee)),
            exemptFeeTotal: BigInt(Math.round(tfc.exemptFeeTotal)),
            exemptBreakdown: JSON.stringify(tfc.exemptBreakdown ?? []),
            calculatedFee: BigInt(Math.round(tfc.calculatedFee)),
            generalCalcFee: BigInt(Math.round(tfc.generalCalcFee)),
            generalBillingFee: BigInt(Math.round(tfc.generalBillingFee)),
            generalUnclaimedFee: BigInt(Math.round(tfc.generalUnclaimedFee)),
            carriedOverUnclaimed: BigInt(Math.round(tfc.carriedOverUnclaimed)),
            totalBillingFee: BigInt(Math.round(tfc.totalBillingFee)),
            overrides: JSON.stringify(tfc.overrides ?? []),
            status: tfc.status,
          },
        });
      }

      // term_fees: (institutionId, termNumber) 기준으로 PTI를 찾거나 만들어 upsert
      const touchedPtiIds = new Set<string>();
      for (const t of body.termFees) {
        const ptiId = await getOrCreatePti(tx, projectId, t.termNumber, t.institutionId, "PARTICIPATING", BigInt(Math.round(t.budget)), t.termYear);
        touchedPtiIds.add(ptiId);
        const data = {
          feePolicyId: feePolicy.id,
          projectBudget: BigInt(Math.round(t.budget)),
          standardFee: BigInt(Math.round(t.standardFee ?? t.calculatedFee)),
          appliedFee: BigInt(Math.round(t.appliedFee)),
          billedFee: t.status === "BILLED" ? BigInt(Math.round(t.appliedFee)) : null,
          status: MOCK_TO_DB_TERM_FEE_STATUS[t.status] ?? "DRAFT",
          notes: t.manualOverrideReason ?? null,
          extraData: JSON.stringify({
            feeRate: t.feeRate, calculatedFee: t.calculatedFee, isAutoGenerated: t.isAutoGenerated,
            unclaimedFee: t.unclaimedFee, manualOverride: t.manualOverride, otherFirmHandled: t.otherFirmHandled,
            auditFirm: t.auditFirm, docRequestDate: t.docRequestDate, docReplyDate: t.docReplyDate,
            termStartDate: t.termStartDate, termEndDate: t.termEndDate, billingType: t.billingType,
            institutionType: t.institutionType,
          }),
        };
        const upserted = await tx.termFee.upsert({
          where: { projectTermInstitutionId: ptiId },
          create: { projectTermInstitutionId: ptiId, ...data },
          update: data,
          include: INCLUDE,
        });
        upsertedTermFees.push(upserted);
      }

      // 이 과제 소속 PTI 중 이번에 안 온 것들의 기존 term_fee는 엔진이 더 이상 유효하지 않다고
      // 판단한 것이므로 정리한다 (PTI 자체는 다른 도메인이 참조할 수 있어 지우지 않는다).
      const terms = await tx.projectTerm.findMany({ where: { projectId }, select: { id: true } });
      const allPtis = await tx.projectTermInstitution.findMany({
        where: { projectTermId: { in: terms.map((t) => t.id) } },
        select: { id: true },
      });
      const orphanIds = allPtis.map((p) => p.id).filter((ptiId) => !touchedPtiIds.has(ptiId));
      if (orphanIds.length > 0) {
        await tx.termFee.deleteMany({ where: { projectTermInstitutionId: { in: orphanIds } } });
      }

      return upsertedTermFees;
    })));
  } catch (err) {
    console.error("연차수수료 동기화 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "연차수수료를 동기화하지 못했습니다.") }, { status: 500 });
  }

  // 이 동작(자동 재계산 반영)은 사용자가 직접 하는 조작이 아니라 내부 시스템 처리라 사람이 보는
  // 변경이력에는 남기지 않는다 — 예전엔 매번 "termFeeSync" 항목이 찍혀 진짜 사용자 조작(과제 수정
  // 등)과 뒤섞여 변경이력을 알아보기 어렵게 만들었다.
  return Response.json({ ok: true, termFees: upsertedTermFees.map(toTermFee) });
}
