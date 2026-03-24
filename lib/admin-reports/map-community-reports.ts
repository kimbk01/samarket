import type { CommunityReportAdminRow } from "@/lib/community-feed/admin-community-reports";
import type { Report, ReportStatus } from "@/lib/types/report";

const REASON_LABELS: Record<string, string> = {
  spam: "스팸",
  fraud: "사기",
  abusive_language: "욕설·비방",
  inappropriate: "부적절한 내용",
  harassment: "괴롭힘",
  other: "기타",
  etc: "기타",
};

function communityStatusToReportStatus(s: string): ReportStatus {
  const x = (s ?? "").toLowerCase();
  if (x === "open") return "pending";
  if (x === "reviewing") return "reviewing";
  if (x === "resolved") return "resolved";
  if (x === "dismissed") return "rejected";
  return "pending";
}

/** 통합 신고 목록용 — community_reports → Report 형태 */
export function mapCommunityReportsToReports(
  rows: CommunityReportAdminRow[],
  nicknameById: Record<string, string>
): Report[] {
  return rows.map((r) => {
    const code = (r.reason_type ?? "").trim() || "etc";
    const label = REASON_LABELS[code] ?? code;
    const title = r.post_title?.trim() || r.target_id;
    return {
      id: r.id,
      reporterId: r.reporter_id,
      reporterNickname: nicknameById[r.reporter_id] ?? r.reporter_id,
      targetType: "community",
      targetId: r.target_id,
      targetUserId: "",
      targetTitle: r.target_type === "post" ? title : `${r.target_type} ${r.target_id.slice(0, 8)}…`,
      productTitle: r.target_type === "post" ? r.post_title ?? undefined : undefined,
      reasonCode: code,
      reasonLabel: label,
      detail: r.reason_text ?? "",
      createdAt: r.created_at,
      status: communityStatusToReportStatus(r.status),
      reportSource: "community_feed",
    };
  });
}
