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
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--cm-room-page-bg)] text-[color:var(--cm-room-text)]"
      style={{
        height: "var(--chat-viewport-height, 100dvh)",
        maxHeight: "var(--chat-viewport-height, 100dvh)",
        minHeight: 0,
      }}
    >
      <header className="shrink-0 border-b border-[color:var(--cm-room-divider)] bg-[color:var(--cm-room-header-bg)] px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]" />
          <div className="min-h-0 min-w-0 flex-1 space-y-2">
            <div className="h-4 w-32 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]" />
            <div className="h-3 w-20 rounded-[6px] bg-[color:var(--cm-room-primary-soft)]/80" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
            <div className="h-9 w-9 rounded-full bg-[color:var(--cm-room-primary-soft)]/70" />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 bg-[color:var(--cm-room-chat-bg)]" data-cm-room-viewport-placeholder />

      <footer
        data-cm-composer=""
        data-cm-line-composer-footer=""
        className="sticky bottom-0 z-[5] shrink-0 border-t border-[#e5e7eb] bg-white px-3 pt-2"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
          <div className="h-[38px] min-h-[38px] flex-1 rounded-full bg-[color:var(--cm-room-primary-soft)]/50" />
          <div className="h-9 w-9 shrink-0 rounded-full bg-[color:var(--cm-room-primary-soft)]/60" />
        </div>
      </footer>
    </div>
  );
}
