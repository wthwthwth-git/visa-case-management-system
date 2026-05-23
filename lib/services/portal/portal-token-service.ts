import { prisma } from "@/lib/prisma";
import { hashPortalToken } from "../shared/token-hash";
import type { PortalTokenContext } from "../types";
import { InvalidPortalTokenError } from "./portal-errors";

function isTokenUsable(tokenRecord: {
  status: "active" | "revoked" | "expired";
  revokedAt: Date | null;
  expiresAt: Date | null;
}) {
  const now = new Date();

  return (
    tokenRecord.status === "active" &&
    tokenRecord.revokedAt === null &&
    (tokenRecord.expiresAt === null || tokenRecord.expiresAt > now)
  );
}

export async function validatePortalToken(token: string): Promise<PortalTokenContext> {
  if (!token) {
    throw new InvalidPortalTokenError();
  }

  const tokenHash = hashPortalToken(token);

  const tokenRecord = await prisma.customerAccessToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      caseId: true,
      status: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!tokenRecord || !isTokenUsable(tokenRecord)) {
    throw new InvalidPortalTokenError();
  }

  await prisma.customerAccessToken.update({
    where: { id: tokenRecord.id },
    data: { lastUsedAt: new Date() },
  });

  return {
    tokenId: tokenRecord.id,
    caseId: tokenRecord.caseId,
  };
}
