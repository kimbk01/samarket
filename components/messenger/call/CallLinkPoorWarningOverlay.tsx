"use client";

/**
 * V-8 — 웹 통화 화면 「연결 상태가 좋지 않습니다」 경고.
 * 영상 위·컨트롤과 같은 층에 4면 가장자리 빨간 그라데이션 + 상단 문구.
 * `pointer-events:none` — 버튼·PiP 드래그·탭을 막지 않는다(설계 C-UI 3, 네이티브 테두리와 같은 기준).
 */
export function CallLinkPoorWarningOverlay({ text }: { text: string }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{ pointerEvents: "none" }}
      data-testid="call-link-poor-warning"
      aria-live="polite"
      role="status"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          boxShadow:
            "inset 0 0 0 3px color-mix(in srgb, var(--sam-danger) 85%, transparent), inset 0 0 48px 12px color-mix(in srgb, var(--sam-danger) 45%, transparent)",
        }}
      />
      <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+56px)] flex justify-center px-4">
        <span className="rounded-full bg-black/60 px-3 py-1 text-[13px] font-medium text-white">{text}</span>
      </div>
    </div>
  );
}
