export type CommunityShareAnalyticsEvent =
  | "community_share_sheet_open"
  | "community_share_internal_click"
  | "community_share_internal_target_select"
  | "community_share_internal_success"
  | "community_share_native_click"
  | "community_share_kakao_click"
  | "community_share_copy_click"
  | "community_share_success"
  | "community_share_cancel"
  | "community_share_fallback_copy"
  | "community_share_error";

export type CommunityShareAnalyticsPayload = {
  postId: string;
  targetType?: string;
  platform?: string;
  result?: string;
};

export function logCommunityShareEvent(
  event: CommunityShareAnalyticsEvent,
  payload: CommunityShareAnalyticsPayload
): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("dibay:community-share", {
        detail: { event, ...payload },
      })
    );
  } catch {
    /* ignore */
  }
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console -- dev analytics only
    console.debug("[community-share]", event, payload);
  }
}
