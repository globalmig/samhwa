/**
 * Phase 1 데이터 마이그레이션 시드 스크립트.
 * lib/mock.ts의 현재 사이트 콘텐츠 전체를 SamhwaFee DB로 이관한다.
 * 재실행해도 안전하도록(멱등) 매번 관련 테이블을 전부 비우고 새로 채운다.
 * SamhwaRnD(레거시 DB)는 이 스크립트가 알지도, 접근하지도 않는다.
 *
 * 실행: npm run db:seed (원격 서버 안에서, DATABASE_URL=SamhwaFee)
 */
import { PrismaClient } from "@prisma/client";
import {
  institutions as mockInstitutions,
  fundingAgencies as mockFundingAgencies,
  agencyNoticeTemplates as mockAgencyNoticeTemplates,
  projects as mockProjects,
  projectMembers as mockProjectMembers,
  feePolicies as mockFeePolicies,
  termFees as mockTermFees,
  termFeeCalcs as mockTermFeeCalcs,
  unclaimedFees as mockUnclaimedFees,
  receivables as mockReceivables,
  settlements as mockSettlements,
  taxInvoices as mockTaxInvoices,
  emailDispatches as mockEmailDispatches,
  systemUsers as mockSystemUsers,
  projectIssues as mockProjectIssues,
  notices as mockNotices,
  standardAttachments as mockStandardAttachments,
  feeInvoiceTemplates as mockFeeInvoiceTemplates,
  simpleNoticeTemplates as mockSimpleNoticeTemplates,
  initialPageAccess,
  initialWriteAccess,
  COMPANY_INFO,
} from "../lib/mock";
import { AGENCY_GUIDE } from "../lib/agency-guide";
import bcrypt from "bcryptjs";

// 예전 lib/auth.ts에 있던 데모 계정 기본 비밀번호 — Phase 2에서 서버사이드 로그인으로 옮기며
// 이 파일로 이동. 값 자체는 그대로 유지 (기존 로그인 가능 계정/비밀번호가 바뀌지 않도록).
const DEMO_PASSWORDS: Record<string, string> = {
  "admin@samhwa.co.kr": "admin1234",
  "lee.acc@samhwa.co.kr": "samhwa1234",
  "park.set@samhwa.co.kr": "samhwa1234",
  "choi.view@samhwa.co.kr": "samhwa1234",
  "jung.acc@samhwa.co.kr": "samhwa1234",
};

const prisma = new PrismaClient();

// mock.ts Role -> Prisma user_role
const ROLE_MAP: Record<string, string> = {
  ADMIN: "SYSTEM_ADMIN",
  ACCOUNTANT: "ACCOUNTING",
  SETTLEMENT: "SETTLEMENT",
  VIEWER: "GENERAL",
};

function toDate(s?: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}
function toDateOrNow(s?: string | null): Date {
  return toDate(s) ?? new Date();
}
function big(n: number | undefined | null): bigint {
  return BigInt(Math.round(n ?? 0));
}

async function cleanTables() {
  // 자식 -> 부모 순서로 SamhwaFee만 정리 (SamhwaRnD는 이 스크립트가 모름)
  const tables = [
    "notification_state", "audit_logs",
    "email_logs", "email_batches",
    "notices", "project_issues",
    "settlement_histories", "settlements",
    "tax_invoice_histories", "tax_invoices", "tax_invoice_templates",
    "payment_histories", "receivables", "claims",
    "unclaimed_fees", "term_fees", "term_fee_calcs",
    "policy_change_histories",
    "fee_policy_exception_rules", "fee_policy_exemption_rules", "fee_policy_billing_ratio_rules",
    "fee_policy_company_class_rules", "fee_policy_settlement_type_rules", "fee_policy_project_type_rules",
    "fee_policy_institution_count_rules", "fee_policy_budget_rules", "fee_policy_exempt_grades", "fee_policies",
    "project_term_institutions", "project_terms", "projects",
    "agency_notice_templates", "funding_agencies",
    "fee_invoice_templates", "simple_notice_templates", "standard_attachments", "company_info",
    "institution_contacts", "institutions",
    "company_classification_histories", "company_classifications", "company_contacts", "companies",
    "role_permissions", "users",
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
  }
  console.log(`정리 완료: ${tables.length}개 테이블`);
}

async function main() {
  console.log("=== SamhwaFee Phase 1 시드 시작 ===");
  await cleanTables();

  // ── users + role_permissions ──────────────────────────────
  const userIdMap = new Map<string, string>(); // mock id -> db id
  const userNameToDbId = new Map<string, string>(); // name -> db id (권한/공문 매칭용)
  for (const u of mockSystemUsers) {
    // 원래 로그인 가능했던 비밀번호 그대로(회원가입/재설정 계정은 u.password, 초기 시드 계정은
    // DEMO_PASSWORDS) bcrypt 해시로 변환 — 값 자체를 새로 만들거나 바꾸지 않는다.
    const plainPassword = u.password ?? DEMO_PASSWORDS[u.email] ?? null;
    const passwordHash = plainPassword
      ? await bcrypt.hash(plainPassword, 10)
      : await bcrypt.hash(`unset-${u.id}-${Date.now()}`, 10); // 원본에 비밀번호가 없던 계정은 로그인 불가능한 임의 해시로 채움
    const row = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        name: u.name,
        role: ROLE_MAP[u.role] ?? "GENERAL",
        status: u.status,
        hiworksEmail: u.hiworksEmail ?? null,
        hiworksMailPassword: u.hiworksMailPassword ?? null,
        phone: u.phone ?? null,
        lastLoginAt: toDate(u.lastLoginAt),
        createdAt: toDateOrNow(u.registeredAt),
      },
    });
    userIdMap.set(u.id, row.id);
    userNameToDbId.set(u.name, row.id);
  }
  console.log(`users: ${mockSystemUsers.length}`);

  let rpCount = 0;
  for (const [path, roles] of Object.entries(initialPageAccess)) {
    for (const role of roles) {
      await prisma.rolePermission.create({
        data: { role: ROLE_MAP[role] ?? "GENERAL", resourceType: "MENU", resourceKey: path, action: "READ", isAllowed: true },
      });
      rpCount++;
    }
  }
  for (const [domain, roles] of Object.entries(initialWriteAccess)) {
    for (const role of roles) {
      await prisma.rolePermission.create({
        data: { role: ROLE_MAP[role] ?? "GENERAL", resourceType: "FEATURE", resourceKey: domain, action: "WRITE", isAllowed: true },
      });
      rpCount++;
    }
  }
  console.log(`role_permissions: ${rpCount}`);

  // ── institutions (Company/CompanyClassification은 mock에 대응 데이터 없어 시드 안 함) ──
  const instIdMap = new Map<string, string>();
  for (const inst of mockInstitutions) {
    const row = await prisma.institution.create({
      data: {
        institutionName: inst.name,
        businessNumber: inst.bizNumber || null,
        institutionType: inst.type,
        representativeName: inst.representativeName,
        phone: inst.contactPhone,
        email: inst.contactEmail,
        isActive: inst.status === "ACTIVE",
        notes: inst.note ?? null,
        createdAt: toDateOrNow(inst.registeredAt),
      },
    });
    instIdMap.set(inst.id, row.id);
  }
  console.log(`institutions: ${mockInstitutions.length}`);

  // institution_contacts: 기관 담당자 정보를 institution 필드에서 뽑아 최소 1건씩 생성
  let icCount = 0;
  for (const inst of mockInstitutions) {
    const instDbId = instIdMap.get(inst.id)!;
    if (inst.contactName) {
      await prisma.institutionContact.create({
        data: {
          institutionId: instDbId,
          name: inst.contactName,
          phone: inst.contactPhone || null,
          email: inst.contactEmail || null,
          isPrimary: true,
        },
      });
      icCount++;
    }
  }
  console.log(`institution_contacts: ${icCount}`);

  // ── funding_agencies + agency_notice_templates ────────────
  const agencyIdMap = new Map<string, string>(); // mock fa-xxx -> db id
  const agencyShortNameToDbId = new Map<string, string>();
  for (const fa of mockFundingAgencies) {
    const row = await prisma.fundingAgency.create({
      data: {
        name: fa.name,
        shortName: fa.shortName,
        code: fa.code,
        contactName: fa.contactName,
        contactEmail: fa.contactEmail,
        contactPhone: fa.contactPhone,
        status: fa.status,
        registeredAt: toDateOrNow(fa.registeredAt),
        website: fa.website ?? null,
        noticeRecipientScope: fa.noticeRecipientScope,
        autoDetectByLeadInstitution: !!fa.autoDetectByLeadInstitution,
        affiliatedInstitutionNames: fa.affiliatedInstitutionNames ? JSON.stringify(fa.affiliatedInstitutionNames) : null,
        specialNotes: fa.specialNotes ? JSON.stringify(fa.specialNotes) : null,
        guideContent: AGENCY_GUIDE[fa.shortName] ? JSON.stringify(AGENCY_GUIDE[fa.shortName]) : null,
      },
    });
    agencyIdMap.set(fa.id, row.id);
    agencyShortNameToDbId.set(fa.shortName, row.id);
  }
  console.log(`funding_agencies: ${mockFundingAgencies.length}`);

  let antCount = 0;
  for (const ant of mockAgencyNoticeTemplates) {
    const fundingAgencyId = agencyShortNameToDbId.get(ant.agencyShortName);
    if (!fundingAgencyId) continue;
    await prisma.agencyNoticeTemplate.create({
      data: { fundingAgencyId, name: ant.name, content: JSON.stringify(ant.content) },
    });
    antCount++;
  }
  console.log(`agency_notice_templates: ${antCount}`);

  // ── projects + project_terms (+ project_term_institutions from projectMembers) ──
  const projectIdMap = new Map<string, string>(); // mock p-xxx -> db id
  const projectNumberToDbId = new Map<string, string>();
  for (const p of mockProjects) {
    const startYear = toDateOrNow(p.startDate).getUTCFullYear();
    const endYear = toDateOrNow(p.endDate).getUTCFullYear();
    const row = await prisma.project.create({
      data: {
        projectNumber: p.projectNumber,
        projectName: p.projectName,
        projectType: p.projectType ?? "GENERAL",
        agency: p.agency,
        fundingAgencyId: agencyIdMap.get(p.agencyId) ?? null,
        settlementType: p.autonomySettlementType ?? "위탁정산",
        startYear,
        endYear: endYear >= startYear ? endYear : startYear,
        totalTerms: p.totalTerms,
        status: p.status,
        createdAt: toDateOrNow(p.registeredAt),
        extraData: JSON.stringify({
          firstStartDate: p.firstStartDate, finalEndDate: p.finalEndDate,
          stageStartDate: p.stageStartDate, stageEndDate: p.stageEndDate,
          annualFinancials: p.annualFinancials, usageReportDeadline: p.usageReportDeadline,
          agencyAssignedAt: p.agencyAssignedAt, internalAssignedAt: p.internalAssignedAt,
          projectCategory: p.projectCategory, researchLead: p.researchLead,
          researchLeadEmail: p.researchLeadEmail, researchLeadOverrides: p.researchLeadOverrides,
          projectCode: p.projectCode, termCodes: p.termCodes, projectDivision: p.projectDivision,
          billingType: p.billingType, agreementType: p.agreementType, stages: p.stages,
          autonomySettlementType: p.autonomySettlementType, programType: p.programType,
          assignedManagerPrimary: p.assignedManagerPrimary,
          assignedManagerPrimaryHistory: p.assignedManagerPrimaryHistory,
          assignedManager: p.assignedManager, assignedManagerHistory: p.assignedManagerHistory,
          currentTerm: p.currentTerm, leadInstitutionId: p.leadInstitutionId,
          leadInstitutionName: p.leadInstitutionName, totalBudget: p.totalBudget,
        }),
      },
    });
    projectIdMap.set(p.id, row.id);
    projectNumberToDbId.set(p.projectNumber, row.id);
  }
  console.log(`projects: ${mockProjects.length}`);

  // 연차(term) 정보 수집: annualBudgets + 각종 참조 테이블에서 termYear/termNumber를 모아
  // 프로젝트별로 필요한 연차를 전부 만든다.
  type TermInfo = { termYear: number; totalBudget: bigint };
  const termInfoByProject = new Map<string, Map<number, TermInfo>>(); // projectDbId -> termNumber -> info

  function ensureTermMap(projectDbId: string) {
    if (!termInfoByProject.has(projectDbId)) termInfoByProject.set(projectDbId, new Map());
    return termInfoByProject.get(projectDbId)!;
  }

  for (const pm of mockProjectMembers) {
    const projectDbId = projectIdMap.get(pm.projectId);
    if (!projectDbId) continue;
    const map = ensureTermMap(projectDbId);
    for (const ab of pm.annualBudgets ?? []) {
      const cur = map.get(ab.termNumber) ?? { termYear: ab.termYear, totalBudget: BigInt(0) };
      cur.totalBudget += big(ab.cashBudget) + big(ab.inKindBudget);
      cur.termYear = ab.termYear;
      map.set(ab.termNumber, cur);
    }
  }
  // annualBudgets가 아예 없는 참여기관만 있는 과제도 최소 1개 연차(project.currentTerm 또는 1)는 있어야 함
  for (const p of mockProjects) {
    const projectDbId = projectIdMap.get(p.id)!;
    const map = ensureTermMap(projectDbId);
    if (map.size === 0) {
      const startYear = toDateOrNow(p.startDate).getUTCFullYear();
      map.set(p.currentTerm || 1, { termYear: startYear, totalBudget: big(p.totalBudget) });
    }
  }
  // termFees/unclaimedFees/receivables/settlements/taxInvoices/termFeeCalcs가 참조하는 연차도 보장
  function touchTerm(projectNumber: string, termNumber: number, termYear: number) {
    const projectDbId = projectNumberToDbId.get(projectNumber);
    if (!projectDbId) return;
    const map = ensureTermMap(projectDbId);
    if (!map.has(termNumber)) map.set(termNumber, { termYear, totalBudget: BigInt(0) });
  }
  for (const t of mockTermFees) touchTerm(t.projectNumber, t.termNumber, t.termYear);
  for (const u of mockUnclaimedFees) touchTerm(u.projectNumber, u.termNumber, u.termYear);
  for (const r of mockReceivables) touchTerm(r.projectNumber, r.termNumber, r.termYear);
  for (const s of mockSettlements) touchTerm(s.projectNumber, 1, s.termYear); // Settlement엔 termNumber가 없어 1로 귀속
  for (const ti of mockTaxInvoices) touchTerm(ti.projectNumber, ti.termNumber, ti.termYear);

  const termIdMap = new Map<string, string>(); // `${projectDbId}|${termNumber}` -> db id
  let termCount = 0;
  for (const [projectDbId, map] of termInfoByProject) {
    for (const [termNumber, info] of map) {
      const row = await prisma.projectTerm.create({
        data: { projectId: projectDbId, termYear: info.termYear, termNumber, totalBudget: info.totalBudget },
      });
      termIdMap.set(`${projectDbId}|${termNumber}`, row.id);
      termCount++;
    }
  }
  console.log(`project_terms: ${termCount}`);

  // project_term_institutions: projectMembers.annualBudgets 기준 + 연차 정보 없는 멤버는 대표연차 1건
  const ptiIdMap = new Map<string, string>(); // `${projectDbId}|${termNumber}|${instDbId}` -> db id
  async function getOrCreatePti(projectDbId: string, termNumber: number, instDbId: string, role: string, budget: bigint) {
    const key = `${projectDbId}|${termNumber}|${instDbId}`;
    const existing = ptiIdMap.get(key);
    if (existing) return existing;
    let termId = termIdMap.get(`${projectDbId}|${termNumber}`);
    if (!termId) {
      // 참조는 있는데 연차가 아직 없으면 그때그때 만든다 (termYear는 알 수 없어 프로젝트 startYear로 근사)
      const proj = await prisma.project.findUniqueOrThrow({ where: { id: projectDbId } });
      const row = await prisma.projectTerm.create({
        data: { projectId: projectDbId, termYear: proj.startYear, termNumber, totalBudget: BigInt(0) },
      });
      termId = row.id;
      termIdMap.set(`${projectDbId}|${termNumber}`, termId);
      termCount++;
    }
    const row = await prisma.projectTermInstitution.create({
      data: { projectTermId: termId, institutionId: instDbId, role, projectBudget: budget },
    });
    ptiIdMap.set(key, row.id);
    return row.id;
  }

  let ptiCount = 0;
  for (const pm of mockProjectMembers) {
    const projectDbId = projectIdMap.get(pm.projectId);
    const instDbId = instIdMap.get(pm.institutionId);
    if (!projectDbId || !instDbId) continue;
    const role = pm.role === "LEAD" ? "MAIN" : "PARTICIPATING";
    const extra = JSON.stringify({
      feeRate: pm.feeRate, calculatedFee: pm.calculatedFee, institutionGrade: pm.institutionGrade,
      gradeOverrides: pm.gradeOverrides, contactName: pm.contactName, contactEmail: pm.contactEmail,
      contactPhone: pm.contactPhone, recipientOverrides: pm.recipientOverrides,
      settlementType: pm.settlementType, settlementTypeOverrides: pm.settlementTypeOverrides,
      exemptRefGrade: pm.exemptRefGrade, role: pm.role,
    });
    if (pm.annualBudgets && pm.annualBudgets.length > 0) {
      for (const ab of pm.annualBudgets) {
        const key = `${projectDbId}|${ab.termNumber}|${instDbId}`;
        if (ptiIdMap.has(key)) continue;
        const id = await getOrCreatePti(projectDbId, ab.termNumber, instDbId, role, big(ab.cashBudget) + big(ab.inKindBudget));
        await prisma.projectTermInstitution.update({ where: { id }, data: { extraData: extra } });
        ptiCount++;
      }
    } else {
      const proj = mockProjects.find((p) => p.id === pm.projectId);
      const id = await getOrCreatePti(projectDbId, proj?.currentTerm || 1, instDbId, role, big(pm.budget));
      await prisma.projectTermInstitution.update({ where: { id }, data: { extraData: extra } });
      ptiCount++;
    }
  }
  console.log(`project_term_institutions: ${ptiCount}`);

  // ── fee_policies (+ budget rules) ─────────────────────────
  const policyIdByAgency = new Map<string | null, string[]>(); // mock agencyId(or null=공통) -> [dbId,...]
  let feePolicyCount = 0, budgetRuleCount = 0, exemptGradeCount = 0;
  for (const [i, fp] of mockFeePolicies.entries()) {
    const row = await prisma.feePolicy.create({
      data: {
        policyName: fp.name,
        policyVersion: i + 1,
        description: fp.description ?? null,
        status: fp.status === "ACTIVE" ? "ACTIVE" : fp.status === "DRAFT" ? "DRAFT" : "ARCHIVED",
        effectiveFrom: toDate(fp.effectiveFrom),
        effectiveTo: toDate(fp.effectiveTo),
        approvedAt: fp.status === "ACTIVE" ? toDate(fp.effectiveFrom) : null,
        createdAt: toDateOrNow(fp.createdAt),
        fundingAgencyId: fp.agencyId ? agencyIdMap.get(fp.agencyId) ?? null : null,
        // 정규화된 전용 컬럼 — extraData와 동일한 mock 원본(fp)에서 그대로 옮겨서 값 불일치 위험 없음
        versionLabel: fp.version,
        standardRate: fp.standardRate,
        coInstAddonMethod: fp.coInstAddonMethod,
        coInstFirstRate: fp.coInstFirstRate ?? null,
        coInstAdditionalRate: fp.coInstAdditionalRate ?? null,
        exemptionMode: fp.exemptionMode,
        exemptCustomRate: fp.exemptCustomRate ?? null,
        defaultSettlementType: fp.defaultSettlementType ?? null,
        feeBasis: fp.feeBasis,
        hasAutonomyTrack: fp.hasAutonomyTrack,
        annualBillingRate: fp.annualBillingRate,
        minimumFee: fp.minimumFee == null ? null : big(fp.minimumFee),
        perInstitutionMinimumFee: fp.perInstitutionMinimumFee == null ? null : big(fp.perInstitutionMinimumFee),
        excludeLeadFromCalc: !!fp.excludeLeadFromCalc,
        calcMode: fp.calcMode ?? null,
        programType: fp.programType ?? null,
        legacyTransitionNote: fp.legacyTransitionNote ?? null,
        // 컬럼화 이후에도 원본 스냅샷은 그대로 유지 (이중 보존, 삭제하지 않음)
        extraData: JSON.stringify({
          coInstAddonMethod: fp.coInstAddonMethod, coInstFirstRate: fp.coInstFirstRate,
          coInstAdditionalRate: fp.coInstAdditionalRate, exemptGrades: fp.exemptGrades,
          exemptionMode: fp.exemptionMode, exemptCustomRate: fp.exemptCustomRate,
          defaultSettlementType: fp.defaultSettlementType, feeBasis: fp.feeBasis,
          hasAutonomyTrack: fp.hasAutonomyTrack, annualBillingRate: fp.annualBillingRate,
          minimumFee: fp.minimumFee, perInstitutionMinimumFee: fp.perInstitutionMinimumFee,
          excludeLeadFromCalc: fp.excludeLeadFromCalc, calcMode: fp.calcMode,
          programType: fp.programType, legacyTransitionNote: fp.legacyTransitionNote,
          standardRate: fp.standardRate, version: fp.version,
        }),
      },
    });
    feePolicyCount++;
    const key = fp.agencyId;
    if (!policyIdByAgency.has(key)) policyIdByAgency.set(key, []);
    policyIdByAgency.get(key)!.push(row.id);

    for (const grade of fp.exemptGrades) {
      await prisma.feePolicyExemptGrade.create({ data: { policyId: row.id, grade } });
      exemptGradeCount++;
    }

    for (const [j, br] of fp.feeRateBrackets.entries()) {
      await prisma.feePolicyBudgetRule.create({
        data: {
          policyId: row.id,
          budgetMin: big(br.minAmount),
          budgetMax: br.maxAmount == null ? null : big(br.maxAmount),
          baseAmount: big(br.baseFee),
          priority: j,
        },
      });
      budgetRuleCount++;
    }
  }
  console.log(`fee_policies: ${feePolicyCount}, fee_policy_budget_rules: ${budgetRuleCount}, fee_policy_exempt_grades: ${exemptGradeCount}`);

  function resolveFeePolicyId(agencyMockId: string | null): string {
    const forAgency = policyIdByAgency.get(agencyMockId);
    if (forAgency && forAgency.length > 0) return forAgency[0];
    const global = policyIdByAgency.get(null);
    if (global && global.length > 0) return global[0];
    const any = [...policyIdByAgency.values()].flat();
    if (any.length > 0) return any[0];
    throw new Error("적용 가능한 fee_policy가 하나도 없습니다 — mock.feePolicies가 비어있는지 확인 필요");
  }

  // ── term_fees ──────────────────────────────────────────────
  let termFeeCount = 0;
  for (const t of mockTermFees) {
    const projectDbId = projectNumberToDbId.get(t.projectNumber);
    const instDbId = instIdMap.get(t.institutionId);
    if (!projectDbId || !instDbId) continue;
    const project = mockProjects.find((p) => p.projectNumber === t.projectNumber);
    const ptiId = await getOrCreatePti(projectDbId, t.termNumber, instDbId, "PARTICIPATING", big(t.budget));
    const feePolicyId = resolveFeePolicyId(project?.agencyId ?? null);
    await prisma.termFee.create({
      data: {
        projectTermInstitutionId: ptiId,
        feePolicyId,
        projectBudget: big(t.budget),
        standardFee: big(t.standardFee ?? t.calculatedFee),
        appliedFee: big(t.appliedFee),
        billedFee: t.status === "BILLED" ? big(t.appliedFee) : null,
        isFeeExempt: false,
        status: t.status === "SCHEDULED" ? "DRAFT" : t.status,
        notes: t.manualOverrideReason ?? null,
        extraData: JSON.stringify({
          feeRate: t.feeRate, isAutoGenerated: t.isAutoGenerated, unclaimedFee: t.unclaimedFee,
          manualOverride: t.manualOverride, otherFirmHandled: t.otherFirmHandled, auditFirm: t.auditFirm,
          docRequestDate: t.docRequestDate, docReplyDate: t.docReplyDate, termStartDate: t.termStartDate,
          termEndDate: t.termEndDate, billingType: t.billingType, institutionType: t.institutionType,
        }),
      },
    });
    termFeeCount++;
  }
  console.log(`term_fees: ${termFeeCount}`);

  // ── term_fee_calcs ─────────────────────────────────────────
  let tfcCount = 0;
  for (const tfc of mockTermFeeCalcs) {
    const projectDbId = projectIdMap.get(tfc.projectId);
    const fundingAgencyId = agencyIdMap.get(tfc.agencyId);
    if (!projectDbId || !fundingAgencyId) continue;
    await prisma.termFeeCalc.create({
      data: {
        projectId: projectDbId,
        projectNumber: tfc.projectNumber,
        projectName: tfc.projectName,
        fundingAgencyId,
        termYear: tfc.termYear,
        termNumber: tfc.termNumber,
        stageNumber: tfc.stageNumber,
        workType: tfc.workType,
        totalCashBudget: big(tfc.totalCashBudget),
        coInstCount: tfc.coInstCount,
        baseFee: big(tfc.baseFee),
        addonFee: big(tfc.addonFee),
        standardFee: big(tfc.standardFee),
        nonExemptCashBudget: big(tfc.nonExemptCashBudget),
        nonExemptCoInstCount: tfc.nonExemptCoInstCount,
        nonExemptBaseFee: big(tfc.nonExemptBaseFee),
        nonExemptAddonFee: big(tfc.nonExemptAddonFee),
        generalFee: big(tfc.generalFee),
        exemptFeeTotal: big(tfc.exemptFeeTotal),
        exemptBreakdown: JSON.stringify(tfc.exemptBreakdown),
        calculatedFee: big(tfc.calculatedFee),
        generalCalcFee: big(tfc.generalCalcFee),
        generalBillingFee: big(tfc.generalBillingFee),
        generalUnclaimedFee: big(tfc.generalUnclaimedFee),
        carriedOverUnclaimed: big(tfc.carriedOverUnclaimed),
        totalBillingFee: big(tfc.totalBillingFee),
        overrides: JSON.stringify(tfc.overrides),
        status: tfc.status,
        createdAt: toDateOrNow(tfc.createdAt),
      },
    });
    tfcCount++;
  }
  console.log(`term_fee_calcs: ${tfcCount}`);

  // ── unclaimed_fees (자기참조 체인은 mock에 근거가 없어 매번 독립 레코드로 시드) ──
  let ucCount = 0;
  for (const u of mockUnclaimedFees) {
    const projectDbId = projectNumberToDbId.get(u.projectNumber);
    const instDbId = instIdMap.get(u.leadInstitutionId);
    if (!projectDbId || !instDbId) continue;
    const ptiId = await getOrCreatePti(projectDbId, u.termNumber, instDbId, "MAIN", big(u.amount));
    await prisma.unclaimedFee.create({
      data: {
        projectTermInstitutionId: ptiId,
        fiscalYear: u.termYear,
        billedFee: big(u.amount),
        actuallyBilled: BigInt(0),
        unclaimedAmount: big(u.amount),
        cumulativeUnclaimed: big(u.amount),
        status: u.status === "PENDING" ? "UNCLAIMED" : u.status === "CARRIED_OVER" ? "CARRIED_OVER" : "SETTLED",
        createdAt: toDateOrNow(u.occurredAt),
      },
    });
    ucCount++;
  }
  console.log(`unclaimed_fees: ${ucCount}`);

  // ── claims(합성) + receivables + payment_histories ────────
  let claimCount = 0, recvCount = 0, payCount = 0;
  for (const r of mockReceivables) {
    const projectDbId = projectNumberToDbId.get(r.projectNumber);
    const instDbId = instIdMap.get(r.institutionId ?? r.leadInstitutionId);
    if (!projectDbId || !instDbId) continue;
    const ptiId = await getOrCreatePti(projectDbId, r.termNumber, instDbId, "MAIN", big(r.billedAmount));
    const claim = await prisma.claim.create({
      data: {
        projectTermInstitutionId: ptiId,
        claimDate: toDateOrNow(r.billedAt),
        claimAmount: big(r.billedAmount),
        claimType: "일반청구",
        status: r.status === "PAID" ? "PAID" : r.status === "PARTIAL" ? "PARTIAL" : r.status === "OVERDUE" ? "OVERDUE" : "SENT",
      },
    });
    claimCount++;
    const receivable = await prisma.receivable.create({
      data: {
        claimId: claim.id,
        projectTermInstitutionId: ptiId,
        billedAmount: big(r.billedAmount),
        collectedAmount: big(r.paidAmount),
        outstandingAmount: big(r.receivableAmount),
        dueDate: toDate(r.dueDate),
        status: r.status === "PAID" ? "SETTLED" : r.status === "PARTIAL" ? "PARTIAL" : "OUTSTANDING",
      },
    });
    recvCount++;
    if (r.paidAmount > 0 && r.paidAt) {
      await prisma.paymentHistory.create({
        data: { receivableId: receivable.id, paymentDate: toDateOrNow(r.paidAt), paymentAmount: big(r.paidAmount) },
      });
      payCount++;
    }
  }
  console.log(`claims: ${claimCount}, receivables: ${recvCount}, payment_histories: ${payCount}`);

  // ── tax_invoices ───────────────────────────────────────────
  let tiCount = 0;
  for (const ti of mockTaxInvoices) {
    const projectDbId = projectNumberToDbId.get(ti.projectNumber);
    const instDbId = instIdMap.get(ti.institutionId ?? ti.leadInstitutionId);
    if (!projectDbId || !instDbId) continue;
    const ptiId = await getOrCreatePti(projectDbId, ti.termNumber, instDbId, "MAIN", big(ti.supplyAmount));
    await prisma.taxInvoice.create({
      data: {
        projectTermInstitutionId: ptiId,
        invoiceNumber: ti.invoiceNumber,
        issueDate: toDateOrNow(ti.issuedAt),
        supplyAmount: big(ti.supplyAmount),
        taxAmount: big(ti.taxAmount),
        totalAmount: big(ti.supplyAmount) + big(ti.taxAmount),
        buyerName: ti.leadInstitutionName,
        buyerBusinessNumber: mockInstitutions.find((i) => i.id === (ti.institutionId ?? ti.leadInstitutionId))?.bizNumber ?? "",
        status: "ISSUED",
      },
    });
    tiCount++;
  }
  console.log(`tax_invoices: ${tiCount}`);

  // ── settlements ────────────────────────────────────────────
  let stCount = 0;
  for (const s of mockSettlements) {
    const projectDbId = projectNumberToDbId.get(s.projectNumber);
    const instDbId = instIdMap.get(s.institutionId);
    if (!projectDbId || !instDbId) continue;
    const ptiId = await getOrCreatePti(projectDbId, 1, instDbId, s.isLead ? "MAIN" : "PARTICIPATING", big(s.settlementAmount));
    await prisma.settlement.create({
      data: {
        projectTermInstitutionId: ptiId,
        settlementAmount: big(s.settlementAmount),
        additionalAmount: big(s.additionalAmount),
        feeAmount: big(s.feeAmount),
        scheduledAmount: big(s.scheduledAmount),
        paidAmount: s.status === "PAID" ? big(s.scheduledAmount) : BigInt(0),
        outstandingAmount: s.status === "PAID" ? BigInt(0) : big(s.scheduledAmount),
        settlementDate: toDate(s.paidAt),
        status: s.status === "PAID" ? "COMPLETED" : s.status === "PENDING" ? "IN_PROGRESS" : "SCHEDULED",
      },
    });
    stCount++;
  }
  console.log(`settlements: ${stCount}`);

  // ── company_info(싱글턴), standard_attachments, fee_invoice_templates, simple_notice_templates ──
  await prisma.companyInfo.create({
    data: {
      name: COMPANY_INFO.name, addressLine: COMPANY_INFO.addressLine, tel: COMPANY_INFO.tel, fax: COMPANY_INFO.fax,
      preparedBy: COMPANY_INFO.preparedBy, ceoName: COMPANY_INFO.ceoName, docNumberPrefix: COMPANY_INFO.docNumberPrefix,
      managerName: COMPANY_INFO.managerName, managerEmail: COMPANY_INFO.managerEmail, managerPhone: COMPANY_INFO.managerPhone,
      depositAccountNote: COMPANY_INFO.depositAccountNote, stampDataUrl: COMPANY_INFO.stampDataUrl ?? null,
    },
  });
  console.log("company_info: 1 (singleton)");

  for (const sa of mockStandardAttachments) {
    await prisma.standardAttachment.create({
      data: {
        name: sa.name, fileDataUrl: sa.fileDataUrl ?? null,
        enabledByCategory: sa.enabledByCategory ? JSON.stringify(sa.enabledByCategory) : null,
      },
    });
  }
  console.log(`standard_attachments: ${mockStandardAttachments.length}`);

  for (const fit of mockFeeInvoiceTemplates) {
    await prisma.feeInvoiceTemplate.create({
      data: {
        category: fit.category, name: fit.name, isDefault: fit.isDefault,
        content: JSON.stringify(fit.content),
        defaultAttachments: fit.defaultAttachments ? JSON.stringify(fit.defaultAttachments) : null,
      },
    });
  }
  console.log(`fee_invoice_templates: ${mockFeeInvoiceTemplates.length}`);

  for (const snt of mockSimpleNoticeTemplates) {
    await prisma.simpleNoticeTemplate.create({
      data: { category: snt.category, name: snt.name, isDefault: snt.isDefault, content: JSON.stringify(snt.content) },
    });
  }
  console.log(`simple_notice_templates: ${mockSimpleNoticeTemplates.length}`);

  // ── email_batches(합성) + email_logs ──────────────────────
  const batchIdMap = new Map<string, string>();
  let batchCount = 0, logCount = 0;
  for (const em of mockEmailDispatches) {
    let batchDbId = batchIdMap.get(em.batchId);
    if (!batchDbId) {
      const row = await prisma.emailBatch.create({
        data: { batchName: em.batchId, emailType: em.emailType, status: "SENT", createdAt: toDateOrNow(em.sentAt) },
      });
      batchDbId = row.id;
      batchIdMap.set(em.batchId, batchDbId);
      batchCount++;
    }
    await prisma.emailLog.create({
      data: {
        batchId: batchDbId,
        emailType: em.emailType,
        toEmail: em.recipientEmail,
        subject: em.subject,
        body: em.body ?? (em.noticeSnapshot ? JSON.stringify(em.noticeSnapshot) : ""),
        status: em.status === "SUCCESS" ? "SENT" : em.status === "FAILED" ? "FAILED" : "PENDING",
        sentAt: em.status === "SUCCESS" ? toDateOrNow(em.sentAt) : null,
        createdAt: toDateOrNow(em.sentAt),
      },
    });
    logCount++;
  }
  console.log(`email_batches: ${batchCount}, email_logs: ${logCount}`);

  // ── notices ────────────────────────────────────────────────
  for (const n of mockNotices) {
    await prisma.notice.create({
      data: {
        title: n.title, content: n.content, authorName: n.authorName,
        authorId: userNameToDbId.get(n.authorName) ?? null,
        authorRole: ROLE_MAP[n.authorRole] ?? "GENERAL",
        createdAt: toDateOrNow(n.createdAt),
      },
    });
  }
  console.log(`notices: ${mockNotices.length}`);

  // ── project_issues ─────────────────────────────────────────
  let issueCount = 0;
  for (const pi of mockProjectIssues) {
    const projectDbId = projectIdMap.get(pi.projectId);
    if (!projectDbId) continue;
    await prisma.projectIssue.create({
      data: {
        projectId: projectDbId,
        content: pi.content,
        author: pi.author,
        priority: pi.priority,
        status: pi.status,
        recipientGroups: pi.recipientGroups ? JSON.stringify(pi.recipientGroups) : null,
        recipientUserIds: pi.recipientUserIds ? JSON.stringify(pi.recipientUserIds) : null,
        institutionName: pi.institutionName ?? null,
        noInstitution: !!pi.noInstitution,
        term: pi.term ?? null,
        createdAt: toDateOrNow(pi.createdAt),
      },
    });
    issueCount++;
  }
  console.log(`project_issues: ${issueCount}`);

  console.log("=== 시드 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
