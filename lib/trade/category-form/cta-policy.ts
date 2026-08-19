/**
 * Trade detail CTA Policy — single authority for primary/secondary/owner CTA flags.
 * Does NOT own chat room creation; consumers still call openCreateTradeChat unchanged.
 */
export type TradeDetailCtaRole = "buyer" | "seller" | "owner";

export type TradeDetailCtaPolicyInput = {
  isOwnPost: boolean;
  postStatusLower: string;
  /** category has_chat + non-community (same as legacy `showChat`) */
  categoryHasChat: boolean;
  isJobsDetailUi: boolean;
  jobDirection: "hiring" | "seeking" | "unknown" | string;
  listingKind: string;
  existingTradeRoomId: string | null;
  /**
   * Composition profile (R6) — rent-car uses inquire CTA; does not invent booking CTA.
   * From `resolveTradeCompositionProfileId`.
   */
  compositionProfileId?: string | null;
};

export type TradeDetailCtaPolicy = {
  role: TradeDetailCtaRole;
  primary: {
    kind: "chat" | "job_apply_chat" | "job_seek_contact" | "none";
    enabled: boolean;
    labelKey:
      | "trade_detail_chat_cta"
      | "trade_detail_chat_continue"
      | "trade_detail_inquire_cta"
      | "none";
  };
  /** Same semantics as legacy PostDetailView `uiTradeChatEnabled` */
  uiTradeChatEnabled: boolean;
  bottomBarHasChatBtn: boolean;
  showJobApplyBtn: boolean;
  showJobSeekContactBtn: boolean;
  jobHireMergedApplyChatBtn: boolean;
};

export function resolveTradeDetailCtaPolicy(
  input: TradeDetailCtaPolicyInput
): TradeDetailCtaPolicy {
  const role: TradeDetailCtaRole = input.isOwnPost ? "owner" : "buyer";

  const uiTradeChatEnabled = input.categoryHasChat;

  const bottomBarHasChatBtn = uiTradeChatEnabled;

  const showJobApplyBtn =
    input.isJobsDetailUi &&
    input.jobDirection === "hiring" &&
    String(input.listingKind).trim() === "hire" &&
    !input.isOwnPost &&
    input.postStatusLower === "active";

  const showJobSeekContactBtn =
    input.isJobsDetailUi &&
    input.jobDirection === "seeking" &&
    !input.isOwnPost &&
    bottomBarHasChatBtn &&
    !input.existingTradeRoomId;

  const jobHireMergedApplyChatBtn = showJobApplyBtn;

  let primaryKind: TradeDetailCtaPolicy["primary"]["kind"] = "none";
  let labelKey: TradeDetailCtaPolicy["primary"]["labelKey"] = "none";

  if (showJobApplyBtn) {
    primaryKind = "job_apply_chat";
    labelKey = "trade_detail_inquire_cta";
  } else if (showJobSeekContactBtn) {
    primaryKind = "job_seek_contact";
    labelKey = "trade_detail_chat_cta";
  } else if (bottomBarHasChatBtn && !jobHireMergedApplyChatBtn) {
    primaryKind = "chat";
    if (input.existingTradeRoomId) labelKey = "trade_detail_chat_continue";
    else if (input.isJobsDetailUi || input.compositionProfileId === "rent-car")
      labelKey = "trade_detail_inquire_cta";
    else labelKey = "trade_detail_chat_cta";
  }

  return {
    role,
    primary: {
      kind: primaryKind,
      enabled: primaryKind !== "none",
      labelKey,
    },
    uiTradeChatEnabled,
    bottomBarHasChatBtn,
    showJobApplyBtn,
    showJobSeekContactBtn,
    jobHireMergedApplyChatBtn,
  };
}
