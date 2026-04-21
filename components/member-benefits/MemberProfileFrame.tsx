"use client";

import type { MemberType } from "@/lib/types/admin-user";
import { getMemberVisualConfig } from "@/lib/member-benefits/mock-member-visual-config";

interface MemberProfileFrameProps {
  memberType: MemberType;
  children: React.ReactNode;
  className?: string;
  /** compact = 작은 뱃지만, full = 액자+뱃지 */
  variant?: "compact" | "full";
}

const FRAME_CLASS: Record<string, string> = {
  dark: "border-sam-border",
  gold: "border-amber-400 border-2",
  admin_special: "border-indigo-400 border-2",
};

export function MemberProfileFrame({
  memberType,
  children,
  className = "",
  variant = "full",
}: MemberProfileFrameProps) {
  const config = getMemberVisualConfig(memberType);
  const showBadge = config.badgeLabel && (variant === "compact" || variant === "full");
  const frameClass = variant === "full" ? FRAME_CLASS[config.frameType] ?? "" : "";

  return (
    <div
      className={`${frameClass} ${className}`.trim()}
      style={variant === "full" && config.frameType === "gold" ? { boxShadow: "0 0 0 1px rgba(251,191,36,0.3)" } : undefined}
    >
      {children}
      {showBadge && (
        <span
          className={`mt-1 inline-block rounded px-1.5 py-0.5 sam-text-xxs font-medium ${
            config.memberType === "premium"
              ? "bg-amber-100 text-amber-800"
              : config.memberType === "admin"
                ? "bg-indigo-100 text-indigo-800"
                : "bg-sam-surface-muted text-sam-fg"
          }`}
        >
          {config.badgeLabel}
        </span>
      )}
    </div>
  );
}
