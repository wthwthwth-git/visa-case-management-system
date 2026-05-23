import { AdminCaseDetailPage } from "../../_components/admin-case-detail-page";

type PageProps = {
  params: Promise<{
    caseId: string;
  }>;
};

export default async function CaseDetailPage({ params }: PageProps) {
  const { caseId } = await params;

  return <AdminCaseDetailPage caseId={caseId} />;
}
