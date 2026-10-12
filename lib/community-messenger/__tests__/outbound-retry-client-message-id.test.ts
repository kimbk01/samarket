import { describe, expect, it, vi } from "vitest";
import {
  OUTBOUND_RETRY_CLIENT_MESSAGE_ID_REUSE_WINDOW_MS,
  isUncertainOutboundSendHttpStatus,
  resolveOutboundTextClientMessageId,
} from "@/lib/community-messenger/room/outbound-retry-client-message-id";

const NOW = 1_800_000_000_000;

function failure(overrides: Partial<{ content: string; replyToMessageId: string; failedAt: number }> = {}) {
  return {
    content: "안녕하세요",
    replyToMessageId: "",
    clientMessageId: "cid-first",
    failedAt: NOW - 3_000,
    ...overrides,
  };
}

describe("resolveOutboundTextClientMessageId (D-7)", () => {
  it("reuses the failed send's id for an immediate retry of the same text → server dedupes to 1 row", () => {
    const create = vi.fn(() => "cid-new");
    const r = resolveOutboundTextClientMessageId({
      uncertainFailure: failure(),
      content: "안녕하세요",
      replyToMessageId: "",
      now: NOW,
      createClientMessageId: create,
    });
    expect(r).toEqual({ clientMessageId: "cid-first", reused: true });
    expect(create).not.toHaveBeenCalled();
  });

  it("creates a new id when there was no uncertain failure (normal repeated sending stays possible)", () => {
    const r = resolveOutboundTextClientMessageId({
      uncertainFailure: null,
      content: "안녕하세요",
      replyToMessageId: "",
      now: NOW,
      createClientMessageId: () => "cid-new",
    });
    expect(r).toEqual({ clientMessageId: "cid-new", reused: false });
  });

  it("creates a new id when the user edited the text", () => {
    const r = resolveOutboundTextClientMessageId({
      uncertainFailure: failure(),
      content: "안녕하세요!",
      replyToMessageId: "",
      now: NOW,
      createClientMessageId: () => "cid-new",
    });
    expect(r.reused).toBe(false);
  });

  it("creates a new id when the reply target differs", () => {
    const r = resolveOutboundTextClientMessageId({
      uncertainFailure: failure({ replyToMessageId: "m-1" }),
      content: "안녕하세요",
      replyToMessageId: "m-2",
      now: NOW,
      createClientMessageId: () => "cid-new",
    });
    expect(r.reused).toBe(false);
  });

  it("does not merge a much later identical sentence into the old row", () => {
    const r = resolveOutboundTextClientMessageId({
      uncertainFailure: failure({ failedAt: NOW - OUTBOUND_RETRY_CLIENT_MESSAGE_ID_REUSE_WINDOW_MS - 1 }),
      content: "안녕하세요",
      replyToMessageId: "",
      now: NOW,
      createClientMessageId: () => "cid-new",
    });
    expect(r.reused).toBe(false);
  });

  it("classifies only 5xx / network status as uncertain (4xx = rejection confirmed, nothing stored)", () => {
    expect(isUncertainOutboundSendHttpStatus(0)).toBe(true);
    expect(isUncertainOutboundSendHttpStatus(500)).toBe(true);
    expect(isUncertainOutboundSendHttpStatus(504)).toBe(true);
    expect(isUncertainOutboundSendHttpStatus(400)).toBe(false);
    expect(isUncertainOutboundSendHttpStatus(401)).toBe(false);
    expect(isUncertainOutboundSendHttpStatus(403)).toBe(false);
    expect(isUncertainOutboundSendHttpStatus(429)).toBe(false);
  });
});
