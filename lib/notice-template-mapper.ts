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

// content(전담기관 공문 서식 전체)는 건당 수십~수백 KB라, 목록 조회는 이 필드를 뺀 가벼운 버전을
// 쓴다 — 실제로 열람·편집·발송에 쓰는 시점에만 GET /api/agency-notice-templates/[id]로 따로 받아온다.
export function toAgencyNoticeTemplateListItem(t: PrismaAgencyNoticeTemplate & { fundingAgency: FundingAgency }): AgencyNoticeTemplateEntry {
  return { id: t.id, agencyShortName: t.fundingAgency.shortName, name: t.name };
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
