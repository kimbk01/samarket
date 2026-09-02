import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGiftTransferMutationResponse } from "@/lib/gift-certificate/gift-transfer-mutation-response";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift offer response capture contract", () => {
  it("T1: canonical offer API returns nested transfer + message", () => {
    const route = source("app/api/me/gift-certificates/transfers/offer/route.ts");
    expect(route).toContain("transfer: result.transfer");
    expect(route).toContain("message: result.message");
  });

  it("T2: decoder reads transfer.id and message.id", () => {
    const parsed = parseGiftTransferMutationResponse({
      ok: true,
      transfer: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "PENDING",
        instance_id: "44444444-4444-4444-8444-444444444444",
        room_id: "33333333-3333-4333-8333-333333333333",
        messenger_message_id: "22222222-2222-4222-8222-222222222222",
      },
      message: {
        id: "22222222-2222-4222-8222-222222222222",
        room_id: "33333333-3333-4333-8333-333333333333",
        sender_id: "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8",
        message_type: "gift_certificate",
        content: "Gift certificate",
        created_at: "2026-09-02T08:00:00.000Z",
        metadata: {
          gift_transfer_id: "11111111-1111-4111-8111-111111111111",
          transfer_status: "PENDING",
        },
      },
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.transfer.id).toBe("11111111-1111-4111-8111-111111111111");
      expect(parsed.message.id).toBe("22222222-2222-4222-8222-222222222222");
    }
  });

  it("T3: QA harness awaits one offer POST via waitForResponse", () => {
    const qa = source("scripts/qa/gift-offer-instant-delivery-runtime-close.mjs");
    expect(qa).toContain("waitForResponse");
    expect(qa).toContain('res.request().method() === "POST"');
    expect(qa).toContain("offerJson?.transfer?.id");
    expect(qa).not.toMatch(/pageA\.on\(\s*["']response["']/);
  });

  it("T4: product client and QA both consume GiftTransferMutationResponse", () => {
    const client = source("components/gift-certificate/MessengerGiftOfferFlow.tsx");
    const qa = source("scripts/qa/gift-offer-instant-delivery-runtime-close.mjs");
    expect(client).toContain("parseGiftTransferMutationResponse");
    expect(qa).toContain("offerJson?.transfer?.id");
    expect(qa).toContain("offerJson?.message?.id");
  });
});
