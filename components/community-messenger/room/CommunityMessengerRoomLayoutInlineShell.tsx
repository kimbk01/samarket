/**
 * BN14-2 — Server/RSC inline room shell (client chunk 없음).
 * ShellChromeFrame 과 동일 마커·placeholder 구조 — direct cold HTML 선행 paint.
 */
export function CommunityMessengerRoomLayoutInlineShell() {
  return (
    <div
      data-messenger-shell=""
      data-cm-room=""
      data-cm-room-route-entry-shell=""
      data-cm-room-pass1-stable-shell=""
      data-cm-room-layout-inline-shell=""
      className="cm-room-shell flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
    >
      <header className="chat-header shrink-0">
        <div className="chat-header__row">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]" />
            <div className="h-3 w-20 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]/80" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
          </div>
        </div>
      </header>

      <div className="cm-room-timeline min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]" data-cm-room-viewport-placeholder />

      <footer
        data-chat-composer
        data-cm-composer
        data-cm-line-composer-footer
        className="chat-composer"
      >
        <div className="chat-composer__row">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
          <div className="h-[38px] min-h-[38px] flex-1 rounded-full bg-[color:var(--cm-room-primary-soft)]/50" />
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
        </div>
      </footer>
    </div>
  );
}
