import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AdminAccountDisabledError, AdminAuthRequiredError } from "@/lib/auth/errors";

export type AdminAuthContext = {
  adminId: string;
  email: string;
  role: "admin";
};

export async function requireAdminAuth(request: Request): Promise<AdminAuthContext> {
  void request;

  const session = await getServerSession(authOptions);
  const sessionUser = session?.user;

  if (!sessionUser?.id || !sessionUser.email) {
    throw new AdminAuthRequiredError();
  }

  const adminUser = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (!adminUser?.email) {
    throw new AdminAuthRequiredError();
  }

  if (adminUser.status === "disabled") {
    throw new AdminAccountDisabledError();
  }

  return {
    adminId: adminUser.id,
    email: adminUser.email,
    role: adminUser.role,
  };
}
