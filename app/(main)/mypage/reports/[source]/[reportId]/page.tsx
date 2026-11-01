import { notFound } from "next/navigation";
import { MyReportDetailClient } from "@/components/mypage/reports/MyReportDetailClient";
import { isMyReportSource } from "@/lib/reports/my-reports";

/** 신고 건 상세 — 신고 처리 알림을 누르면 열린다 (알림 최종 설계 §5-5). */
export default async function MyReportDetailPage({
  params,
}: {
  params: Promise<{ source: string; reportId: string }>;
}) {
  const { source, reportId } = await params;
  if (!isMyReportSource(source)) notFound();
  return <MyReportDetailClient source={source} reportId={String(reportId ?? "")} />;
}
