import { prisma } from "@/lib/prisma";
import { generatePortalToken, hashPortalToken } from "../shared/token-hash";
import { createTimelineEvent } from "../shared/timeline";

const maxReasonLength = 500;
const unsafeReasonPattern =
  /(token|tokenHash|plaintextToken|signedUrl|storagePath|storageBucket|passport|residenceCard|https?:\/\/|x-amz-signature)/i;

export class ActivePortalTokenExistsError extends Error {
  constructor() {
    super("Active portal token already exists. Use regeneratePortalTokenForCase instead.");
    this.name = "ActivePortalTokenExistsError";
  }
}

export class InvalidTokenReasonError extends Error {
  constructor(message = "Invalid token timeline reason.") {
    super(message);
    this.name = "InvalidTokenReasonError";
  }
}

export type PortalTokenMutationInput = {
  caseId: string;
  expiresAt?: Date | null;
  reason?: string;
};

export type CreatePortalTokenResult = {
  tokenId: string;
  plaintextToken: string;
  expiresAt: Date | null;
};

export type RegeneratePortalTokenResult = {
  previousTokenId: string | null;
  newTokenId: string;
  plaintextToken: string;
  expiresAt: Date | null;
};

export type RevokeActivePortalTokenResult = {
  revokedTokenId: string | null;
};

function normalizeReason(reason: string | undefined) {
  if (reason === undefined) {
    return undefined;
  }

  const normalized = reason.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (normalized.length > maxReasonLength) {
    throw new InvalidTokenReasonError("Token timeline reason must be 500 characters or fewer.");
  }

  if (unsafeReasonPattern.test(normalized)) {
    throw new InvalidTokenReasonError("Token timeline reason contains unsafe content.");
  }

  return normalized;
}

function buildTokenMetadata(input: {
  tokenId?: string;
  previousTokenId?: string | null;
  newTokenId?: string;
  expiresAt?: Date | null;
  reason?: string;
}) {
  return {
    ...(input.tokenId === undefined ? {} : { tokenId: input.tokenId }),
    ...(input.previousTokenId === undefined
      ? {}
      : { previousTokenId: input.previousTokenId }),
    ...(input.newTokenId === undefined ? {} : { newTokenId: input.newTokenId }),
    ...(input.expiresAt === undefined
      ? {}
      : { expiresAt: input.expiresAt?.toISOString() ?? null }),
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  };
}

export async function createPortalTokenForCase(
  input: PortalTokenMutationInput,
): Promise<CreatePortalTokenResult> {
  const reason = normalizeReason(input.reason);
  const plaintextToken = generatePortalToken();
  const tokenHash = hashPortalToken(plaintextToken);
  const expiresAt = input.expiresAt ?? null;

  const tokenRecord = await prisma.$transaction(async (tx) => {
    await tx.case.findUniqueOrThrow({
      where: { id: input.caseId },
      select: { id: true },
    });

    const existingActiveToken = await tx.customerAccessToken.findFirst({
      where: {
        caseId: input.caseId,
        status: "active",
      },
      select: { id: true },
    });

    if (existingActiveToken) {
      throw new ActivePortalTokenExistsError();
    }

    const createdToken = await tx.customerAccessToken.create({
      data: {
        caseId: input.caseId,
        tokenHash,
        status: "active",
        expiresAt,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "token_created",
        actorType: "internal",
        summary: "Portal token created.",
        targetType: "customer_access_token",
        targetId: createdToken.id,
        metadata: buildTokenMetadata({
          tokenId: createdToken.id,
          expiresAt,
          reason,
        }),
      },
      tx,
    );

    return createdToken;
  });

  return {
    tokenId: tokenRecord.id,
    plaintextToken,
    expiresAt: tokenRecord.expiresAt,
  };
}

export async function regeneratePortalTokenForCase(
  input: PortalTokenMutationInput,
): Promise<RegeneratePortalTokenResult> {
  const reason = normalizeReason(input.reason);
  const plaintextToken = generatePortalToken();
  const tokenHash = hashPortalToken(plaintextToken);
  const expiresAt = input.expiresAt ?? null;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    await tx.case.findUniqueOrThrow({
      where: { id: input.caseId },
      select: { id: true },
    });

    const previousToken = await tx.customerAccessToken.findFirst({
      where: {
        caseId: input.caseId,
        status: "active",
      },
      select: { id: true },
    });

    if (previousToken) {
      await tx.customerAccessToken.update({
        where: { id: previousToken.id },
        data: {
          status: "revoked",
          revokedAt: now,
        },
      });

      await createTimelineEvent(
        {
          caseId: input.caseId,
          eventType: "token_revoked",
          actorType: "internal",
          summary: "Previous portal token revoked during regeneration.",
          targetType: "customer_access_token",
          targetId: previousToken.id,
          metadata: buildTokenMetadata({
            tokenId: previousToken.id,
            reason: reason ?? "regenerated",
          }),
        },
        tx,
      );
    }

    const newToken = await tx.customerAccessToken.create({
      data: {
        caseId: input.caseId,
        tokenHash,
        status: "active",
        expiresAt,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "token_regenerated",
        actorType: "internal",
        summary: "Portal token regenerated.",
        targetType: "customer_access_token",
        targetId: newToken.id,
        metadata: buildTokenMetadata({
          previousTokenId: previousToken?.id ?? null,
          newTokenId: newToken.id,
          expiresAt,
          reason,
        }),
      },
      tx,
    );

    return {
      previousTokenId: previousToken?.id ?? null,
      newToken,
    };
  });

  return {
    previousTokenId: result.previousTokenId,
    newTokenId: result.newToken.id,
    plaintextToken,
    expiresAt: result.newToken.expiresAt,
  };
}

export async function revokeActivePortalTokenForCase(input: {
  caseId: string;
  reason?: string;
}): Promise<RevokeActivePortalTokenResult> {
  const reason = normalizeReason(input.reason);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const activeToken = await tx.customerAccessToken.findFirst({
      where: {
        caseId: input.caseId,
        status: "active",
      },
      select: { id: true },
    });

    if (!activeToken) {
      return { revokedTokenId: null };
    }

    await tx.customerAccessToken.update({
      where: { id: activeToken.id },
      data: {
        status: "revoked",
        revokedAt: now,
      },
    });

    await createTimelineEvent(
      {
        caseId: input.caseId,
        eventType: "token_revoked",
        actorType: "internal",
        summary: "Portal token revoked.",
        targetType: "customer_access_token",
        targetId: activeToken.id,
        metadata: buildTokenMetadata({
          tokenId: activeToken.id,
          reason,
        }),
      },
      tx,
    );

    return { revokedTokenId: activeToken.id };
  });
}
