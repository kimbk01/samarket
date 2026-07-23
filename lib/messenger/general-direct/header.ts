/**
 * general_direct HeaderPort — 일반 1:1 Surface 만.
 */
import type { DomainHeaderKind } from "@/lib/messenger/contracts/ports";
import { assertGeneralDirectOwnedRoom } from "@/lib/messenger/general-direct/identity";
import { resolveGeneralDirectDisplayIdentity } from "@/lib/messenger/general-direct/presentation";
import {
  GENERAL_DIRECT_DOMAIN,
  type GeneralDirectHeaderModel,
  type GeneralDirectListItem,
} from "@/lib/messenger/general-direct/types";

export function resolveGeneralDirectHeaderKind(input: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
}): DomainHeaderKind {
  if (input.chatDomain !== GENERAL_DIRECT_DOMAIN) {
    throw new Error(`dibay_general_direct_header_rejects:${input.chatDomain}`);
  }
  assertGeneralDirectOwnedRoom({
    roomId: input.roomId,
    chatDomain: GENERAL_DIRECT_DOMAIN,
    domainIdentityKey: input.domainIdentityKey,
  });
  return "general_peer";
}

export function buildGeneralDirectHeaderModel(item: GeneralDirectListItem): GeneralDirectHeaderModel {
  resolveGeneralDirectHeaderKind(item);
  const identity = resolveGeneralDirectDisplayIdentity({
    roomId: item.roomId,
    chatDomain: item.chatDomain,
    domainIdentityKey: item.domainIdentityKey,
    peerDisplayName: item.peerDisplayName,
    peerAvatarUrl: item.peerAvatarUrl,
  });
  return {
    kind: "general_peer",
    title: identity.title,
    avatarUrl: identity.avatarUrl,
    surface: "general_direct_1to1",
  };
}
