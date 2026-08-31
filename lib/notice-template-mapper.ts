import type {
  StandardAttachment as PrismaStandardAttachment,
  AgencyNoticeTemplate as PrismaAgencyNoticeTemplate,
  FeeInvoiceTemplate as PrismaFeeInvoiceTemplate,
  SimpleNoticeTemplate as PrismaSimpleNoticeTemplate,
  FundingAgency,
} from "@prisma/client";
import type {
  StandardAttachment,
  AgencyNoticeTemplateEntry,
  FeeInvoiceTemplateEntry,
  SimpleNoticeTemplateEntry,
} from "./mock";

export function toStandardAttachment(a: PrismaStandardAttachment): StandardAttachment {
  return {
    id: a.id,
    name: a.name,
    fileDataUrl: a.fileDataUrl ?? undefined,
    updatedAt: a.updatedAt.toISOString().slice(0, 10),
    enabledByCategory: a.enabledByCategory ? JSON.parse(a.enabledByCategory) : undefined,
  };
}

export function toAgencyNoticeTemplate(t: PrismaAgencyNoticeTemplate & { fundingAgency: FundingAgency }): AgencyNoticeTemplateEntry {
  return {
    id: t.id,
    agencyShortName: t.fundingAgency.shortName,
    name: t.name,
    content: JSON.parse(t.content),
  };
}

export function toFeeInvoiceTemplate(t: PrismaFeeInvoiceTemplate): FeeInvoiceTemplateEntry {
  return {
    id: t.id,
    category: t.category as FeeInvoiceTemplateEntry["category"],
    name: t.name,
    isDefault: t.isDefault,
    content: JSON.parse(t.content),
    defaultAttachments: t.defaultAttachments ? JSON.parse(t.defaultAttachments) : undefined,
  };
}

export function toSimpleNoticeTemplate(t: PrismaSimpleNoticeTemplate): SimpleNoticeTemplateEntry {
  return {
    id: t.id,
    category: t.category as SimpleNoticeTemplateEntry["category"],
    name: t.name,
    isDefault: t.isDefault,
    content: JSON.parse(t.content),
  };
}
