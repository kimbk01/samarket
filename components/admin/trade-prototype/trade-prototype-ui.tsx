"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sam } from "@/lib/ui/sam-component-classes";
import { TRADE_PROTOTYPE_BASE, TRADE_PROTOTYPE_SUBNAV } from "./trade-prototype-nav";

function subnavActive(pathname: string, href: string): boolean {
  if (href === TRADE_PROTOTYPE_BASE) return pathname === href;
  if (!href.startsWith(TRADE_PROTOTYPE_BASE)) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TradePrototypeShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-admin>
      <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 sam-text-body-secondary text-amber-900">
        <strong>UI PROTOTYPE</strong> — 거래 Admin 재설계 mock. 데이터·API 미연결. Owner 검토 후 제품 반영.
      </div>
      <nav
        className="flex min-w-0 shrink-0 flex-wrap items-center gap-1 border-b border-sam-border bg-sam-surface px-3 py-1.5"
        aria-label="거래 prototype 화면"
      >
        {TRADE_PROTOTYPE_SUBNAV.map((item) => {
          const active = subnavActive(pathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              prefetch={false}
              className={[
                "rounded-ui-rect px-2 py-1 sam-text-xxs whitespace-nowrap",
                active
                  ? "bg-signature/15 font-medium text-signature"
                  : "text-sam-muted hover:bg-sam-surface-muted hover:text-sam-fg",
              ].join(" ")}
            >
              {item.label}
              {item.external ? <span className="ml-0.5 opacity-60">↗</span> : null}
            </Link>
          );
        })}
      </nav>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-sam-app p-4 lg:p-5">{children}</main>
    </div>
  );
}

export type ListingStatus = "active" | "sold" | "hidden" | "deleted";

const STATUS_LABEL: Record<ListingStatus, string> = {
  active: "판매중",
  sold: "판매완료",
  hidden: "숨김",
  deleted: "삭제",
};

const STATUS_CLASS: Record<ListingStatus, string> = {
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  sold: "bg-sky-50 text-sky-800 border-sky-200",
  hidden: "bg-sam-surface-muted text-sam-muted border-sam-border",
  deleted: "bg-red-50 text-red-700 border-red-200",
};

export function TradeStatusBadge({ status }: { status: ListingStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 sam-text-xxs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
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
          {k.disconnected || k.value == null ? (
            <DisconnectedValue />
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
              {row.disconnected || row.count == null ? (
                <DisconnectedValue />
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

export function ProtoButton({
  children,
  variant = "secondary",
  size = "sm",
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
    <button type="button" className={`${base} ${sz}`} {...rest}>
      {children}
    </button>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-sam-border bg-sam-surface px-2 py-0.5 sam-text-xxs text-sam-fg">
      {label}
      {onRemove ? (
        <button type="button" className="text-sam-muted hover:text-sam-fg" aria-label={`${label} 제거`}>
          ×
        </button>
      ) : null}
    </span>
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

export function RowMenuMock() {
  return (
    <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-ui-rect border border-sam-border bg-sam-surface py-1">
      {["상세 보기", "게시물 보기", "수정", "숨기기", "노출하기", "운영 삭제"].map((label) => (
        <button
          key={label}
          type="button"
          className="block w-full px-3 py-1.5 text-left sam-text-body-secondary hover:bg-sam-surface-muted"
        >
          {label}
        </button>
      ))}
      <div className="my-1 border-t border-red-200" />
      <button
        type="button"
        disabled
        className="block w-full px-3 py-1.5 text-left sam-text-body-secondary text-red-700/50"
      >
        DB 영구 삭제 · NOT_READY
      </button>
    </div>
  );
}
