/**
 * DIBAY Notification Sound SSOT — resolver.
 * Priority: room_mute → user pref → admin mapping → event default → fallback → dibay_default → device_default
 */
import {
  DIBAY_DEFAULT_ASSET_ID,
  DEVICE_DEFAULT_NOTIFICATION_ASSET_ID,
  DEVICE_DEFAULT_RINGTONE_ASSET_ID,
  SILENT_ASSET_ID,
  SYSTEM_DEFAULT_EVENT_KEY,
  type NotificationSoundAssetRow,
  type NotificationSoundEventRow,
  type NotificationSoundMappingRow,
  type ResolveNotificationSoundContext,
  type ResolvedNotificationSound,
  type SoundKind,
} from "@/lib/notifications/notification-sound-types";
import {
  NOTIFICATION_SOUND_ASSETS,
  NOTIFICATION_SOUND_EVENTS,
  getRegistryAsset,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";

export type NotificationSoundSsotSnapshot = {
  assets: Map<string, NotificationSoundAssetRow>;
  events: Map<string, NotificationSoundEventRow>;
  mappings: Map<string, NotificationSoundMappingRow>;
};

let cachedSnapshot: NotificationSoundSsotSnapshot | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export function buildRegistrySnapshot(): NotificationSoundSsotSnapshot {
  const assets = new Map<string, NotificationSoundAssetRow>();
  const events = new Map<string, NotificationSoundEventRow>();
  const mappings = new Map<string, NotificationSoundMappingRow>();
  for (const a of NOTIFICATION_SOUND_ASSETS) assets.set(a.id, { ...a });
  for (const e of NOTIFICATION_SOUND_EVENTS) {
    events.set(e.event_key, { ...e });
    mappings.set(e.event_key, {
      event_key: e.event_key,
      asset_id: e.default_asset_id,
      use_device_default: false,
      volume: 0.7,
      repeat_count: 1,
      cooldown_seconds: 0,
      vibration_enabled: null,
      priority: null,
      enabled: e.enabled,
    });
  }
  return { assets, events, mappings };
}

export function setNotificationSoundSsotSnapshot(snapshot: NotificationSoundSsotSnapshot | null): void {
  cachedSnapshot = snapshot;
  cachedAt = Date.now();
}

export function invalidateNotificationSoundSsotCache(): void {
  cachedSnapshot = null;
  cachedAt = 0;
}

export function getNotificationSoundSsotSnapshot(): NotificationSoundSsotSnapshot {
  if (cachedSnapshot && Date.now() - cachedAt < CACHE_MS) return cachedSnapshot;
  cachedSnapshot = buildRegistrySnapshot();
  cachedAt = Date.now();
  return cachedSnapshot;
}

function isTestOrDevStrict(): boolean {
  return process.env.NODE_ENV === "test" || process.env.NOTIFICATION_SOUND_STRICT === "1";
}

function resolveWebUrl(asset: NotificationSoundAssetRow | undefined): string | null {
  if (!asset) return null;
  if (asset.kind === "silent" || asset.kind === "device_default") return null;
  const url = (asset.file_url && asset.file_url.trim()) || (asset.file_path && asset.file_path.trim()) || null;
  return url;
}

function resolveIosSound(asset: NotificationSoundAssetRow | undefined, event: NotificationSoundEventRow): string | null {
  if (asset?.kind === "silent") return null;
  if (asset?.kind === "device_default") return "default";
  return event.ios_sound_name ?? asset?.ios_sound_name ?? "default";
}

function deviceDefaultAssetForEvent(event: NotificationSoundEventRow): string {
  if (event.domain === "call_voice" || event.domain === "call_video") {
    return DEVICE_DEFAULT_RINGTONE_ASSET_ID;
  }
  return DEVICE_DEFAULT_NOTIFICATION_ASSET_ID;
}

function buildResolved(
  eventKey: string,
  assetId: string,
  kind: SoundKind,
  event: NotificationSoundEventRow,
  asset: NotificationSoundAssetRow | undefined,
  mapping: NotificationSoundMappingRow | undefined,
  resolvedFrom: ResolvedNotificationSound["resolvedFrom"],
  enabled: boolean
): ResolvedNotificationSound {
  return {
    eventKey,
    assetId,
    kind,
    webUrl: resolveWebUrl(asset),
    iosSoundName: resolveIosSound(asset, event),
    androidChannelId: event.android_channel_id,
    vibration: mapping?.vibration_enabled ?? event.vibration_enabled,
    volume: mapping?.volume ?? 0.7,
    repeatCount: mapping?.repeat_count ?? 1,
    cooldownSeconds: mapping?.cooldown_seconds ?? 0,
    priority: mapping?.priority ?? event.priority,
    enabled,
    resolvedFrom,
    legacySource: asset?.legacy_source ?? event.legacy_source ?? null,
  };
}

function silentResult(eventKey: string, event: NotificationSoundEventRow): ResolvedNotificationSound {
  const asset = getNotificationSoundSsotSnapshot().assets.get(SILENT_ASSET_ID);
  return buildResolved(
    eventKey,
    SILENT_ASSET_ID,
    "silent",
    event,
    asset,
    undefined,
    "room_mute",
    false
  );
}

export function resolveNotificationSoundFromSnapshot(
  eventKey: string,
  context: ResolveNotificationSoundContext = {},
  snapshot: NotificationSoundSsotSnapshot = getNotificationSoundSsotSnapshot()
): ResolvedNotificationSound {
  const key = eventKey.trim();
  let event = snapshot.events.get(key);
  let effectiveKey = key;
  if (!event) {
    const msg = `[notification-sound] unknown eventKey: ${key}`;
    if (isTestOrDevStrict()) throw new Error(msg);
    console.warn(msg);
    effectiveKey = SYSTEM_DEFAULT_EVENT_KEY;
    event = snapshot.events.get(SYSTEM_DEFAULT_EVENT_KEY) ?? getRegistryEvent(SYSTEM_DEFAULT_EVENT_KEY);
    if (!event) throw new Error("system_default event missing from registry");
  }

  const ev = event;

  if (context.roomMuted === true) {
    return silentResult(effectiveKey, ev);
  }

  if (context.userSoundEnabled === false) {
    return silentResult(effectiveKey, ev);
  }

  if (context.userDomainEnabled === false) {
    return silentResult(effectiveKey, ev);
  }

  const mapping = snapshot.mappings.get(effectiveKey);
  if (mapping && mapping.enabled === false) {
    return silentResult(effectiveKey, ev);
  }

  let assetId = mapping?.asset_id ?? ev.default_asset_id;
  let resolvedFrom: ResolvedNotificationSound["resolvedFrom"] = mapping
    ? "admin_mapping"
    : "event_default";

  if (mapping?.use_device_default || context.devicePreferDefault) {
    assetId = deviceDefaultAssetForEvent(ev);
    resolvedFrom = "device_default";
  }

  let asset = snapshot.assets.get(assetId);
  if (!asset) {
    assetId = DIBAY_DEFAULT_ASSET_ID;
    asset = snapshot.assets.get(assetId);
    resolvedFrom = "dibay_default";
  }

  if (asset?.kind === "silent") {
    return buildResolved(effectiveKey, assetId, "silent", ev, asset, mapping ?? undefined, resolvedFrom, false);
  }

  const result = buildResolved(
    effectiveKey,
    assetId,
    asset?.kind ?? "dibay_default",
    ev,
    asset,
    mapping ?? undefined,
    resolvedFrom,
    true
  );

  // Custom asset without seeded URL: keep SSOT assetId/channel; borrow playable URL from fallback.
  if (
    asset &&
    asset.kind === "dibay_custom" &&
    !result.webUrl &&
    ev.fallback_event_key &&
    ev.fallback_event_key !== effectiveKey
  ) {
    const fb = resolveNotificationSoundFromSnapshot(ev.fallback_event_key, context, snapshot);
    return {
      ...result,
      webUrl: fb.webUrl,
      iosSoundName: fb.iosSoundName ?? result.iosSoundName,
      resolvedFrom: result.resolvedFrom === "admin_mapping" ? "admin_mapping" : "fallback_chain",
    };
  }

  return result;
}

/** Convenience — uses cached registry snapshot (server routes should hydrate from DB first). */
export function resolveNotificationSound(
  eventKey: string,
  context: ResolveNotificationSoundContext = {}
): ResolvedNotificationSound {
  return resolveNotificationSoundFromSnapshot(eventKey, context);
}

export function resolveNotificationSoundForEvent(
  eventKey: string,
  context?: ResolveNotificationSoundContext
): ResolvedNotificationSound {
  return resolveNotificationSound(eventKey, context);
}

export async function hydrateNotificationSoundSnapshotFromRows(rows: {
  assets?: NotificationSoundAssetRow[];
  events?: NotificationSoundEventRow[];
  mappings?: NotificationSoundMappingRow[];
}): Promise<NotificationSoundSsotSnapshot> {
  const base = buildRegistrySnapshot();
  for (const a of rows.assets ?? []) base.assets.set(a.id, a);
  for (const e of rows.events ?? []) base.events.set(e.event_key, e);
  for (const m of rows.mappings ?? []) base.mappings.set(m.event_key, m);
  setNotificationSoundSsotSnapshot(base);
  return base;
}

export function mergeLegacyAssetUrl(assetId: string, fileUrl: string | null): void {
  const snap = getNotificationSoundSsotSnapshot();
  const asset = snap.assets.get(assetId) ?? getRegistryAsset(assetId);
  if (!asset) return;
  snap.assets.set(assetId, {
    ...asset,
    file_url: fileUrl,
    kind: fileUrl ? "dibay_custom" : asset.kind,
  });
  setNotificationSoundSsotSnapshot(snap);
}
