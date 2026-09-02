import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGiftOfferRpcSuccess } from "@/lib/gift-certificate/gift-offer-canonical-message";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("gift offer response capture contract", () => {
  it("T1: canonical offer API returns transfer_id (snake_case)", () => {
    const route = source("app/api/me/gift-certificates/transfers/offer/route.ts");
    expect(route).toContain("transfer_id: result.transferId");
    expect(route).toContain("message_id: result.messageId");
  });

  it("T2: RPC + helper parse the same snake_case IDs", () => {
    const parsed = parseGiftOfferRpcSuccess({
      transfer_id: "11111111-1111-4111-8111-111111111111",
      message_id: "22222222-2222-4222-8222-222222222222",
      room_id: "33333333-3333-4333-8333-333333333333",
    });
    expect(parsed?.transfer_id).toBe("11111111-1111-4111-8111-111111111111");
    expect(parsed?.message_id).toBe("22222222-2222-4222-8222-222222222222");
    const exec = source("lib/gift-certificate/execute-gift-transfer-offer.ts");
    expect(exec).toContain("transferId = parsed.transfer_id");
    expect(exec).toContain("messageId = parsed.message_id");
  });

  it("T3: QA harness awaits one offer POST via waitForResponse (no async on-response race)", () => {
    const qa = source("scripts/qa/gift-offer-instant-delivery-runtime-close.mjs");
    expect(qa).toContain("waitForResponse");
    expect(qa).toContain('res.request().method() === "POST"');
    expect(qa).toContain("offerJson.transfer_id");
    expect(qa).toContain("offerJson.message_id");
    expect(qa).not.toMatch(/pageA\.on\(\s*["']response["']/);
  });

  it("T4: product client and QA both read canonical transfer_id from API JSON", () => {
    const client = source("components/gift-certificate/MessengerGiftOfferFlow.tsx");
    const qa = source("scripts/qa/gift-offer-instant-delivery-runtime-close.mjs");
    expect(client).toContain("json.transfer_id");
    expect(qa).toContain("offerJson.transfer_id");
    expect(qa).toContain("offerJson.message_id");
  });
});
