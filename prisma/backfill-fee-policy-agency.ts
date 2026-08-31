/**
 * 1회성 백필 스크립트 (2026-08-31).
 * fee_policies.funding_agency_id 컬럼을 뒤늦게 추가하면서, 이미 시드돼있던 11개 정책 행에는
 * 이 값이 비어있다. prisma/seed.ts를 다시 돌리면 방금 만든 마스터/개발자 계정까지 날아가므로,
 * mock.ts의 policyName -> agencyId 매핑을 그대로 이용해 기존 행만 UPDATE한다.
 * 실행: npx tsx prisma/backfill-fee-policy-agency.ts
 */
import { PrismaClient } from "@prisma/client";
import { feePolicies as mockFeePolicies, fundingAgencies as mockFundingAgencies } from "../lib/mock";

const prisma = new PrismaClient();

async function main() {
  console.log("=== fee_policies.funding_agency_id 백필 ===");
  let updated = 0, skipped = 0;

  for (const fp of mockFeePolicies) {
    const dbPolicy = await prisma.feePolicy.findFirst({ where: { policyName: fp.name } });
    if (!dbPolicy) {
      console.log(`  건너뜀(DB에 없음): ${fp.name}`);
      skipped++;
      continue;
    }
    if (dbPolicy.fundingAgencyId) {
      skipped++;
      continue; // 이미 채워져 있으면 건드리지 않음
    }
    if (!fp.agencyId) {
      // 공통(전역) 정책 — null 유지가 맞으므로 스킵
      skipped++;
      continue;
    }
    const shortName = mockFundingAgencies.find((a) => a.id === fp.agencyId)?.shortName;
    if (!shortName) {
      console.log(`  경고: mock agencyId=${fp.agencyId}에 대응하는 전담기관을 못 찾음 (${fp.name})`);
      skipped++;
      continue;
    }
    const dbAgency = await prisma.fundingAgency.findUnique({ where: { shortName } });
    if (!dbAgency) {
      console.log(`  경고: shortName=${shortName} 전담기관이 DB에 없음 (${fp.name})`);
      skipped++;
      continue;
    }
    await prisma.feePolicy.update({ where: { id: dbPolicy.id }, data: { fundingAgencyId: dbAgency.id } });
    console.log(`  업데이트: ${fp.name} -> ${shortName}`);
    updated++;
  }

  console.log(`=== 완료: ${updated}건 업데이트, ${skipped}건 건너뜀 ===`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
