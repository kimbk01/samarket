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
  // NEVER default unknown type to "notice" — misroutes system/marketing.
  if (!isCustomerCenterContentType(input.contentType)) return null;
  return {
    content_id: contentId,
    content_type: input.contentType,
    canonical_route: buildCustomerCenterBoardDetailPath(input.contentType, contentId),
    legacy_route: buildLegacyAppNoticeDetailPath(contentId),
  };
}
