export { CHAT_THREAD_STICK_THRESHOLD_PX, CHAT_THREAD_ENTRY_SCROLL_MAX_ATTEMPTS } from "@/lib/chat-thread-scroll/constants";
export {
  chatThreadDistanceFromBottom,
  isChatThreadNearBottomFromMetrics,
  readChatThreadNearBottom,
} from "@/lib/chat-thread-scroll/near-bottom";
export { restoreChatThreadPrependAnchor } from "@/lib/chat-thread-scroll/prepend-anchor";
export {
  ChatThreadScrollEngine,
  createChatThreadScrollEngine,
  type ChatThreadScrollEngineState,
  type NotifyEntryInput,
  type NotifyPrependCompleteInput,
} from "@/lib/chat-thread-scroll/engine";
export { useChatThreadScroll, type ChatThreadScrollController, type UseChatThreadScrollOptions } from "@/lib/chat-thread-scroll/use-chat-thread-scroll";
export type {
  ChatThreadScrollPhase,
  ChatThreadVirtualizer,
  ChatThreadScrollRestoreSnapshot,
  ChatThreadScrollEngineConfig,
  ChatThreadScrollViewportContext,
  ChatThreadPrependAnchorInput,
  ChatThreadPrependAnchorResult,
} from "@/lib/chat-thread-scroll/types";
