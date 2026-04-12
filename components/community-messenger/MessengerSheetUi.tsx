"use client";

import type { ReactNode } from "react";

export function MessengerSettingsBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3
        className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--messenger-text-secondary)" }}
      >
        {title}
      </h3>
      <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] shadow-[var(--messenger-shadow-soft)]">
        {children}
      </div>
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
    <label className={`flex cursor-pointer items-start justify-between gap-3 px-3 py-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {description}
          </span>
        ) : null}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-[color:var(--messenger-divider)] accent-[color:var(--messenger-primary)] focus:ring-[color:var(--messenger-primary-soft-2)]"
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
      className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left ${disabled ? "opacity-50" : ""}`}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-[12px] font-medium text-[color:var(--messenger-primary)]">{actionLabel}</span>
    </button>
  );
}
