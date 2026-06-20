export type ChatThreadScrollPhase = "idle" | "entryPendingLayout" | "settled";

export type ChatThreadVirtualizer = {
  scrollToIndex?: (index: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void;
  scrollToOffset?: (offset: number, options?: { align?: "start" | "center" | "end" | "auto" }) => void;
  scrollOffset?: number;
  getTotalSize?: () => number;
};

export type ChatThreadScrollRestoreSnapshot = {
  stickToBottom: boolean;
  scrollTop: number;
  firstVisibleMessageId?: string | null;
};

export type ChatThreadScrollEngineConfig = {
  stickThresholdPx?: number;
  /** tail row selector for paint-ready gate (CM timeline rows) */
  messageRowSelector?: string;
};

export type ChatThreadScrollViewportContext = {
  viewport: HTMLElement | null;
  virtualizer?: ChatThreadVirtualizer | null;
  messageCount: number;
};

export type ChatThreadPrependAnchorInput = {
  viewport: HTMLElement;
  virtualizer?: ChatThreadVirtualizer | null;
  prevScrollTop: number;
  prevScrollHeight: number;
  estimatedPrependPx?: number;
};

export type ChatThreadPrependAnchorResult = {
  heightDelta: number;
  anchorErrorPx: number;
  targetScrollTop: number;
};
