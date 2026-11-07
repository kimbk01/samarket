/**
 * Channel materialization results — never claim full success on partial failure.
 */

export type ChannelMaterializeStatus =
  | {
      ok: true;
      channelRefId: string | null;
      action: "created" | "updated" | "paused" | "ended" | "noop";
      /** D-06: 이 저장으로 노출 중 팝업이 재검토(다시 승인 필요)로 내려갔다 */
      revertedToReview?: boolean;
    }
  | { ok: false; error: string; channelRefId?: string | null };

export type DistributionChannelResults = {
  popup: ChannelMaterializeStatus;
  banner: ChannelMaterializeStatus;
  push: ChannelMaterializeStatus;
  bell: ChannelMaterializeStatus;
};

export function allChannelsSucceeded(results: DistributionChannelResults): boolean {
  return (
    results.popup.ok && results.banner.ok && results.push.ok && results.bell.ok
  );
}

export function countFailedChannels(results: DistributionChannelResults): number {
  return (["popup", "banner", "push", "bell"] as const).filter((k) => !results[k].ok).length;
}
