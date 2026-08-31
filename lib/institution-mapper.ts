import type { Institution as PrismaInstitution, InstitutionContact } from "@prisma/client";
import type { Institution } from "./mock";

export type InstitutionWithContacts = PrismaInstitution & { contacts: InstitutionContact[] };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toInstitution(inst: InstitutionWithContacts): Institution {
  const primaryContact = inst.contacts.find((c) => c.isPrimary) ?? inst.contacts[0];
  return {
    id: inst.id,
    name: inst.institutionName,
    type: (inst.institutionType as Institution["type"]) ?? "중소기업",
    bizNumber: inst.businessNumber ?? "",
    representativeName: inst.representativeName ?? "",
    contactName: primaryContact?.name ?? "",
    contactEmail: inst.email ?? primaryContact?.email ?? "",
    contactPhone: inst.phone ?? primaryContact?.phone ?? "",
    registeredAt: toDateStr(inst.createdAt),
    status: inst.isActive ? "ACTIVE" : "INACTIVE",
    note: inst.notes ?? undefined,
  };
}
