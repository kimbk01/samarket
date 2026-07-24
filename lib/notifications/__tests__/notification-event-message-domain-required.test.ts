import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("notification_events message domain required", () => {
  it("createNotificationEvent writes chat_domain + domain_identity_key pair", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/core/notification-event-repository.ts"),
      "utf8"
    );
    expect(src).toContain("chat_domain: chatDomain");
    expect(src).toContain("domain_identity_key: domainIdentityKey");
  });

  it("notifyMessagePipeline resolves and passes Domain pair before insert", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/notifications/pipeline/notify-message-pipeline.ts"),
      "utf8"
    );
    expect(src).toContain("resolveMessageEventDomainPair");
    expect(src).toContain("chatDomain: domainPair.chatDomain");
    expect(src).toContain("domainIdentityKey: domainPair.domainIdentityKey");
    expect(src).toContain("message_domain_required");
  });
});
