"use client";

import { useEffect, useRef } from "react";
import type { OsEntryConfig } from "@/lib/os-entry/types";

export type OsEntryScreenProps = {
  config: OsEntryConfig;
  /** Local data URL preferred; falls back to config.imageUrl. */
  imageSrc?: string | null;
  /** Called once after first meaningful paint commit. */
  onVisibleCommit?: () => void;
  /** Preview viewport size; omit for full-screen runtime. */
  previewWidth?: number;
  previewHeight?: number;
  className?: string;
};

/**
 * Shared STATIC renderer — Admin Preview and Capacitor runtime must use this.
 * No animation / transition / GIF / video.
 */
export function OsEntryScreen({
  config,
  imageSrc,
  onVisibleCommit,
  previewWidth,
  previewHeight,
  className,
}: OsEntryScreenProps) {
  const src = imageSrc ?? config.imageUrl;
  const isPreview = previewWidth != null && previewHeight != null;
  const committedRef = useRef(false);
  const onCommitRef = useRef(onVisibleCommit);
  onCommitRef.current = onVisibleCommit;

  const markCommitted = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommitRef.current?.();
  };

  useEffect(() => {
    if (src) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) markCommitted();
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- commit once per mount
  }, [src]);

  return (
    <div
      className={className}
      data-os-entry-screen="1"
      data-os-entry-revision={config.revision}
      style={{
        position: isPreview ? "relative" : "fixed",
        inset: isPreview ? undefined : 0,
        width: isPreview ? previewWidth : "100%",
        height: isPreview ? previewHeight : "100%",
        backgroundColor: config.backgroundColor,
        overflow: "hidden",
        zIndex: isPreview ? undefined : 2147483000,
        pointerEvents: "none",
      }}
    >
      {src ? (
        // Product OS Start — static mark. Not next/image (local data URL + cold path).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          data-os-entry-image="1"
          onLoad={markCommitted}
          onError={markCommitted}
          style={{
            position: "absolute",
            left: `${config.imageX * 100}%`,
            top: `${config.imageY * 100}%`,
            width: `${config.imageWidth * 100}%`,
            height: `${config.imageHeight * 100}%`,
            transform: "translate(-50%, -50%)",
            objectFit: "contain",
            objectPosition: "center",
            display: "block",
            userSelect: "none",
          }}
        />
      ) : null}

      {config.text.trim().length > 0 ? (
        <div
          data-os-entry-text="1"
          style={{
            position: "absolute",
            left: `${config.textX * 100}%`,
            top: `${config.textY * 100}%`,
            width: `${config.textWidth * 100}%`,
            transform: "translate(-50%, -50%)",
            color: "#FFFFFF",
            fontSize: `calc(${config.textSize} * 100vmin)`,
            lineHeight: 1.25,
            textAlign: config.textAlign,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            userSelect: "none",
          }}
        >
          {config.text}
        </div>
      ) : null}
    </div>
  );
}
