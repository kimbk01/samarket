/**
 * Gate 3 Step 11 — Cap resume versionless paint removal.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAP_RESUME_VERSIONED_AUTHORITY,
  assertVersionedAppIconFinalCommit,
  attemptAppIconFinalCommitFromCapCache,
  capCacheCannotOverwriteCanonical,
  coldAppIconFinalSource,
  evaluateCapBadgeCacheForAppIcon,
  resumeAppIconFinalSource,
  warmAppIconFinalSource,
} from "@/lib/notifications/badge-authority-rebuild/cap-resume-versioned-authority";
import {
  publishMemberAppIconAuthority,
  resolveMemberAppIconAuthority,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import { resolveMemberConversationAuthority } from "@/lib/notifications/badge-authority-rebuild/member-conversation-b-authority";
import {
  commitMemberAppIconAuthority,
  logoutClearMemberAppIconAuthority,
  getCommittedMemberAppIconAuthority,
  resetCommittedMemberAppIconAuthorityForTests,
} from "@/lib/notifications/badge-authority-rebuild/member-app-icon-authority-commit";
import { generalDirectRoomIdentity } from "@/lib/chat-domain/room-identity";

const MEMBER = "11111111-1111-1111-1111-111111111111";
const root = process.cwd();

function snap(rev: number, aIds: string[] = ["e1"], rooms = 1) {
  const roomInputs =
    rooms > 0
      ? [
          {
            roomId: "r1",
            chatDomain: "general_direct" as const,
            unreadMessageCount: 2,
            domainIdentityKey: generalDirectRoomIdentity(MEMBER, "peer-1").identityKey,
            memberId: MEMBER,
            peerUserId: "peer-1",
          },
        ]
      : [];
  return resolveMemberAppIconAuthority({
    notificationA: resolveMemberNotificationAuthorityFromRows(
      aIds.map((id) => ({
        id,
        type: "admin_notice",
        category: "admin_notice",
        unread: true,
        read_at: null,
        dedupe_key: id,
        display_payload: {},
      })),
      MEMBER
    ),
    conversationB: resolveMemberConversationAuthority(MEMBER, roomInputs),
    revision: rev,
  });
}

describe("Gate3 Step11 Cap resume versioned authority", () => {
  it("locks authority id + cold/warm/resume final source", () => {
    expect(CAP_RESUME_VERSIONED_AUTHORITY).toBe("cap_resume_versioned_authority_v1");
    expect(resumeAppIconFinalSource()).toBe("canonical_builder_only");
    expect(warmAppIconFinalSource()).toBe("canonical_builder_only");
    expect(coldAppIconFinalSource()).toBe("canonical_builder_only");
  });

  it("versionless prefs cannot final-commit", () => {
    expect(assertVersionedAppIconFinalCommit(null).ok).toBe(false);
    expect(assertVersionedAppIconFinalCommit("").ok).toBe(false);
    expect(assertVersionedAppIconFinalCommit("3").ok).toBe(false);
    const missing = assertVersionedAppIconFinalCommit(null);
    expect(missing).toEqual({ ok: false, reason: "VERSION_REQUIRED" });
    expect(
      evaluateCapBadgeCacheForAppIcon({
        lifecycle: "cold",
        canonicalCommitted: false,
        authorityVersion: null,
        memberKey: `user:${MEMBER}`,
      }).allow
    ).toBe(false);
  });

  it("resume rejects Cap cache even when versioned", () => {
    const d = evaluateCapBadgeCacheForAppIcon({
      lifecycle: "resume",
      canonicalCommitted: false,
      authorityVersion: "ai1|1|x",
      memberKey: `user:${MEMBER}`,
    });
    expect(d).toEqual({ allow: false, reason: "RESUME_FORBIDDEN", role: "none" });
  });

  it("versionless prefs cannot overwrite canonical snapshot", () => {
    const canonical = snap(10);
    const attempt = attemptAppIconFinalCommitFromCapCache({
      cachedTotal: 99,
      authorityVersion: null,
      memberKey: `user:${MEMBER}`,
      lifecycle: "resume",
      current: canonical,
    });
    expect(attempt).toEqual({ ok: false, reason: "RESUME_FORBIDDEN" });
  });

  it("older cached snapshot rejected; same idempotent; newer applied", () => {
    const older = snap(1);
    const newer = snap(5, ["e1", "e2"], 1);
    const stale = publishMemberAppIconAuthority(older, newer);
    expect(stale).toEqual({ ok: false, reason: "STALE_VERSION" });
    expect(publishMemberAppIconAuthority(newer, newer)).toEqual({
      ok: true,
      action: "idempotent",
    });
    expect(publishMemberAppIconAuthority(newer, older)).toEqual({
      ok: true,
      action: "applied",
    });
    expect(capCacheCannotOverwriteCanonical({ cached: newer, canonical: older })).toEqual({
      ok: false,
      reason: "STALE_VERSION",
    });
  });

  it("different member cache rejected; logout clears", () => {
    resetCommittedMemberAppIconAuthorityForTests();
    const a = snap(3);
    commitMemberAppIconAuthority(a);
    const otherMember = "22222222-2222-2222-2222-222222222222";
    const other = resolveMemberAppIconAuthority({
      notificationA: resolveMemberNotificationAuthorityFromRows([], otherMember),
      conversationB: resolveMemberConversationAuthority(otherMember, []),
      revision: 99,
    });
    expect(publishMemberAppIconAuthority(other, a)).toEqual({
      ok: false,
      reason: "MEMBER_MISMATCH",
    });
    logoutClearMemberAppIconAuthority();
    expect(getCommittedMemberAppIconAuthority()).toBeNull();
  });

  it("temporary paint cannot reapply after canonical commit", () => {
    const d = evaluateCapBadgeCacheForAppIcon({
      lifecycle: "cold",
      canonicalCommitted: true,
      authorityVersion: "ai1|2|ok",
      memberKey: `user:${MEMBER}`,
    });
    expect(d).toEqual({
      allow: false,
      reason: "CANONICAL_ALREADY_COMMITTED",
      role: "none",
    });
    const attempt = attemptAppIconFinalCommitFromCapCache({
      cachedTotal: 7,
      authorityVersion: "ai1|2|ok",
      memberKey: `user:${MEMBER}`,
      lifecycle: "cold",
      current: null,
    });
    expect(attempt).toEqual({ ok: false, reason: "TEMPORARY_PAINT_NOT_FINAL" });
  });

  it("Native Cap cache applyFromCapBadgeCache is no-op reject (static)", () => {
    const android = fs.readFileSync(
      path.join(root, "android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java"),
      "utf8"
    );
    expect(android).toContain("cap_cache_paint_rejected");
    expect(android).toContain("VERSION_REQUIRED_OR_RESUME_FORBIDDEN");
    expect(android).not.toMatch(
      /applyFromCapBadgeCache[\s\S]{0,400}prefs\.getInt\(\s*"capacitor\.badge"/
    );
    expect(android).toContain("onDomainNotificationPosted");

    const ios = fs.readFileSync(
      path.join(root, "ios/App/App/Plugins/DibayAppIconDeliveryAdapter.swift"),
      "utf8"
    );
    expect(ios).toContain("cap_cache_paint_rejected");
    expect(ios).not.toMatch(
      /applyFromCapBadgeCache\(\)[\s\S]{0,200}apply\(appIconTotal:\s*cached\)/
    );

    const main = fs.readFileSync(
      path.join(root, "android/app/src/main/java/com/dibay/app/MainActivity.java"),
      "utf8"
    );
    expect(main).toContain("Gate 3 Step 11");
    const appDelegate = fs.readFileSync(
      path.join(root, "ios/App/App/AppDelegate.swift"),
      "utf8"
    );
    expect(appDelegate).toContain("Gate 3 Step 11");
  });

  it("NativeBadgeSync still absolute echo from Projection only", () => {
    const native = fs.readFileSync(
      path.join(root, "components/push/NativeBadgeSync.tsx"),
      "utf8"
    );
    expect(native).toContain("surface.appIconTotal");
    expect(native).toContain("syncNativeBadgeCount(n)");
    expect(native).not.toContain("applyFromCapBadgeCache");
    expect(native).not.toContain("Preferences");
  });
});
