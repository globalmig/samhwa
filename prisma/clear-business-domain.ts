/**
 * "수수료 청구 관리"(/fees) 데모 데이터 정리 — 일회성 스크립트.
 * institutions ~ project_issues(prisma/reseed-business-domain.ts가 채운 14개 테이블)를
 * 전부 비운다. funding_agencies/fee_policies/users 등 이미 실제 운영 데이터가 있는 테이블은
 * 이 스크립트가 알지도, 건드리지도 않는다. 나중에 데모 데이터가 다시 필요하면
 * prisma/reseed-business-domain.ts를 재실행하면 된다(그게 이 데이터의 유일한 출처).
 *
 * 실행: npx tsx prisma/clear-business-domain.ts (원격 서버 안에서, DATABASE_URL=SamhwaFee)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== 수수료 청구 관리(과제~이슈) 데모 데이터 정리 시작 ===");
  // 자식 -> 부모 순.
  const tables = [
    "payment_histories", "receivables", "claims",
    "tax_invoices", "settlements",
    "unclaimed_fees", "term_fees", "term_fee_calcs",
    "project_issues",
    "project_term_institutions", "project_terms", "projects",
    "institution_contacts", "institutions",
  ];
  for (const t of tables) {
    const result: unknown = await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
    console.log(`  ${t}: ${result}건 삭제`);
  }
  console.log("=== 정리 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
