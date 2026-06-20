import type {
  ChatThreadPrependAnchorInput,
  ChatThreadPrependAnchorResult,
} from "@/lib/chat-thread-scroll/types";

/**
 * 과거 메시지 prepend 후 scrollTop·virtualizer offset 동시 보정.
 */
export function restoreChatThreadPrependAnchor(
  input: ChatThreadPrependAnchorInput
): ChatThreadPrependAnchorResult {
  const { viewport, virtualizer, prevScrollTop, prevScrollHeight, estimatedPrependPx = 0 } = input;
  const nativeHeightDelta = Math.max(0, viewport.scrollHeight - prevScrollHeight);
  const heightDelta = Math.max(nativeHeightDelta, estimatedPrependPx);
  const targetScrollTop = prevScrollTop + heightDelta;

  if (virtualizer?.scrollToOffset) {
    try {
      const prevVirtualOffset = virtualizer.scrollOffset ?? prevScrollTop;
      virtualizer.scrollToOffset(prevVirtualOffset + heightDelta, { align: "start" });
    } catch {
      /* virtualizer not ready */
    }
  }

  viewport.scrollTop = targetScrollTop;

  return {
    heightDelta,
    anchorErrorPx: Math.round(Math.abs(viewport.scrollTop - targetScrollTop)),
    targetScrollTop,
  };
}
