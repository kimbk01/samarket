/**
 * Messenger + attachment action SSOT.
 * UI frame is shared DIRECT/GROUP/TRADE/ORDER; visibility is domain-capability only.
 *
 * ATTACHMENT MENU CAPABILITY ≠ CALL FEATURE CAPABILITY.
 * Header/menu call CTAs stay elsewhere — this resolver never emits call/map.
 */

export type MessengerAttachmentActionId = "photo" | "gift";

export type MessengerAttachmentCapabilityInput = {
  isGroupRoom: boolean;
  roomChatDomain: string;
  peerUserId: string;
  giftVisible: boolean;
  /** Ignored — call is not an attachment-menu action. Kept for call-site compatibility. */
  callVisible?: boolean;
};

export type MessengerAttachmentCapabilities = {
  photo: true;
  gift: boolean;
  /** Attachment menu never owns call. */
  call: false;
  /** Always false until a messenger remittance owner exists. */
  money: false;
  /** Attachment menu never owns map/location. */
  map: false;
  actions: MessengerAttachmentActionId[];
};

export function resolveMessengerAttachmentCapabilities(
  input: MessengerAttachmentCapabilityInput
): MessengerAttachmentCapabilities {
  const gift = Boolean(input.giftVisible);
  const actions: MessengerAttachmentActionId[] = ["photo"];
  if (gift) actions.push("gift");
  return {
    photo: true,
    gift,
    call: false,
    money: false,
    map: false,
    actions,
  };
}
