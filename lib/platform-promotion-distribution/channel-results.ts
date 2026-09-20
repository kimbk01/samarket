/**
 * Channel materialization results — never claim full success on partial failure.
 */

export type ChannelMaterializeStatus =
  | { ok: true; channelRefId: string | null; action: "created" | "updated" | "paused" | "noop" }
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
