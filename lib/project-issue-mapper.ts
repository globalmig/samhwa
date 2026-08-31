import type { ProjectIssue as PrismaProjectIssue, Project as PrismaProject } from "@prisma/client";
import type { ProjectIssue } from "./mock";

export type ProjectIssueWithProject = PrismaProjectIssue & { project: PrismaProject };

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toProjectIssue(pi: ProjectIssueWithProject): ProjectIssue {
  return {
    id: pi.id,
    projectId: pi.projectId,
    projectNumber: pi.project.projectNumber,
    content: pi.content,
    author: pi.author,
    createdAt: toDateStr(pi.createdAt),
    priority: pi.priority as ProjectIssue["priority"],
    status: pi.status as ProjectIssue["status"],
    recipientGroups: pi.recipientGroups ? JSON.parse(pi.recipientGroups) : undefined,
    recipientUserIds: pi.recipientUserIds ? JSON.parse(pi.recipientUserIds) : undefined,
    institutionName: pi.institutionName ?? undefined,
    noInstitution: pi.noInstitution,
    term: pi.term ?? undefined,
  };
}
