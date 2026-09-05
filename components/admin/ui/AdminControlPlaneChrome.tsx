/**
 * ARO-OPS-UX-002-B8 — shared Control Plane section / empty / error chrome.
 * Presentation only — does not change B2/B4/B5/B6 read-models.
 */

import type { ReactNode } from "react";
import { AdminConsoleState } from "@/components/admin/console/AdminConsoleState";

export function AdminControlPlaneSection({
  id,
  title,
  children,
  dataAttr,
}: {
  id: string;
  title: string;
  children: ReactNode;
  /** e.g. data-admin-finance-section */
  dataAttr?: string;
}) {
  return (
    <section
      className="space-y-2"
      id={id}
      {...(dataAttr ? ({ [dataAttr]: id } as Record<string, string>) : { "data-admin-cp-section": id })}
    >
      <h2 className="sam-text-body font-semibold text-sam-fg">{title}</h2>
      {children}
    </section>
  );
}

export function AdminControlPlaneEmpty({
  message,
  kind = "empty",
}: {
  message: string;
  kind?: "empty" | "error";
}) {
  if (kind === "error") {
    return <AdminConsoleState kind="error">{message}</AdminConsoleState>;
  }
  return (
    <p
      className="rounded-ui-rect border border-dashed border-sam-border bg-sam-surface px-4 py-6 text-center sam-text-body text-sam-muted"
      data-admin-cp-empty="1"
    >
      {message}
    </p>
  );
}

export function AdminControlPlanePageHeader({
  title,
  description,
  marker,
}: {
  title: string;
  description?: string;
  marker?: string;
}) {
  return (
    <header className="space-y-1" data-admin-cp-header={marker || "1"}>
      <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
      {description ? <p className="sam-text-body text-sam-muted">{description}</p> : null}
    </header>
  );
}
