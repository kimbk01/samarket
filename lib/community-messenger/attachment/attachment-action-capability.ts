/**
 * Messenger + attachment action SSOT.
 * UI frame is shared DIRECT/GROUP; visibility is domain-capability only.
 */

export type MessengerAttachmentActionId = "photo" | "gift" | "call" | "map";

export type MessengerAttachmentCapabilityInput = {
  isGroupRoom: boolean;
  roomChatDomain: string;
  peerUserId: string;
  giftVisible: boolean;
  callVisible: boolean;
};

export type MessengerAttachmentCapabilities = {
  photo: true;
  gift: boolean;
  call: boolean;
  /** Always false until a messenger remittance owner exists. */
  money: false;
  map: true;
  actions: MessengerAttachmentActionId[];
};

export function resolveMessengerAttachmentCapabilities(
  input: MessengerAttachmentCapabilityInput
): MessengerAttachmentCapabilities {
  const gift = Boolean(input.giftVisible);
  const call = Boolean(input.callVisible);
  const actions: MessengerAttachmentActionId[] = ["photo"];
  if (gift) actions.push("gift");
  if (call) actions.push("call");
  actions.push("map");
  return {
    photo: true,
    gift,
    call,
    money: false,
    map: true,
    actions,
  };
}
