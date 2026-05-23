import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { CreateTimelineEventInput } from "../types";
import { assertSafeTimelineMetadata } from "./sensitive-metadata";

type TimelineClient = typeof prisma | Prisma.TransactionClient;

export async function createTimelineEvent(
  input: CreateTimelineEventInput,
  client: TimelineClient = prisma,
) {
  assertSafeTimelineMetadata(input.metadata);

  return client.timelineEvent.create({
    data: {
      caseId: input.caseId ?? null,
      eventType: input.eventType,
      actorType: input.actorType,
      summary: input.summary,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      ...(input.metadata === undefined ? {} : { metadata: input.metadata }),
    },
  });
}
