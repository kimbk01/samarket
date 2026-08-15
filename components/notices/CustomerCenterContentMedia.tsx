"use client";

import { useState } from "react";
import { isCustomerCenterRenderableMediaUrl } from "@/lib/notices/customer-center-media";

type Props = {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  /** detail: natural width; thumb: square cover fill */
  variant?: "detail" | "thumb";
};

/**
 * Customer Center content media — NO product-thumbnail fallback, NO reserved empty box.
 * Invalid / load-failed → render nothing.
 */
export function CustomerCenterContentMedia({
  src,
  alt = "",
  className = "",
  variant = "detail",
}: Props) {
  const [failed, setFailed] = useState(false);
  const url = typeof src === "string" ? src.trim() : "";
  if (failed || !isCustomerCenterRenderableMediaUrl(url)) return null;

  if (variant === "thumb") {
    return (
      <div className={`h-full w-full overflow-hidden ${className}`.trim()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="block h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div className={`w-full max-w-full overflow-hidden ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-auto max-w-full rounded-2xl border border-[rgba(14,92,58,0.12)] object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
