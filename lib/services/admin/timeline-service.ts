import { prisma } from "@/lib/prisma";
import type { ActorType, Prisma, TimelineEventType, TimelineTargetType } from "@prisma/client";
import { createTimelineEvent } from "../shared/timeline";
import type { CreateTimelineEventInput } from "../types";

export type AdminTimelineEventDTO = {
  id: string;
  caseId: string | null;
  eventType: TimelineEventType;
  actorType: ActorType;
  summary: string;
  targetType: TimelineTargetType | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: string;
  updatedAt: string;
};

function toAdminTimelineEventDTO(event: {
  id: string;
  caseId: string | null;
  eventType: TimelineEventType;
  actorType: ActorType;
  summary: string;
  targetType: TimelineTargetType | null;
  targetId: string | null;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}): AdminTimelineEventDTO {
  return {
    id: event.id,
    caseId: event.caseId,
    eventType: event.eventType,
    actorType: event.actorType,
    summary: event.summary,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  };
}

export async function listAdminTimelineEvents(
  caseId: string,
): Promise<AdminTimelineEventDTO[]> {
  const events = await prisma.timelineEvent.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
  });

  return events.map(toAdminTimelineEventDTO);
}

export async function createAdminTimelineEvent(input: CreateTimelineEventInput) {
  return createTimelineEvent(input);
}
