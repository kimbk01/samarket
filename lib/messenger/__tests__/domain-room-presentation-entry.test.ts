/**
 * Domain room presentation → entry expected domain/identity (Read Surface Canary).
 * Pure contract: contaminated expected must fail closed before timeline mount.
 */
import { describe, expect, it } from "vitest";
import { assertMessengerRoomEntryContract } from "@/lib/chat-domain/routers/chat-domain-router";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";

/** Entry seed shape from Domain room presentation (Gate + BootstrapGate). */
function entryExpectedFromDomainPresentation(presentation: {
  chatDomain: ChatDomain;
  domainIdentityKey: string;
}): { domain: ChatDomain; identityKey: string } {
  return {
    domain: presentation.chatDomain,
    identityKey: presentation.domainIdentityKey,
  };
}

describe("domain room presentation entry contract", () => {
  it("supplies expected domain/identity for entry from presentation", () => {
    const presentation = {
      authority: "domain_room_presentation_canary" as const,
      roomId: "room-1",
      chatDomain: "general_direct" as const,
      domainIdentityKey: "general_direct:user-a:user-b",
    };
    const expected = entryExpectedFromDomainPresentation(presentation);
    expect(expected).toEqual({
      domain: "general_direct",
      identityKey: "general_direct:user-a:user-b",
    });

    const stored = {
      chatDomain: "general_direct" as const,
      domainIdentityKey: "general_direct:user-a:user-b",
    };
    expect(assertMessengerRoomEntryContract(stored, expected)).toEqual(expected);
  });

  it("fails assertMessengerRoomEntryContract when expected domain is contaminated", () => {
    const presentation = {
      chatDomain: "trade" as const,
      domainIdentityKey: "trade:item-1:seller-1:buyer-1",
    };
    const expected = entryExpectedFromDomainPresentation(presentation);

    // Snapshot claims matching identity prefix for trade, but expected was contaminated to group
    const contaminatedExpected = {
      domain: "group" as const,
      identityKey: "group:room-other",
    };

    expect(() =>
      assertMessengerRoomEntryContract(
        {
          chatDomain: "trade",
          domainIdentityKey: "trade:item-1:seller-1:buyer-1",
        },
        contaminatedExpected
      )
    ).toThrow("dibay_chat_domain_router_entry_mismatch");

    // Correct expected from presentation still passes
    expect(
      assertMessengerRoomEntryContract(
        {
          chatDomain: "trade",
          domainIdentityKey: "trade:item-1:seller-1:buyer-1",
        },
        expected
      )
    ).toEqual(expected);
  });

  it("fails when stored room domain diverges from Domain presentation expected", () => {
    const expected = entryExpectedFromDomainPresentation({
      chatDomain: "store_order",
      domainIdentityKey: "store_order:order-1",
    });
    expect(() =>
      assertMessengerRoomEntryContract(
        {
          chatDomain: "general_direct",
          domainIdentityKey: "general_direct:a:b",
        },
        expected
      )
    ).toThrow("dibay_chat_domain_router_entry_mismatch");
  });
});
