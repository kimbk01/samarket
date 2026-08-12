import type { CustomerCenterContentType } from "@/lib/notices/customer-center-content";
import { isCustomerCenterContentType } from "@/lib/notices/customer-center-content";
import {
  buildCustomerCenterBoardDetailPath,
  buildLegacyAppNoticeDetailPath,
} from "@/lib/notices/customer-center-content-paths";

/** Bind Campaign → Content for Push/Bell (same destination). */
export function resolveCustomerCenterCampaignContentBind(input: {
  contentId?: string | null;
  contentType?: string | null;
}): {
  content_id: string;
  content_type: CustomerCenterContentType;
  canonical_route: string;
  /** Legacy bridge path — keep until callers proven clean. */
  legacy_route: string;
} | null {
  const contentId = typeof input.contentId === "string" ? input.contentId.trim() : "";
  if (!contentId) return null;
  const contentType = isCustomerCenterContentType(input.contentType)
    ? input.contentType
    : "notice";
  return {
    content_id: contentId,
    content_type: contentType,
    canonical_route: buildCustomerCenterBoardDetailPath(contentType, contentId),
    legacy_route: buildLegacyAppNoticeDetailPath(contentId),
  };
}
