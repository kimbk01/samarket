/**
 * Independent channel selection contract (Phase 3 core proof).
 * POPUP ON ≠ PUSH ON. EVENT PUBLISH ≠ ANY DISTRIBUTION.
 */

import type {
  PromotionDistributionChannel,
  PromotionDistributionToggleDraft,
} from "@/lib/platform-promotion-distribution/types";

export type DistributionExpectation = {
  popup: boolean;
  banner: boolean;
  push: boolean;
  bell: boolean;
  expectedActiveChannels: PromotionDistributionChannel[];
  expectedInactiveChannels: PromotionDistributionChannel[];
  pushDispatchAllowed: boolean;
  bellRecordAllowed: boolean;
};

export function resolveDistributionExpectation(
  toggles: PromotionDistributionToggleDraft
): DistributionExpectation {
  const expectedActiveChannels: PromotionDistributionChannel[] = [];
  const expectedInactiveChannels: PromotionDistributionChannel[] = [];
  (["popup", "banner", "push", "bell"] as const).forEach((ch) => {
    if (toggles[ch]) expectedActiveChannels.push(ch);
    else expectedInactiveChannels.push(ch);
  });
  return {
    popup: toggles.popup,
    banner: toggles.banner,
    push: toggles.push,
    bell: toggles.bell,
    expectedActiveChannels,
    expectedInactiveChannels,
    pushDispatchAllowed: toggles.push === true,
    bellRecordAllowed: toggles.bell === true,
  };
}

/** CASE matrix from Owner Phase 3 brief. */
export const PHASE3_DISTRIBUTION_CASE_MATRIX: Array<{
  id: string;
  toggles: PromotionDistributionToggleDraft;
}> = [
  {
    id: "CASE_1",
    toggles: { popup: true, banner: false, push: false, bell: false },
  },
  {
    id: "CASE_2",
    toggles: { popup: false, banner: true, push: false, bell: false },
  },
  {
    id: "CASE_3",
    toggles: { popup: false, banner: false, push: true, bell: false },
  },
  {
    id: "CASE_4",
    toggles: { popup: false, banner: false, push: false, bell: true },
  },
  {
    id: "CASE_5",
    toggles: { popup: true, banner: true, push: true, bell: true },
  },
  {
    id: "CASE_6",
    toggles: { popup: false, banner: false, push: false, bell: false },
  },
  {
    id: "CASE_7",
    toggles: { popup: true, banner: false, push: false, bell: true },
  },
  {
    id: "CASE_8",
    toggles: { popup: false, banner: true, push: true, bell: false },
  },
];

/**
 * Map Admin Push/Bell intent → existing notification campaign channel enum.
 * Never expose push_and_in_app in Admin Promotion UX.
 */
export function mapPushBellToCampaignChannel(input: {
  pushEnabled: boolean;
  bellEnabled: boolean;
}):
  | { kind: "none" }
  | { kind: "push"; channel: "push_only" }
  | { kind: "bell"; channel: "in_app_only" }
  | { kind: "both"; pushChannel: "push_only"; bellChannel: "in_app_only" } {
  if (input.pushEnabled && input.bellEnabled) {
    return {
      kind: "both",
      pushChannel: "push_only",
      bellChannel: "in_app_only",
    };
  }
  if (input.pushEnabled) return { kind: "push", channel: "push_only" };
  if (input.bellEnabled) return { kind: "bell", channel: "in_app_only" };
  return { kind: "none" };
}

/** Save / Publish / Send are distinct actions. */
export const DISTRIBUTION_ACTIONS = {
  SAVE_EVENT: "save_event",
  PUBLISH_EVENT: "publish_event",
  SAVE_DISTRIBUTION: "save_distribution",
  PUBLISH_POPUP: "publish_popup",
  SEND_PUSH: "send_push",
} as const;

export function actionImpliesPushDispatch(
  action: (typeof DISTRIBUTION_ACTIONS)[keyof typeof DISTRIBUTION_ACTIONS]
): boolean {
  return action === DISTRIBUTION_ACTIONS.SEND_PUSH;
}
