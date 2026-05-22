"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  STORE_COMMERCE_ACTION_ERROR_CLASS,
  STORE_COMMERCE_ACTION_PLANE_CLASS,
  STORE_COMMERCE_ACTION_SHELL_CLASS,
  STORE_COMMERCE_ACTION_VARIANT_DATA_ATTR,
  storeCommerceActionShellStyle,
  type StoreCommerceActionVariant,
} from "@/lib/stores/store-commerce-bottom-action-bar";

export function StoreCommerceBottomActionShell({
  children,
  variant,
  portal = true,
  inline = false,
  errorMessage,
  dataAttribute,
  className = "",
}: {
  children: ReactNode;
  /** 페이지별 높이·레이아웃 — `store-commerce-action-bar.css` */
  variant: StoreCommerceActionVariant;
  portal?: boolean;
  inline?: boolean;
  errorMessage?: string | null;
  dataAttribute?: string;
  className?: string;
}) {
  const [portalToBody, setPortalToBody] = useState(false);
  useEffect(() => {
    if (portal && !inline) setPortalToBody(true);
  }, [portal, inline]);

  const plane = (
    <div className={`${STORE_COMMERCE_ACTION_PLANE_CLASS} ${className}`.trim()}>
      {errorMessage ? <p className={STORE_COMMERCE_ACTION_ERROR_CLASS}>{errorMessage}</p> : null}
      {children}
    </div>
  );

  if (inline) {
    return (
      <div
        className="store-commerce-action-shell--inline w-full min-w-0"
        {...{ [STORE_COMMERCE_ACTION_VARIANT_DATA_ATTR]: variant }}
        {...(dataAttribute ? ({ [dataAttribute]: "1" } as Record<string, string>) : {})}
      >
        {plane}
      </div>
    );
  }

  const shell = (
    <div
      className={`${STORE_COMMERCE_ACTION_SHELL_CLASS} ${className}`.trim()}
      style={storeCommerceActionShellStyle()}
      {...{ [STORE_COMMERCE_ACTION_VARIANT_DATA_ATTR]: variant }}
      {...(dataAttribute ? ({ [dataAttribute]: "1" } as Record<string, string>) : {})}
    >
      {plane}
    </div>
  );

  return portalToBody && typeof document !== "undefined" ? createPortal(shell, document.body) : shell;
}
