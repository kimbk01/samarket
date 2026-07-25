import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("P3-a read ACK Generation Owner contract", () => {
  it("mark* does not force-rebuild Domain badge (ACK owns generation)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/pipeline/notify-read-service.ts"),
      "utf8"
    );
    expect(src).toContain("invalidateNotificationBadgeCache");
    expect(src).toContain("P3-a LOCK");
    expect(src).not.toContain("fetchDomainBadgeAuthorityPayload");
    expect(src).not.toMatch(/force:\s*true/);
  });

  it("room-read / read-thread issue Domain snapshot once on ACK", () => {
    const ackHelper = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/pipeline/domain-badge-read-ack.ts"),
      "utf8"
    );
    expect(ackHelper).toContain("badgeGeneration");
    expect(ackHelper).toContain("issueDomainBadgeAuthorityForAck");
    for (const rel of [
      "app/api/me/notifications/room-read/route.ts",
      "app/api/me/notifications/read-thread/route.ts",
      "app/api/me/notifications/read/route.ts",
      "app/api/me/notifications/read-category/route.ts",
      "app/api/me/notifications/missed-call-read/route.ts",
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("issueDomainBadgeAuthorityForAck");
      expect(src).toContain("domainBadgeReadMutationAckFields");
    }
  });

  it("client prefers ACK apply and skipBadgeCount over fresh GET", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "lib/notifications/client/notification-event-read-client.ts"),
      "utf8"
    );
    expect(src).toContain("applyDomainBadgeAuthorityFromReadAck");
    expect(src).toContain("skipBadgeCount: true");
    expect(src).toContain("resyncBadgesAfterNotificationEventsRead(reason)");
  });

  it("room bump payload carries eventIdentity + badgeGeneration (limited C; unused)", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "lib/community-messenger/realtime/room-bump-broadcast-server.ts"
      ),
      "utf8"
    );
    expect(src).toContain("payload.eventIdentity");
    expect(src).toContain("payload.badgeGeneration");
    expect(src).toContain("payload.projectionVersionMs");
    expect(src).toContain("P3-a limited C");
  });
});
