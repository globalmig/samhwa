/**
 * Phase 2 3차: 기관·과제·수수료 핵심 업무 도메인(institutions ~ project_issues) 재시딩.
 *
 * seed.ts의 148~746줄 로직을 가져오되, users/funding_agencies/fee_policies(+규칙)/
 * agency_notice_templates/fee_invoice_templates/simple_notice_templates/standard_attachments/
 * company_info/role_permissions는 절대 건드리지 않는다 — 이미 실제 운영 데이터이기 때문에
 * seed.ts처럼 새로 만들지 않고, 이름/약칭으로 DB에 있는 실제 행을 찾아 참조만 한다.
 *
 * 재실행해도 안전하도록(멱등) 대상 테이블만 자식->부모 순으로 비우고 새로 채운다.
 * SamhwaRnD(레거시 DB)는 이 스크립트가 알지도, 접근하지도 않는다.
 *
 * 실행: npx tsx prisma/reseed-business-domain.ts (원격 서버 안에서, DATABASE_URL=SamhwaFee)
 */
import { PrismaClient } from "@prisma/client";
import {
  institutions as mockInstitutions,
  fundingAgencies as mockFundingAgencies,
  projects as mockProjects,
  projectMembers as mockProjectMembers,
  termFees as mockTermFees,
  termFeeCalcs as mockTermFeeCalcs,
  unclaimedFees as mockUnclaimedFees,
  receivables as mockReceivables,
  settlements as mockSettlements,
  taxInvoices as mockTaxInvoices,
  projectIssues as mockProjectIssues,
} from "../lib/mock";

const prisma = new PrismaClient();

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

async function cleanTargetTables() {
  // 자식 -> 부모 순. funding_agencies/fee_policies/users 등 실제 운영 데이터가 있는 테이블은
  // 이 목록에 절대 포함하지 않는다.
  const tables = [
    "payment_histories", "receivables", "claims",
    "tax_invoices", "settlements",
    "unclaimed_fees", "term_fees", "term_fee_calcs",
    "project_issues",
    "project_term_institutions", "project_terms", "projects",
    "institution_contacts", "institutions",
  ];
  for (const t of tables) {
    await prisma.$executeRawUnsafe(`DELETE FROM ${t}`);
  }
  console.log(`정리 완료(대상 테이블만): ${tables.length}개`);
}

async function main() {
  console.log("=== 업무 도메인(institutions~project_issues) 재시딩 시작 ===");
  await cleanTargetTables();

  // ── institutions ──────────────────────────────────────────
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

  // ── funding_agencies는 이미 실제 운영 데이터 — 새로 만들지 않고 shortName으로 매칭만 ──
  const dbAgencies = await prisma.fundingAgency.findMany();
  const agencyShortNameToDbId = new Map(dbAgencies.map((a) => [a.shortName, a.id]));
  const agencyIdMap = new Map<string, string>(); // mock fa-xxx -> db id
  for (const fa of mockFundingAgencies) {
    const dbId = agencyShortNameToDbId.get(fa.shortName);
    if (dbId) agencyIdMap.set(fa.id, dbId);
  }
  console.log(`funding_agencies 매칭: ${agencyIdMap.size}/${mockFundingAgencies.length}`);

  // ── projects ───────────────────────────────────────────────
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
          assignedManagerPrimaryUserId: p.assignedManagerPrimaryUserId,
          assignedManager: p.assignedManager, assignedManagerHistory: p.assignedManagerHistory,
          assignedManagerUserId: p.assignedManagerUserId,
          currentTerm: p.currentTerm, leadInstitutionId: instIdMap.get(p.leadInstitutionId) ?? p.leadInstitutionId,
          leadInstitutionName: p.leadInstitutionName, totalBudget: p.totalBudget,
        }),
      },
    });
    projectIdMap.set(p.id, row.id);
    projectNumberToDbId.set(p.projectNumber, row.id);
  }
  console.log(`projects: ${mockProjects.length}`);

  // 연차(term) 정보 수집
  type TermInfo = { termYear: number; totalBudget: bigint };
  const termInfoByProject = new Map<string, Map<number, TermInfo>>();

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
  for (const p of mockProjects) {
    const projectDbId = projectIdMap.get(p.id)!;
    const map = ensureTermMap(projectDbId);
    if (map.size === 0) {
      const startYear = toDateOrNow(p.startDate).getUTCFullYear();
      map.set(p.currentTerm || 1, { termYear: startYear, totalBudget: big(p.totalBudget) });
    }
  }
  function touchTerm(projectNumber: string, termNumber: number, termYear: number) {
    const projectDbId = projectNumberToDbId.get(projectNumber);
    if (!projectDbId) return;
    const map = ensureTermMap(projectDbId);
    if (!map.has(termNumber)) map.set(termNumber, { termYear, totalBudget: BigInt(0) });
  }
  for (const t of mockTermFees) touchTerm(t.projectNumber, t.termNumber, t.termYear);
  for (const u of mockUnclaimedFees) touchTerm(u.projectNumber, u.termNumber, u.termYear);
  for (const r of mockReceivables) touchTerm(r.projectNumber, r.termNumber, r.termYear);
  for (const s of mockSettlements) touchTerm(s.projectNumber, 1, s.termYear);
  for (const ti of mockTaxInvoices) touchTerm(ti.projectNumber, ti.termNumber, ti.termYear);

  const termIdMap = new Map<string, string>();
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

  // ── project_term_institutions ─────────────────────────────
  const ptiIdMap = new Map<string, string>();
  async function getOrCreatePti(projectDbId: string, termNumber: number, instDbId: string, role: string, budget: bigint) {
    const key = `${projectDbId}|${termNumber}|${instDbId}`;
    const existing = ptiIdMap.get(key);
    if (existing) return existing;
    let termId = termIdMap.get(`${projectDbId}|${termNumber}`);
    if (!termId) {
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
    // 멤버 레벨(모든 연차 공통) 속성 — annualBudgets 항목마다 이 값을 그대로 복제해 저장한다
    // (중복이지만, 어느 연차 행에서 읽어도 동일한 값이 나오므로 안전하다).
    const sharedExtra = {
      feeRate: pm.feeRate, calculatedFee: pm.calculatedFee, institutionGrade: pm.institutionGrade,
      gradeOverrides: pm.gradeOverrides, contactName: pm.contactName, contactEmail: pm.contactEmail,
      contactPhone: pm.contactPhone, recipientOverrides: pm.recipientOverrides,
      settlementType: pm.settlementType, settlementTypeOverrides: pm.settlementTypeOverrides,
      exemptRefGrade: pm.exemptRefGrade, role: pm.role,
    };
    if (pm.annualBudgets && pm.annualBudgets.length > 0) {
      for (const ab of pm.annualBudgets) {
        const key = `${projectDbId}|${ab.termNumber}|${instDbId}`;
        if (ptiIdMap.has(key)) continue;
        const id = await getOrCreatePti(projectDbId, ab.termNumber, instDbId, role, big(ab.cashBudget) + big(ab.inKindBudget));
        // 연차별 현금/현물 분리값은 projectBudget(합산)만으로는 복원 불가 — autoGenerateTermFees가
        // feeBasis(CASH vs CASH_PLUS_INKIND) 판단에 이 분리값을 그대로 쓰므로 행마다 정확히 보존한다.
        await prisma.projectTermInstitution.update({
          where: { id },
          data: {
            extraData: JSON.stringify({
              ...sharedExtra,
              cashBudget: ab.cashBudget, inKindBudget: ab.inKindBudget,
              termStartDate: ab.termStartDate, termEndDate: ab.termEndDate, auditFirm: ab.auditFirm,
            }),
          },
        });
        ptiCount++;
      }
    } else {
      const proj = mockProjects.find((p) => p.id === pm.projectId);
      const id = await getOrCreatePti(projectDbId, proj?.currentTerm || 1, instDbId, role, big(pm.budget));
      await prisma.projectTermInstitution.update({
        where: { id },
        data: { extraData: JSON.stringify({ ...sharedExtra, cashBudget: pm.cashBudget ?? pm.budget, inKindBudget: pm.inKindBudget ?? 0 }) },
      });
      ptiCount++;
    }
  }
  console.log(`project_term_institutions: ${ptiCount}`);

  // ── fee_policies는 이미 실제 운영 데이터 — DB에서 조회해 policyIdByAgency만 재구성 ──
  const dbAgencyIdToMockId = new Map<string, string>();
  for (const [mockId, dbId] of agencyIdMap) dbAgencyIdToMockId.set(dbId, mockId);

  const dbFeePolicies = await prisma.feePolicy.findMany({ select: { id: true, fundingAgencyId: true } });
  const policyIdByAgency = new Map<string | null, string[]>();
  for (const fp of dbFeePolicies) {
    const key = fp.fundingAgencyId ? dbAgencyIdToMockId.get(fp.fundingAgencyId) ?? null : null;
    if (!policyIdByAgency.has(key)) policyIdByAgency.set(key, []);
    policyIdByAgency.get(key)!.push(fp.id);
  }
  console.log(`fee_policies 매칭: 총 ${dbFeePolicies.length}건, 기관별 그룹 ${policyIdByAgency.size}개`);

  function resolveFeePolicyId(agencyMockId: string | null): string {
    const forAgency = policyIdByAgency.get(agencyMockId);
    if (forAgency && forAgency.length > 0) return forAgency[0];
    const global = policyIdByAgency.get(null);
    if (global && global.length > 0) return global[0];
    const any = [...policyIdByAgency.values()].flat();
    if (any.length > 0) return any[0];
    throw new Error("적용 가능한 fee_policy가 하나도 없습니다 — DB의 fee_policies가 비어있는지 확인 필요");
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
          feeRate: t.feeRate, calculatedFee: t.calculatedFee, isAutoGenerated: t.isAutoGenerated, unclaimedFee: t.unclaimedFee,
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

  // ── unclaimed_fees ─────────────────────────────────────────
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

  console.log("=== 재시딩 완료 ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
