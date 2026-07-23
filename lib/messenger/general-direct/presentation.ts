/**
 * general_direct PresentationPort — 회원 프로필만.
 */
import type { DomainDisplayIdentity } from "@/lib/messenger/contracts/ports";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import {
  GENERAL_DIRECT_DOMAIN,
  GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
  type GeneralDirectListItem,
} from "@/lib/messenger/general-direct/types";

export type GeneralDirectPresentationInput = Readonly<{
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  peerDisplayName: string | null | undefined;
  peerAvatarUrl: string | null | undefined;
  /** 금지 필드 — 존재하면 fail-closed */
  productTitle?: string | null;
  storeName?: string | null;
  groupName?: string | null;
}>;

export function resolveGeneralDirectDisplayIdentity(
  input: GeneralDirectPresentationInput
): DomainDisplayIdentity {
  assertGeneralDirectOwnedRoom({
    roomId: input.roomId,
    chatDomain: input.chatDomain as "general_direct",
    domainIdentityKey: input.domainIdentityKey,
  });
  if (input.productTitle?.trim() || input.storeName?.trim() || input.groupName?.trim()) {
    throw new Error("dibay_general_direct_foreign_presentation_forbidden");
  }
  const name = input.peerDisplayName?.trim();
  if (!name) {
    console.warn("[general_direct-display-identity]", {
      reason: "missing_peer_display_name",
      roomId: input.roomId,
    });
  }
  return {
    title: name || GENERAL_DIRECT_PEER_PLACEHOLDER_NAME,
    avatarUrl: input.peerAvatarUrl?.trim() || null,
    usedPeerUserFallback: false,
  };
}

export function resolveGeneralDirectDisplayFromListItem(item: GeneralDirectListItem): DomainDisplayIdentity {
  return resolveGeneralDirectDisplayIdentity({
    roomId: item.roomId,
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: item.domainIdentityKey,
    peerDisplayName: item.peerDisplayName,
    peerAvatarUrl: item.peerAvatarUrl,
  });
}
