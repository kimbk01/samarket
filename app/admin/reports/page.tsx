import { redirect } from "next/navigation";
import { AdminReportListPage } from "@/components/admin/reports/AdminReportListPage";

interface PageProps {
  searchParams: Promise<{ domain?: string | string[] }>;
}

/** 거래 신고(`?domain=trade`)는 거래 Admin 신고 화면이 처리한다 (거래 Admin 설계 v2 §B-3). 그 외는 통합 관찰 목록. */
export default async function AdminReportsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const domain = Array.isArray(params.domain) ? params.domain[0] : params.domain;
  if (domain === "trade") redirect("/admin/trade/reports");
  return <AdminReportListPage />;
}
