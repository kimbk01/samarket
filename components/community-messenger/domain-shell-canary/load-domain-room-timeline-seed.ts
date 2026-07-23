/**
 * Domain Canary Room — timeline message seed under Domain Read Authority.
 *
 * Fetches CM message bootstrap by roomId only, then applies Domain presentation lock.
 * Does not use URL/title/avatar or Legacy contextMeta to re-infer Domain identity.
 * Store-order ensure (if needed) uses Domain order id via presentation-built delivery meta only.
 */
import type { DomainRoomPresentation } from "@/components/community-messenger/domain-shell-canary/DomainRoomReadCanaryContext";
import {
  applyDomainRoomPresentationLock,
  buildDeliveryContextMetaFromDomainPresentation,
} from "@/components/community-messenger/domain-shell-canary/apply-domain-room-presentation-lock";
import { assertMessengerRoomEntryContract } from "@/lib/chat-domain/routers/chat-domain-router";
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { fetchCommunityMessengerRoomBootstrapClient } from "@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client";
import {
  canMountCommunityMessengerRoomClient,
} from "@/lib/community-messenger/room/messenger-room-initial-snapshot-authority";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { prepareStoreOrderMessengerRoomEntryByRoomId } from "@/lib/store-order-chat/store-order-messenger-room-entry-client";

export type DomainRoomTimelineSeedResult =
  | { ok: true; snapshot: CommunityMessengerRoomSnapshot }
  | { ok: false; error: string };

/**
 * Single Domain-authority timeline seed: lock identity first, then contract-assert.
 */
export async function loadDomainRoomTimelineSeed(input: {
  roomId: string;
  presentation: DomainRoomPresentation;
  expected: { domain: ChatDomain; identityKey: string };
  viewerUserId?: string;
}): Promise<DomainRoomTimelineSeedResult> {
  const rid = input.roomId.trim();
  const viewer = input.viewerUserId?.trim() || undefined;
  if (!rid) return { ok: false, error: "missing_room_id" };
  if (input.presentation.roomId.trim() !== rid) {
    return { ok: false, error: "domain_presentation_room_mismatch" };
  }
  if (
    input.expected.domain !== input.presentation.chatDomain ||
    input.expected.identityKey !== input.presentation.domainIdentityKey
  ) {
    return { ok: false, error: "domain_expected_presentation_mismatch" };
  }

  let raw: CommunityMessengerRoomSnapshot | null = null;

  if (input.presentation.chatDomain === "store_order") {
    // Ensure path may reload history — Domain delivery meta only (no URL reinference).
    const deliveryMeta = buildDeliveryContextMetaFromDomainPresentation(input.presentation);
    if (!deliveryMeta?.storeOrderId) {
      return { ok: false, error: "domain_store_order_identity_missing" };
    }
    const prepared = await prepareStoreOrderMessengerRoomEntryByRoomId(rid, {
      instantContextMeta: deliveryMeta,
      viewerUserId: viewer,
    });
    if (!prepared.ok) return { ok: false, error: prepared.error };
    raw = prepared.snapshot;
  } else {
    raw = await fetchCommunityMessengerRoomBootstrapClient(rid, { viewerUserId: viewer });
    if (!raw) return { ok: false, error: "bootstrap_failed" };
  }

  if (raw.room.id.trim() !== rid) {
    return { ok: false, error: "timeline_room_id_mismatch" };
  }

  let locked: CommunityMessengerRoomSnapshot;
  try {
    locked = applyDomainRoomPresentationLock(raw, input.presentation);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "domain_presentation_lock_failed",
    };
  }

  try {
    assertMessengerRoomEntryContract(locked.room, input.expected);
  } catch {
    return { ok: false, error: "domain_identity_mismatch" };
  }

  if (!canMountCommunityMessengerRoomClient(locked)) {
    return { ok: false, error: "incomplete_timeline_seed" };
  }

  return { ok: true, snapshot: locked };
}
