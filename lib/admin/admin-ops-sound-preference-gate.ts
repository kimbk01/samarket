/**
 * P2-A8 — Admin Ops per-admin sound preference gate (pure).
 *
 * Layer AFTER P0-D semantic `shouldPlayAdminOpsSound` / eligible INSERT.
 * Does not decide actionability. Does not touch ADMIN_Q / deeplink / assets.
 */

import { resolveEffectiveNotificationPreference } from "@/lib/notifications/policy/effective-notification-preference";
import type { NormalizedNotificationPreferenceSnapshot } from "@/lib/notifications/policy/notification-preference-normalized-snapshot";
import {
  normalizeNotificationPreferenceStorage,
  type AdminNotificationPreferenceStorageRow,
} from "@/lib/notifications/policy/notification-preference-storage-normalizer";

/** Pure Admin Ops sound preference — P2-A3 `playSound`; explicit recipientRole=admin_ops. */
export function resolveAdminOpsSoundFromPreferences(
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  return resolveEffectiveNotificationPreference({
    recipientRole: "admin_ops",
    preferences,
    now,
  }).playSound;
}

/**
 * Semantic eligibility first; preference second.
 * `semanticEligible=false` → never play (P0-D SSOT preserved).
 */
export function allowAdminOpsSoundAfterPreference(
  semanticEligible: boolean,
  preferences: NormalizedNotificationPreferenceSnapshot,
  now: Date = new Date()
): boolean {
  if (!semanticEligible) return false;
  return resolveAdminOpsSoundFromPreferences(preferences, now);
}

/** Normalize a raw admin pref row (or null) into a full snapshot for the resolver. */
export function preferencesFromAdminOpsStorageRow(
  row: AdminNotificationPreferenceStorageRow | null | undefined,
  now: Date = new Date()
): NormalizedNotificationPreferenceSnapshot {
  return normalizeNotificationPreferenceStorage({
    adminOpsPreferenceRow: row ?? null,
    now,
  });
}
