/**
 * 비-CM 채팅 스레드(그룹 채팅 등) 진입 시 최신 말풍선이 보이도록 scrollTop 을 tail 로 맞춘다.
 */
export function runChatThreadEntryScrollToBottom(viewport: HTMLElement | null): void {
  if (!viewport) return;

  const run = () => {
    viewport.scrollTop = viewport.scrollHeight;
  };

  run();
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}
