import type { Adapter } from "next-auth/adapters";
import type { NextAuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { getOptionalEnv } from "@/lib/env";
import { isAdminEmailAllowed, normalizeAdminEmail } from "@/lib/auth/allowlist";
import { writeAdminAuthAudit } from "@/lib/auth/audit";

const googleClientId = getOptionalEnv("GOOGLE_CLIENT_ID") ?? "";
const googleClientSecret = getOptionalEnv("GOOGLE_CLIENT_SECRET") ?? "";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as unknown as Adapter,
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 12,
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      allowDangerousEmailAccountLinking: false,
    }),
  ],
  callbacks: {
    async signIn({ user, profile }) {
      const email = typeof user.email === "string" ? user.email : undefined;

      if (!email || !isAdminEmailAllowed(email)) {
        await writeAdminAuthAudit({
          email,
          eventType: "login_failure",
          result: "blocked",
          reason: "email_not_allowed",
          metadata: {
            provider: "google",
          },
        });

        return false;
      }

      const normalizedEmail = normalizeAdminEmail(email);
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          status: true,
        },
      });

      if (existingUser?.status === "disabled") {
        await writeAdminAuthAudit({
          adminUserId: existingUser.id,
          email: normalizedEmail,
          eventType: "login_failure",
          result: "blocked",
          reason: "account_disabled",
          metadata: {
            provider: "google",
          },
        });

        return false;
      }

      if (profile && user.email !== normalizedEmail) {
        user.email = normalizedEmail;
      }

      return true;
    },
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.email = user.email;
        session.user.role = user.role;
        session.user.status = user.status;
      }

      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.email) {
        return;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          email: normalizeAdminEmail(user.email),
          lastLoginAt: new Date(),
        },
      });

      await writeAdminAuthAudit({
        adminUserId: user.id,
        email: user.email,
        eventType: "login_success",
        result: "success",
        metadata: {
          provider: "google",
        },
      });
    },
    async signOut(message) {
      const sessionUserId =
        "session" in message && message.session && "userId" in message.session
          ? message.session.userId
          : null;

      await writeAdminAuthAudit({
        adminUserId: typeof sessionUserId === "string" ? sessionUserId : null,
        eventType: "logout",
        result: "success",
      });
    },
  },
};
