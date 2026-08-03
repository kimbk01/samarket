import { describe, expect, it } from "vitest";
import {
  BADGE_AUTHORITY_IDENTITY_VERSION,
  assertMemberAxisRecipient,
  assertStoreAxisRecipient,
  deliveryOnlyIdentity,
  forbidOwnerUserIdAsStoreOperationalAuthority,
  memberAppIconAllowsAxis,
  memberAppIconForbidsAxis,
  memberBadgeIdentity,
  storeAuthoritiesAreIsolated,
  storeBadgeIdentity,
} from "@/lib/notifications/badge-authority-rebuild/badge-authority-identity";

describe("Gate3 Identity Layer", () => {
  it("exports identity version", () => {
    expect(BADGE_AUTHORITY_IDENTITY_VERSION).toBe("badge_authority_identity_v1");
  });

  it("member and store scopes stay distinct for same raw id", () => {
    const m = memberBadgeIdentity("11111111-1111-1111-1111-111111111111");
    const s = storeBadgeIdentity("11111111-1111-1111-1111-111111111111");
    expect(m.ok && s.ok).toBe(true);
    if (m.ok && s.ok) {
      expect(m.identity.key).toBe("user:11111111-1111-1111-1111-111111111111");
      expect(s.identity.key).toBe("store:11111111-1111-1111-1111-111111111111");
      expect(m.identity.key).not.toBe(s.identity.key);
    }
  });

  it("A/B require member; C requires store", () => {
    const m = memberBadgeIdentity("u1");
    const s = storeBadgeIdentity("s1");
    expect(m.ok && assertMemberAxisRecipient(m.identity, "A").ok).toBe(true);
    expect(s.ok && assertMemberAxisRecipient(s.identity, "A").ok).toBe(false);
    expect(s.ok && assertStoreAxisRecipient(s.identity, "C_operational").ok).toBe(true);
    expect(m.ok && assertStoreAxisRecipient(m.identity, "C_chat").ok).toBe(false);
  });

  it("forbids owner user_id as store operational authority", () => {
    const m = memberBadgeIdentity("owner-user");
    expect(m.ok).toBe(true);
    if (m.ok) {
      expect(forbidOwnerUserIdAsStoreOperationalAuthority(m.identity).ok).toBe(false);
    }
    const s = storeBadgeIdentity("store-1");
    expect(s.ok && forbidOwnerUserIdAsStoreOperationalAuthority(s.identity).ok).toBe(true);
  });

  it("delivery_only cannot be store ops authority", () => {
    expect(forbidOwnerUserIdAsStoreOperationalAuthority(deliveryOnlyIdentity()).ok).toBe(false);
  });

  it("App Icon allows only A/B axes", () => {
    expect(memberAppIconAllowsAxis("A")).toBe(true);
    expect(memberAppIconAllowsAxis("B")).toBe(true);
    expect(memberAppIconForbidsAxis("C_operational")).toBe(true);
    expect(memberAppIconForbidsAxis("C_chat")).toBe(true);
  });

  it("two stores remain isolated", () => {
    expect(storeAuthoritiesAreIsolated("s1", "s2")).toBe(true);
    expect(storeAuthoritiesAreIsolated("s1", "s1")).toBe(false);
  });
});
