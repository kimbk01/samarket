import {
  NOTIFICATION_SOUND_ASSET_IDS,
  NOTIFICATION_SOUND_EVENT_KEYS,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";
import {
  isLegacyKvMirrorEvent,
  resolveMirrorUrlForValidation,
} from "@/lib/notifications/notification-sound-legacy-mirror";
import { validateRepeatCountForEvent } from "@/lib/notifications/notification-sound-ssot-repeat-policy";
import type { NotificationSoundAssetRow } from "@/lib/notifications/notification-sound-types";

export const SOUND_MAX_BYTES = 2 * 1024 * 1024;
export const FILE_URL_MAX = 4096;
export const LEGACY_MIRROR_URL_MAX = 2048;
export const LABEL_MAX = 255;
export const ANDROID_CHANNEL_ID_MAX = 128;
export const IOS_SOUND_NAME_MAX = 255;
export const COOLDOWN_MAX = 600;
export const LEGACY_SOURCE_JSON_MAX = 8192;
export const ASSET_ID_PATTERN = /^DIBAY-SND-\d{3,}$/;

export type MappingPatch = {
  event_key: string;
  asset_id: string;
  use_device_default?: boolean;
  volume?: number;
  repeat_count?: number;
  cooldown_seconds?: number;
  vibration_enabled?: boolean | null;
  priority?: string | null;
  enabled?: boolean;
};

export type ValidationError = {
  ok: false;
  error: string;
  field?: string;
  max?: number;
  event_key?: string;
};

export type ValidationOk = { ok: true };

export type ValidationResult = ValidationOk | ValidationError;

export type ValidateMappingPatchContext = {
  validAssetIds: Set<string>;
  assetsById: Map<string, NotificationSoundAssetRow>;
};

function fail(
  error: string,
  opts?: { field?: string; max?: number; event_key?: string }
): ValidationError {
  return { ok: false, error, ...opts };
}

function checkStringLength(
  value: string | null | undefined,
  max: number,
  error: string,
  field: string,
  eventKey: string
): ValidationError | null {
  if (value == null || value === "") return null;
  if (value.length > max) {
    return fail(error, { field, max, event_key: eventKey });
  }
  return null;
}

function isValidAssetId(assetId: string, validAssetIds: Set<string>): boolean {
  if (NOTIFICATION_SOUND_ASSET_IDS.includes(assetId)) return true;
  if (validAssetIds.has(assetId)) return true;
  return ASSET_ID_PATTERN.test(assetId);
}

export function validateMappingPatch(
  p: MappingPatch,
  ctx: ValidateMappingPatchContext
): ValidationResult {
  const eventKey = p.event_key?.trim() ?? "";
  if (!eventKey || !NOTIFICATION_SOUND_EVENT_KEYS.includes(eventKey)) {
    return fail(`unregistered event_key: ${eventKey || "(empty)"}`, { field: "event_key", event_key: eventKey });
  }

  const assetId = p.asset_id?.trim() ?? "";
  if (!assetId || !isValidAssetId(assetId, ctx.validAssetIds)) {
    return fail(`invalid asset_id: ${assetId || "(empty)"}`, { field: "asset_id", event_key: eventKey });
  }

  if (typeof p.volume === "number" && (p.volume < 0 || p.volume > 1)) {
    return fail("invalid volume", { field: "volume", event_key: eventKey });
  }

  const repeatCount = typeof p.repeat_count === "number" ? p.repeat_count : 1;
  const repeatResult = validateRepeatCountForEvent(eventKey, repeatCount);
  if (!repeatResult.ok) {
    return fail(repeatResult.error, {
      field: repeatResult.field,
      event_key: repeatResult.event_key,
    });
  }

  if (typeof p.cooldown_seconds === "number" && (p.cooldown_seconds < 0 || p.cooldown_seconds > COOLDOWN_MAX)) {
    return fail("invalid cooldown_seconds", { field: "cooldown_seconds", max: COOLDOWN_MAX, event_key: eventKey });
  }

  const asset =
    ctx.assetsById.get(assetId) ??
    ({
      id: assetId,
      label: assetId,
      kind: "dibay_custom",
      domain: null,
      file_path: null,
      file_url: null,
      ios_sound_name: null,
      android_channel_base: null,
      legacy_source: null,
      enabled: true,
    } satisfies NotificationSoundAssetRow);

  const labelErr = checkStringLength(asset.label, LABEL_MAX, "label_too_long", "label", eventKey);
  if (labelErr) return labelErr;

  const fileUrlErr = checkStringLength(asset.file_url, FILE_URL_MAX, "file_url_too_long", "file_url", eventKey);
  if (fileUrlErr) return fileUrlErr;

  const filePathErr = checkStringLength(asset.file_path, FILE_URL_MAX, "file_url_too_long", "file_path", eventKey);
  if (filePathErr) return filePathErr;

  const iosErr = checkStringLength(
    asset.ios_sound_name,
    IOS_SOUND_NAME_MAX,
    "ios_sound_name_too_long",
    "ios_sound_name",
    eventKey
  );
  if (iosErr) return iosErr;

  const androidBaseErr = checkStringLength(
    asset.android_channel_base,
    ANDROID_CHANNEL_ID_MAX,
    "android_channel_id_too_long",
    "android_channel_base",
    eventKey
  );
  if (androidBaseErr) return androidBaseErr;

  const ev = getRegistryEvent(eventKey);
  if (ev) {
    const channelErr = checkStringLength(
      ev.android_channel_id,
      ANDROID_CHANNEL_ID_MAX,
      "android_channel_id_too_long",
      "android_channel_id",
      eventKey
    );
    if (channelErr) return channelErr;
  }

  if (asset.legacy_source != null) {
    try {
      const json = JSON.stringify(asset.legacy_source);
      if (json.length > LEGACY_SOURCE_JSON_MAX) {
        return fail("metadata_too_large", {
          field: "legacy_source",
          max: LEGACY_SOURCE_JSON_MAX,
          event_key: eventKey,
        });
      }
    } catch {
      return fail("metadata_too_large", { field: "legacy_source", event_key: eventKey });
    }
  }

  const mirrorUrl = resolveMirrorUrlForValidation(assetId, asset);
  if (mirrorUrl) {
    const mirrorMax = isLegacyKvMirrorEvent(eventKey) ? LEGACY_MIRROR_URL_MAX : FILE_URL_MAX;
    const mirrorErrCode = isLegacyKvMirrorEvent(eventKey)
      ? "legacy_mirror_url_too_long"
      : "file_url_too_long";
    const mirrorField = isLegacyKvMirrorEvent(eventKey) ? "legacy_mirror_url" : "file_url";
    const mirrorErr = checkStringLength(mirrorUrl, mirrorMax, mirrorErrCode, mirrorField, eventKey);
    if (mirrorErr) return mirrorErr;
  }

  return { ok: true };
}
