import { PortalPage } from "../_components/portal-page";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function Page({ params }: PageProps) {
  const { token } = await params;

  return <PortalPage token={token} />;
}
