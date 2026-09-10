/**
 * MEDIA POLICY GATE — rehost only when MEDIA_ALLOWED.
 * CONTENT policy_status is independent and does not authorize rehost.
 */

import type { CommunityCrawlMediaPolicy } from "@/lib/community-crawler/crawl-ssot";

export function isCommunityCrawlMediaRehostPermitted(
  mediaPolicy: CommunityCrawlMediaPolicy | string | null | undefined
): boolean {
  return mediaPolicy === "MEDIA_ALLOWED";
}
