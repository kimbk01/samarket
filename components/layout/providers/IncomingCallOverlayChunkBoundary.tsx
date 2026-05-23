"use client";

import { Component, type ReactNode } from "react";
import {
  isWebpackChunkLoadError,
  scheduleChunkReloadOnce,
} from "@/lib/next/import-with-chunk-retry";

type State = { chunkFailed: boolean };

/**
 * 수신 통화 청크만 격리 — ChunkLoadError 시 전체 앱 Next 오버레이 대신 통화 UI만 비활성.
 */
export class IncomingCallOverlayChunkBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { chunkFailed: false };

  static getDerivedStateFromError(error: unknown): State | null {
    if (!isWebpackChunkLoadError(error)) return null;
    return { chunkFailed: true };
  }

  componentDidCatch(error: unknown): void {
    if (isWebpackChunkLoadError(error)) scheduleChunkReloadOnce();
  }

  render(): ReactNode {
    if (this.state.chunkFailed) return null;
    return this.props.children;
  }
}
