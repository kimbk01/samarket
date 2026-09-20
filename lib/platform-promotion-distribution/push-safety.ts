/**
 * Push / Bell safety — configuration save and Event publish must never dispatch.
 */

import {
  actionImpliesPushDispatch,
  DISTRIBUTION_ACTIONS,
  mapPushBellToCampaignChannel,
  resolveDistributionExpectation,
} from "@/lib/platform-promotion-distribution/independence";
import type { PromotionDistributionToggleDraft } from "@/lib/platform-promotion-distribution/types";

export type DispatchProbe = {
  pushDispatchCount: number;
  bellRecordCount: number;
};

export function zeroDispatchProbe(): DispatchProbe {
  return { pushDispatchCount: 0, bellRecordCount: 0 };
}

/**
 * Simulate orchestration effects for a given Admin action + toggles.
 * Used as local contract proof (no live FCM).
 */
export function simulateOrchestrationSideEffects(input: {
  action: (typeof DISTRIBUTION_ACTIONS)[keyof typeof DISTRIBUTION_ACTIONS];
  toggles: PromotionDistributionToggleDraft;
  /** Explicit SEND_PUSH only — and only when push enabled. */
  explicitPushSend?: boolean;
  /** Explicit Bell materialize — separate from push. */
  explicitBellCreate?: boolean;
}): DispatchProbe {
  const expectation = resolveDistributionExpectation(input.toggles);
  const probe = zeroDispatchProbe();

  if (actionImpliesPushDispatch(input.action)) {
    if (expectation.pushDispatchAllowed && input.explicitPushSend) {
      probe.pushDispatchCount = 1;
    }
  }

  // Event publish / save distribution / save event never send push.
  if (
    input.action === DISTRIBUTION_ACTIONS.PUBLISH_EVENT ||
    input.action === DISTRIBUTION_ACTIONS.SAVE_EVENT ||
    input.action === DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION ||
    input.action === DISTRIBUTION_ACTIONS.PUBLISH_POPUP
  ) {
    probe.pushDispatchCount = 0;
  }

  if (expectation.bellRecordAllowed && input.explicitBellCreate) {
    probe.bellRecordCount = 1;
  }

  if (!expectation.bellRecordAllowed) {
    probe.bellRecordCount = 0;
  }

  return probe;
}

export function assertPushOffMeansZeroDispatch(
  toggles: PromotionDistributionToggleDraft
): { ok: true } | { ok: false; error: string } {
  if (toggles.push) return { ok: true };
  const mapping = mapPushBellToCampaignChannel({
    pushEnabled: toggles.push,
    bellEnabled: toggles.bell,
  });
  if (mapping.kind === "push" || mapping.kind === "both") {
    return { ok: false, error: "push_off_but_push_channel_planned" };
  }
  const publish = simulateOrchestrationSideEffects({
    action: DISTRIBUTION_ACTIONS.PUBLISH_EVENT,
    toggles,
  });
  const saveDist = simulateOrchestrationSideEffects({
    action: DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION,
    toggles,
  });
  const popupOn = simulateOrchestrationSideEffects({
    action: DISTRIBUTION_ACTIONS.PUBLISH_POPUP,
    toggles: { ...toggles, popup: true },
  });
  if (
    publish.pushDispatchCount !== 0 ||
    saveDist.pushDispatchCount !== 0 ||
    popupOn.pushDispatchCount !== 0
  ) {
    return { ok: false, error: "push_off_nonzero_dispatch" };
  }
  return { ok: true };
}

export function assertBellOffMeansZeroRecord(
  toggles: PromotionDistributionToggleDraft
): { ok: true } | { ok: false; error: string } {
  if (toggles.bell) return { ok: true };
  const mapping = mapPushBellToCampaignChannel({
    pushEnabled: toggles.push,
    bellEnabled: toggles.bell,
  });
  if (mapping.kind === "bell" || mapping.kind === "both") {
    return { ok: false, error: "bell_off_but_in_app_channel_planned" };
  }
  const probe = simulateOrchestrationSideEffects({
    action: DISTRIBUTION_ACTIONS.SAVE_DISTRIBUTION,
    toggles,
    explicitBellCreate: true,
  });
  if (probe.bellRecordCount !== 0) {
    return { ok: false, error: "bell_off_nonzero_record" };
  }
  return { ok: true };
}
