/**
 * 12단계: 관리자 처리 액션 적용 (신고 상태·제재 상태·상품 상태 반영)
 */

import type { ModerationActionType } from "@/lib/types/report";
import { getReportById, updateReportStatus } from "./mock-admin-reports";
import { addModerationAction } from "./mock-moderation-actions";
import { setUserModerationState } from "./mock-user-moderation";
import { getProductById, setProductStatus } from "@/lib/mock-products";
import { addProductStatusLog } from "@/lib/admin-products/mock-product-status-logs";

export interface ApplyResult {
  ok: boolean;
  message?: string;
}

export function applyModerationAction(
  reportId: string,
  actionType: ModerationActionType,
  note: string = ""
): ApplyResult {
  const report = getReportById(reportId);
  if (!report) return { ok: false, message: "신고를 찾을 수 없습니다." };
  if (report.status !== "pending") {
    return { ok: false, message: "이미 처리된 신고입니다." };
  }

  const { targetType, targetId, targetUserId } = report;

  switch (actionType) {
    case "review_only":
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "review_only", note);
      return { ok: true };

    case "reject_report":
      updateReportStatus(reportId, "rejected");
      addModerationAction(reportId, targetUserId, targetType, "reject_report", note);
      return { ok: true };

    case "warn":
      setUserModerationState(targetUserId, "warned", note || report.reasonLabel);
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "warn", note);
      return { ok: true };

    case "suspend":
      setUserModerationState(targetUserId, "suspended", note || report.reasonLabel);
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "suspend", note);
      return { ok: true };

    case "ban":
      setUserModerationState(targetUserId, "banned", note || report.reasonLabel);
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "ban", note);
      return { ok: true };

    case "blind_product": {
      if (targetType !== "product") {
        return { ok: false, message: "상품 신고에만 적용할 수 있습니다." };
      }
      const prod = getProductById(targetId);
      const fromStatus = prod?.status ?? "active";
      setProductStatus(targetId, "blinded");
      addProductStatusLog(targetId, fromStatus, "blinded", "blind_product", note);
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "blind_product", note);
      return { ok: true };
    }

    case "delete_product": {
      if (targetType !== "product") {
        return { ok: false, message: "상품 신고에만 적용할 수 있습니다." };
      }
      const prod = getProductById(targetId);
      const fromStatus = prod?.status ?? "active";
      setProductStatus(targetId, "deleted");
      addProductStatusLog(targetId, fromStatus, "deleted", "delete_product", note);
      updateReportStatus(reportId, "reviewed");
      addModerationAction(reportId, targetUserId, targetType, "delete_product", note);
      return { ok: true };
    }

    default:
      return { ok: false, message: "지원하지 않는 처리입니다." };
  }
}
