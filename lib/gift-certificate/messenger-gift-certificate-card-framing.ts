/**
 * CUT3 — messenger gift card header framing by timeline role.
 * Authority = existing `isRecipient` only (no URL / name / metadata re-inference).
 */

export type MessengerGiftCertificateCardFraming = {
  role: "sender" | "recipient";
  titleKey: "gift_cert_chat_sent_title" | "gift_cert_chat_received_title";
  bodyKey: "gift_cert_chat_sent_to" | "gift_cert_chat_received_from";
};

export function resolveMessengerGiftCertificateCardFraming(
  isRecipient: boolean
): MessengerGiftCertificateCardFraming {
  if (isRecipient) {
    return {
      role: "recipient",
      titleKey: "gift_cert_chat_received_title",
      bodyKey: "gift_cert_chat_received_from",
    };
  }
  return {
    role: "sender",
    titleKey: "gift_cert_chat_sent_title",
    bodyKey: "gift_cert_chat_sent_to",
  };
}
