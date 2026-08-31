import type { Notice as PrismaNotice } from "@prisma/client";
import type { Notice } from "./mock";
import { dbRoleToApp } from "./role-map";

function toDateTimeStr(d: Date): string {
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function toNotice(n: PrismaNotice): Notice {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    authorName: n.authorName,
    authorRole: dbRoleToApp(n.authorRole) as Notice["authorRole"],
    createdAt: toDateTimeStr(n.createdAt),
  };
}
