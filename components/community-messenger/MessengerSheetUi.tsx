"use client";

import type { ReactNode } from "react";

export function MessengerSettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ui-muted">{title}</h3>
      <div className="divide-y divide-ui-border rounded-ui-rect border border-ui-border bg-ui-surface">{children}</div>
    </section>
  );
}

export function SettingsToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ui-fg">{title}</span>
        {description ? <span className="mt-0.5 block text-[12px] leading-snug text-ui-muted">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-ui-border text-ui-fg focus:ring-ui-border"
      />
    </label>
  );
}

export function SettingsActionRow({
  title,
  description,
  actionLabel,
  disabled,
  onClick,
}: {
  title: string;
  description?: string;
  actionLabel: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left ${disabled ? "opacity-50" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-ui-fg">{title}</span>
        {description ? <span className="mt-0.5 block text-[12px] leading-snug text-ui-muted">{description}</span> : null}
      </span>
      <span className="shrink-0 text-[12px] font-medium text-ui-muted">{actionLabel}</span>
    </button>
  );
}

export function MiniMetricCard({
  label,
  value,
  helper,
  compact = false,
}: {
  label: string;
  value: string;
  helper: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-ui-rect border border-ui-border bg-ui-surface ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}>
      <p className="text-[11px] font-medium text-ui-muted">{label}</p>
      <p className="mt-1 text-[16px] font-semibold text-ui-fg">{value}</p>
      <p className="mt-1 text-[11px] text-ui-muted">{helper}</p>
    </div>
  );
}
