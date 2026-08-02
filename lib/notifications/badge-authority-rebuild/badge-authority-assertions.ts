/**
 * Slice 2-1 — Authority ↔ identity ↔ surface assertions.
 */

import type { BadgeAuthority, BadgeSurface } from "./badge-authority-types";
import type { BadgeRecipientIdentity } from "./badge-recipient-identity";
import { authorityAllowsSurface } from "./badge-surface-eligibility";

export type BadgeAssertionFailureReason =
  | "MEMBER_AUTHORITY_REQUIRES_MEMBER_IDENTITY"
  | "STORE_AUTHORITY_REQUIRES_STORE_IDENTITY"
  | "B_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON"
  | "C_STORE_CANNOT_PROJECT_TO_MEMBER_BELL"
  | "C_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON"
  | "B_MEMBER_CANNOT_PROJECT_TO_MEMBER_BELL"
  | "A_MEMBER_CANNOT_PROJECT_TO_BOTTOM_CHAT"
  | "UNKNOWN_AUTHORITY_IS_BLOCKED"
  | "AUTHORITY_SURFACE_NOT_ALLOWED"
  | "RAW_UUID_IS_NOT_A_BADGE_IDENTITY"
  | "STORE_ID_REQUIRED_FOR_OWNER_INTAKE";

export type BadgeAssertionResult =
  | { ok: true }
  | { ok: false; reason: BadgeAssertionFailureReason };

export function assertAuthorityIdentityCompatible(
  authority: BadgeAuthority,
  identity: BadgeRecipientIdentity
): BadgeAssertionResult {
  const memberAuth =
    authority === "A_MEMBER_NOTIFICATION" || authority === "B_MEMBER_COMMUNICATION";
  const storeAuth =
    authority === "B_STORE_COMMUNICATION" || authority === "C_STORE_OPERATION";

  if (memberAuth && identity.scope !== "member") {
    return { ok: false, reason: "MEMBER_AUTHORITY_REQUIRES_MEMBER_IDENTITY" };
  }
  if (storeAuth && identity.scope !== "store") {
    return { ok: false, reason: "STORE_AUTHORITY_REQUIRES_STORE_IDENTITY" };
  }
  return { ok: true };
}

export function assertAuthorityCanProjectToSurface(
  authority: BadgeAuthority,
  surface: BadgeSurface
): BadgeAssertionResult {
  if (authority === "B_STORE_COMMUNICATION" && surface === "MEMBER_APP_ICON") {
    return { ok: false, reason: "B_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON" };
  }
  if (authority === "B_STORE_COMMUNICATION" && surface === "NATIVE_MEMBER_APP_ICON") {
    return { ok: false, reason: "B_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON" };
  }
  if (authority === "C_STORE_OPERATION" && surface === "MEMBER_BELL") {
    return { ok: false, reason: "C_STORE_CANNOT_PROJECT_TO_MEMBER_BELL" };
  }
  if (
    authority === "C_STORE_OPERATION" &&
    (surface === "MEMBER_APP_ICON" || surface === "NATIVE_MEMBER_APP_ICON")
  ) {
    return { ok: false, reason: "C_STORE_CANNOT_PROJECT_TO_MEMBER_APP_ICON" };
  }
  if (authority === "B_MEMBER_COMMUNICATION" && surface === "MEMBER_BELL") {
    return { ok: false, reason: "B_MEMBER_CANNOT_PROJECT_TO_MEMBER_BELL" };
  }
  if (authority === "A_MEMBER_NOTIFICATION" && surface === "BOTTOM_CHAT") {
    return { ok: false, reason: "A_MEMBER_CANNOT_PROJECT_TO_BOTTOM_CHAT" };
  }
  if (!authorityAllowsSurface(authority, surface)) {
    return { ok: false, reason: "AUTHORITY_SURFACE_NOT_ALLOWED" };
  }
  return { ok: true };
}

export function assertNotUnknownBlocked(
  classification: string
): BadgeAssertionResult {
  if (classification === "UNKNOWN_BLOCKED" || classification === "EPHEMERAL_NO_BADGE") {
    return { ok: false, reason: "UNKNOWN_AUTHORITY_IS_BLOCKED" };
  }
  return { ok: true };
}
