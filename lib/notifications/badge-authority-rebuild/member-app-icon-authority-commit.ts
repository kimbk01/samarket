/**
 * Gate 3 Step 6 — App Icon projection commit (client-safe store + gate).
 * Single publisher for Member App Icon Authority snapshots.
 */
"use client";

import {
  assertAppIconSnapshotComplete,
  clearMemberAppIconAuthority,
  nativeAppIconEchoFromAuthority,
  publishMemberAppIconAuthority,
  reconcileCachedAppIconWithCanonical,
  type MemberAppIconAuthority,
  type PublishAppIconResult,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";

let committed: MemberAppIconAuthority | null = null;

export function getCommittedMemberAppIconAuthority(): MemberAppIconAuthority | null {
  return committed;
}

export function resetCommittedMemberAppIconAuthorityForTests(): void {
  committed = null;
}

/**
 * Sole App Icon authority publisher (version + member gate).
 * Returns echo total for Native adapters — no arithmetic.
 */
export function commitMemberAppIconAuthority(
  incoming: MemberAppIconAuthority,
  opts?: {
    ownerStoreOrderUnreadRooms?: number;
    storeActionRequiredCount?: number;
  }
): PublishAppIconResult & {
  echo: ReturnType<typeof nativeAppIconEchoFromAuthority>;
  committed: MemberAppIconAuthority | null;
} {
  const result = publishMemberAppIconAuthority(incoming, committed, opts);
  if (result.ok && result.action === "applied") {
    committed = incoming;
  }
  if (result.ok && result.action === "idempotent" && committed == null) {
    committed = incoming;
  }
  return {
    ...result,
    echo: nativeAppIconEchoFromAuthority(committed),
    committed,
  };
}

export function commitMemberAppIconAuthorityFromHttpBody(
  body: Record<string, unknown>
): PublishAppIconResult & {
  echo: ReturnType<typeof nativeAppIconEchoFromAuthority>;
  committed: MemberAppIconAuthority | null;
} {
  const snap = body.memberAppIconAuthority;
  if (!assertAppIconSnapshotComplete(snap as MemberAppIconAuthority)) {
    return {
      ok: false,
      reason: "PARTIAL_SNAPSHOT",
      echo: nativeAppIconEchoFromAuthority(committed),
      committed,
    };
  }
  return commitMemberAppIconAuthority(snap as MemberAppIconAuthority, {
    ownerStoreOrderUnreadRooms: Number(
      (body as { storeOrderOwnerChatUnread?: unknown }).storeOrderOwnerChatUnread ?? 0
    ),
    storeActionRequiredCount: Number(
      (body as { storeActionRequiredCount?: unknown }).storeActionRequiredCount ?? 0
    ),
  });
}

export function logoutClearMemberAppIconAuthority(): void {
  committed = clearMemberAppIconAuthority(committed);
}

export function reconcileCachedMemberAppIcon(
  cached: MemberAppIconAuthority | null,
  canonical: MemberAppIconAuthority
): ReturnType<typeof reconcileCachedAppIconWithCanonical> {
  const out = reconcileCachedAppIconWithCanonical({ cached, canonical });
  if (out.ok && out.snapshot) {
    committed = out.snapshot;
  }
  return out;
}
