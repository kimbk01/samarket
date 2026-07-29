"use client";

/**
 * Telegram tablet empty right: doodle wallpaper only — no CTA pill/text (recheck 2026-07-30b).
 */
export function CommunityMessengerHomeDetailEmpty() {
  return (
    <div
      className="cm-messenger-wallpaper flex flex-1"
      data-messenger-detail-empty=""
      aria-hidden
    />
  );
}
