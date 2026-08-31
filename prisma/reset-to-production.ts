/**
 * 1회성 운영 전환 스크립트 (2026-08-31).
 * - 전담기관 관리 / 수수료 기준 관리 / 공문 양식 관리 데이터(funding_agencies, fee_policies+규칙,
 *   agency_notice_templates, fee_invoice_templates, simple_notice_templates, standard_attachments,
 *   company_info)와 role_permissions(RBAC 설정)는 그대로 남긴다.
 * - 그 외 mock.ts 유래 데모 데이터(기관/과제/수수료/미수금/세금계산서/정산/이메일/공지/이슈/감사로그)와
 *   기존 데모 사용자 5명은 전부 삭제한다.
 * - 마스터 계정 1개 + 개발자 계정 1개를 새로 만든다 (둘 다 SYSTEM_ADMIN 권한).
 *
 * prisma/seed.ts(멱등, 데모 재시드용)와는 별개의 1회성 스크립트라 db:seed에 연결하지 않는다.
 * 실행: npx tsx prisma/reset-to-production.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const MASTER = { name: "마스터", email: "master@samhwaflow.co.kr", password: "master123" };
const DEVELOPER = { name: "개발자", email: "dev@samhwaflow.co.kr", password: "qgn^9523" };

// 그대로 남기는 테이블(전담기관/수수료기준/공문양식 + 권한설정) — 아래 목록엔 없음
const TABLES_TO_CLEAR = [
  "notification_state",
  "audit_logs",
  "email_logs",
  "email_batches",
  "notices",
  "project_issues",
  "settlement_histories",
  "settlements",
  "tax_invoice_histories",
  "tax_invoices",
  "tax_invoice_templates",
  "payment_histories",
  "receivables",
  "claims",
  "unclaimed_fees",
  "term_fees",
  "term_fee_calcs",
  "project_term_institutions",
  "project_terms",
  "projects",
  "institution_contacts",
  "institutions",
  "company_classification_histories",
  "company_classifications",
  "company_contacts",
  "companies",
];

async function main() {
  console.log("=== 운영 전환: 데모 데이터 정리 + 마스터/개발자 계정 생성 ===");

  // 1) 새 계정 먼저 생성 (실패 시 기존 계정이 남아있어 로그인 완전 두절 상황을 피함)
  const masterHash = await bcrypt.hash(MASTER.password, 10);
  const devHash = await bcrypt.hash(DEVELOPER.password, 10);

  const master = await prisma.user.create({
    data: { name: MASTER.name, email: MASTER.email, passwordHash: masterHash, role: "SYSTEM_ADMIN", status: "ACTIVE" },
  });
  const developer = await prisma.user.create({
    data: { name: DEVELOPER.name, email: DEVELOPER.email, passwordHash: devHash, role: "SYSTEM_ADMIN", status: "ACTIVE" },
  });
  console.log(`신규 계정 생성 완료: ${master.email}, ${developer.email}`);

  // 2) 데모 데이터 전부 삭제 (전담기관/수수료기준/공문양식/권한설정 테이블은 목록에 없어 그대로 남음)
  for (const t of TABLES_TO_CLEAR) {
    const result = await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
    console.log(`  ${t}: ${result}건 삭제`);
  }

  // 3) 기존 데모 사용자 5명 삭제 (방금 만든 master/developer는 제외)
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { notIn: [master.id, developer.id] } },
  });
  console.log(`기존 데모 사용자 삭제: ${deletedUsers.count}명`);

  const remaining = await prisma.user.findMany({ select: { name: true, email: true, role: true } });
  console.log("남은 계정:", remaining);

  console.log("=== 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
