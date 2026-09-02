import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const offerRouteSrc = readFileSync(
  join(process.cwd(), "app/api/me/gift-certificates/transfers/offer/route.ts"),
  "utf8"
);
const publishBumpSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/server/publish-messenger-room-bump.ts"),
  "utf8"
);
const snapshotCacheSrc = readFileSync(
  join(process.cwd(), "lib/community-messenger/room-bootstrap-snapshot-cache.ts"),
  "utf8"
);
const projectStatusSrc = readFileSync(
  join(process.cwd(), "lib/gift-certificate/project-gift-transfer-messenger-status.ts"),
  "utf8"
);
const serviceSrc = readFileSync(join(process.cwd(), "lib/community-messenger/service.ts"), "utf8");
const timelineSrc = readFileSync(
  join(
    process.cwd(),
    "components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx"
  ),
  "utf8"
);

describe("gift messenger cold-load contract", () => {
  it("T1: offer execution publishes room bump with gift_certificate snapshot", () => {
    const execSrc = readFileSync(
      join(process.cwd(), "lib/gift-certificate/execute-gift-transfer-offer.ts"),
      "utf8"
    );
    expect(execSrc).toContain("publishMessengerRoomBumpAfterMutation");
    expect(execSrc).toContain("messageForBump");
    expect(execSrc).toContain("buildGiftOfferCommunityMessengerMessage");
  });

  it("T2: room bump invalidates bootstrap snapshot cache for participants", () => {
    expect(publishBumpSrc).toContain("invalidateRoomBootstrapSnapshotCache");
  });

  it("T3: snapshot invalidation deletes precomputed counter before refresh", () => {
    expect(snapshotCacheSrc).toContain("deleteRoomBootstrapSnapshotCountersForRoom");
    expect(snapshotCacheSrc).toContain("CM_ROOM_BOOTSTRAP_SNAPSHOT_TABLE");
    expect(snapshotCacheSrc).toContain(".delete()");
  });

  it("T4: transfer status projection invalidates room bootstrap snapshot", () => {
    expect(projectStatusSrc).toContain("invalidateRoomBootstrapSnapshotCache");
  });

  it("T5: bootstrap mapper keeps gift_certificate message type", () => {
    expect(serviceSrc).toContain('mt === "gift_certificate"');
  });

  it("T6: timeline virtual row renders gift certificate card", () => {
    expect(timelineSrc).toContain('messageType === "gift_certificate"');
    expect(timelineSrc).toContain("MessengerGiftCertificateCard");
  });
});
