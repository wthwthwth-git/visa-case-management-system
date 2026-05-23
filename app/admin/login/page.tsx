import { AdminLoginPage } from "./login-page";

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    reason?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <AdminLoginPage
      callbackUrl={params.callbackUrl}
      error={params.error}
      reason={params.reason}
    />
  );
}
