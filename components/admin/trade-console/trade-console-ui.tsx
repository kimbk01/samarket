"use client";

import Link from "next/link";
import { Sam } from "@/lib/ui/sam-component-classes";

/** Product Trade Admin console chrome — shared visual primitives (not a second nav authority). */

export type ListingStatusTone = "active" | "sold" | "hidden" | "deleted" | "reserved" | "blinded";

const STATUS_LABEL: Record<ListingStatusTone, string> = {
  active: "판매중",
  sold: "판매완료",
  hidden: "숨김",
  deleted: "삭제",
  reserved: "예약중",
  blinded: "블라인드",
};

const STATUS_CLASS: Record<ListingStatusTone, string> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  sold: "bg-sky-50 text-sky-800 border-sky-200",
  hidden: "bg-sam-surface-muted text-sam-muted border-sam-border",
  deleted: "bg-red-50 text-red-700 border-red-200",
  reserved: "bg-amber-50 text-amber-900 border-amber-200",
  blinded: "bg-sam-surface-muted text-sam-muted border-sam-border",
};

export function TradeStatusBadge({ status }: { status: string }) {
  const tone = (STATUS_LABEL[status as ListingStatusTone] ? status : "active") as ListingStatusTone;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 sam-text-xxs font-medium ${STATUS_CLASS[tone]}`}
    >
      {STATUS_LABEL[tone] ?? status}
    </span>
  );
}

export function TradePromoBadge({ active }: { active: boolean }) {
  if (!active) return <span className="sam-text-xxs text-sam-muted">—</span>;
  return (
    <span className="inline-flex items-center rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 sam-text-xxs font-medium text-violet-800">
      홍보중
    </span>
  );
}

export function DisconnectedValue({ label }: { label?: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="font-semibold tabular-nums text-sam-muted">—</span>
      <span className="sam-text-xxs text-sam-muted">{label ?? "집계 미연결"}</span>
    </span>
  );
}

export function KpiGrid({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: number | null; disconnected?: boolean }>;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      {items.map((k) => (
        <div
          key={k.label}
          className="rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2"
        >
          <p className="sam-text-xxs text-sam-muted">{k.label}</p>
          {k.disconnected ? (
            <DisconnectedValue />
          ) : k.value == null ? (
            <p className="sam-text-section-title font-semibold tabular-nums text-sam-muted">…</p>
          ) : (
            <p className="sam-text-section-title font-semibold tabular-nums text-sam-fg">{k.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function OpsPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; count: number | null; href: string; disconnected?: boolean }>;
}) {
  return (
    <section className="rounded-ui-rect border border-sam-border bg-sam-surface">
      <div className="border-b border-sam-border px-3 py-2">
        <h2 className="sam-text-body font-semibold text-sam-fg">{title}</h2>
      </div>
      <ul className="divide-y divide-sam-border-soft">
        {rows.map((row) => (
          <li key={row.label}>
            <Link
              href={row.href}
              prefetch={false}
              className="flex items-center justify-between px-3 py-2.5 hover:bg-sam-surface-muted/80"
            >
              <span className="sam-text-body-secondary text-sam-fg">{row.label}</span>
              {row.disconnected ? (
                <DisconnectedValue />
              ) : row.count == null ? (
                <span className="sam-text-body-secondary text-signature">↗</span>
              ) : (
                <span className="min-w-[2rem] text-right font-semibold tabular-nums text-sam-fg">
                  {row.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
        {description ? (
          <p className="mt-1 sam-text-body-secondary text-sam-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ConsoleButton({
  children,
  variant = "secondary",
  size = "sm",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  const base =
    variant === "primary"
      ? Sam.btn.primaryCombo
      : variant === "danger"
        ? Sam.btn.dangerCombo
        : variant === "ghost"
          ? Sam.btn.ghostCombo
          : Sam.btn.secondaryCombo;
  const sz = size === "sm" ? Sam.btn.sm : "";
  return (
    <button type="button" className={`${base} ${sz} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function TabStrip({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: string; label: string; count?: number | null; disconnected?: boolean }>;
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-sam-border pb-2">
      {tabs.map((tab) => {
        const on = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={[
              "rounded-ui-rect px-3 py-1.5 sam-text-body-secondary transition",
              on ? "bg-signature/15 font-medium text-signature" : "text-sam-muted hover:bg-sam-surface-muted",
            ].join(" ")}
          >
            {tab.label}
            {tab.disconnected || tab.count == null ? (
              <span className="ml-1 tabular-nums text-sam-muted">—</span>
            ) : (
              <span className="ml-1 tabular-nums">{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
