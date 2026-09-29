"use client";

import { useEffect, useState } from "react";
import { issueSignedReadApi } from "./introMediaApi";

/**
 * READY preview from temporary signed runtime URL.
 * Never treats source URL as authoritative READY visual.
 */
export function IntroMediaRuntimePreview({
  mediaId,
  status,
  animated,
  alt,
  className = "",
  objectFit = "contain",
}: {
  mediaId: string;
  status: string;
  animated?: boolean;
  alt: string;
  className?: string;
  objectFit?: "contain" | "cover";
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const ready = status === "READY";

  useEffect(() => {
    if (!ready) {
      setUrl(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { status: http, json } = await issueSignedReadApi(mediaId, "runtime");
      if (cancelled) return;
      if (http !== 200 || json.ok !== true || typeof json.signedUrl !== "string") {
        setErr("preview_unavailable");
        setUrl(null);
        return;
      }
      setUrl(json.signedUrl);
      setErr(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaId, ready]);

  if (!ready) {
    return (
      <div
        className={`flex items-center justify-center bg-sam-surface-muted text-sam-muted ${className}`}
        data-intro-media-preview="pending"
      >
        <span className="text-xs">…</span>
      </div>
    );
  }

  if (err || !url) {
    return (
      <div
        className={`flex items-center justify-center bg-sam-surface-muted text-sam-muted ${className}`}
        data-intro-media-preview="error"
      >
        <span className="text-xs">{err ? "미리보기 불가" : "불러오는 중…"}</span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={className}
      style={{ objectFit }}
      data-intro-media-preview="runtime"
      data-intro-media-animated={animated ? "1" : "0"}
      draggable={false}
    />
  );
}
