"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import {
  destinationHref,
  parseDestinationHref,
  type DestinationRef,
} from "@/lib/destination/destination-contract";
import { openDestination } from "@/lib/destination/open-destination";

export type DestinationLinkProps = {
  /** Structured ref or a stored href (parsed with `parseDestinationHref`). */
  destination: DestinationRef | string | null | undefined;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  prefetch?: boolean;
  tabIndex?: number;
  "aria-label"?: string;
  /** Runs before navigation (analytics / click reporting). */
  onNavigate?: (ref: DestinationRef) => void;
  /** Rendered when the destination is empty or invalid (default: children in a div). */
  fallback?: ReactNode;
  [dataAttr: `data-${string}`]: string | undefined;
};

export function resolveDestinationLinkRef(
  destination: DestinationLinkProps["destination"]
): DestinationRef | null {
  if (!destination) return null;
  if (typeof destination === "string") {
    const parsed = parseDestinationHref(destination);
    return parsed.ok ? parsed.ref : null;
  }
  return destination;
}

/**
 * Scope B — one anchor for CTA / banner taps. Opens through `openDestination` (EVT-04):
 * internal / event → app router, external → in-app browser (never the app WebView).
 */
export function DestinationLink({
  destination,
  className,
  style,
  children,
  prefetch = false,
  tabIndex,
  "aria-label": ariaLabel,
  onNavigate,
  fallback,
  ...dataAttrs
}: DestinationLinkProps) {
  const router = useRouter();
  const ref = resolveDestinationLinkRef(destination);
  if (!ref) {
    return fallback !== undefined ? (
      <>{fallback}</>
    ) : (
      <div className={className} style={style} {...dataAttrs}>
        {children}
      </div>
    );
  }

  const href = destinationHref(ref);
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate?.(ref);
    openDestination(ref, router);
  };

  if (ref.kind === "external_url") {
    return (
      <a
        href={href}
        rel="noopener noreferrer"
        className={className}
        style={style}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        onClick={onClick}
        data-destination-kind={ref.kind}
        {...dataAttrs}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      prefetch={prefetch}
      className={className}
      style={style}
      tabIndex={tabIndex}
      aria-label={ariaLabel}
      onClick={onClick}
      data-destination-kind={ref.kind}
      {...dataAttrs}
    >
      {children}
    </Link>
  );
}
