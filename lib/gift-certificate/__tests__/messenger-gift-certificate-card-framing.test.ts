import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMessengerGiftCertificateCardFraming } from "@/lib/gift-certificate/messenger-gift-certificate-card-framing";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("CUT3 messenger gift certificate card framing", () => {
  it("sender: sent framing keys; received/arrival keys absent", () => {
    const framing = resolveMessengerGiftCertificateCardFraming(false);
    expect(framing.role).toBe("sender");
    expect(framing.titleKey).toBe("gift_cert_chat_sent_title");
    expect(framing.bodyKey).toBe("gift_cert_chat_sent_to");
    expect(framing.titleKey).not.toContain("received");
    expect(framing.bodyKey).not.toContain("received");
  });

  it("recipient: received framing keys; sent keys absent", () => {
    const framing = resolveMessengerGiftCertificateCardFraming(true);
    expect(framing.role).toBe("recipient");
    expect(framing.titleKey).toBe("gift_cert_chat_received_title");
    expect(framing.bodyKey).toBe("gift_cert_chat_received_from");
    expect(framing.titleKey).not.toContain("sent");
    expect(framing.bodyKey).not.toContain("sent");
  });

  it("card uses isRecipient framing authority and keeps CTA/status contracts", () => {
    const card = source("components/community-messenger/MessengerGiftCertificateCard.tsx");
    expect(card).toContain("resolveMessengerGiftCertificateCardFraming(props.isRecipient)");
    expect(card).toContain("data-gift-card-framing={framing.role}");
    expect(card).not.toContain("commerce_hub_gift_chat_arrival");
    expect(card).not.toContain("commerce_hub_gift_chat_from");

    // CTA regression
    expect(card).toContain('data-gift-card-accept="1"');
    expect(card).toContain('data-gift-card-reject="1"');
    expect(card).toContain('data-gift-card-cancel="1"');
    expect(card).toContain("props.isRecipient && displayStatus === \"PENDING\"");
    expect(card).toContain("!props.isRecipient && displayStatus === \"PENDING\"");
    expect(card).toContain("props.isRecipient && displayStatus === \"ACCEPTED\"");

    // Status label regression
    expect(card).toContain("gift_cert_chat_status_pending");
    expect(card).toContain("gift_cert_chat_status_accepted");
    expect(card).toContain("gift_cert_chat_status_rejected");
    expect(card).toContain("gift_u3_card_cancelled");
  });
});
