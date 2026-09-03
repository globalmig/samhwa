import type { FundingAgency as PrismaFundingAgency } from "@prisma/client";
import type { FundingAgency } from "./mock";

export function toFundingAgency(a: PrismaFundingAgency): FundingAgency {
  return {
    id: a.id,
    name: a.name,
    shortName: a.shortName,
    code: a.code,
    contactName: a.contactName,
    contactEmail: a.contactEmail,
    contactPhone: a.contactPhone,
    noticeSenderEmail: a.noticeSenderEmail ?? undefined,
    noticeSenderMailPassword: a.noticeSenderMailPassword ?? undefined,
    status: a.status as FundingAgency["status"],
    registeredAt: a.registeredAt.toISOString().slice(0, 10),
    website: a.website ?? undefined,
    noticeRecipientScope: a.noticeRecipientScope as FundingAgency["noticeRecipientScope"],
    autoDetectByLeadInstitution: a.autoDetectByLeadInstitution,
    affiliatedInstitutionNames: a.affiliatedInstitutionNames ? JSON.parse(a.affiliatedInstitutionNames) : undefined,
    specialNotes: a.specialNotes ? JSON.parse(a.specialNotes) : undefined,
  };
}
