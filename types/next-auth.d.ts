import type { DefaultSession } from "next-auth";
import type { AdminRole, AdminUserStatus } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      role: AdminRole;
      status: AdminUserStatus;
    } & DefaultSession["user"];
  }

  interface User {
    role: AdminRole;
    status: AdminUserStatus;
  }
}
