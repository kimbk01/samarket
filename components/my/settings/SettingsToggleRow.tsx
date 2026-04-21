"use client";

import Link from "next/link";

interface SettingsToggleRowProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  checked: boolean;
  onToggle?: (e: React.MouseEvent) => void;
}

export function SettingsToggleRow({
  href,
  icon,
  label,
  checked,
  onToggle,
}: SettingsToggleRowProps) {
  const handleClick = (e: React.MouseEvent) => {
    if (onToggle) {
      e.preventDefault();
      onToggle(e);
    }
  };

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="flex items-center gap-3 border-b border-sam-border-soft px-4 py-3 text-left last:border-b-0"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-sam-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 sam-text-body text-sam-fg">{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-signature" : "bg-sam-border-soft"
        }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-sam-surface shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-0.5"
          }`}
        />
      </span>
    </Link>
  );
}
