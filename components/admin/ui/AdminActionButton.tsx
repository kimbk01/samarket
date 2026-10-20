/**
 * ARO-OPS-UX-002-B8 — presentation-only Admin CTA primitive.
 * Semantic hierarchy only; no new mutation owner.
 *
 * 수정 계획 2-2 (CTA 표준): 화면의 모든 버튼은 이 컴포넌트(또는 AdminChipButton·AdminTabs 등 ui 부품)로 그린다.
 * - 변형: primary(화면·Drawer 당 1개) · secondary · ghost(표 행 안, 행당 2개 이하) · danger(되돌릴 수 없는 동작만)
 *   (neutral·quiet 은 기존 호환 — neutral = 외곽선 보조, quiet = 아이콘·닫기 등 약한 동작)
 * - 크기: md = 높이 40 (기본) · sm = 높이 32 (표 행 안·칩 옆)
 * - 문구: `adminCta()` 어휘만 (lib/admin/ui-standard/admin-cta.ts)
 *
 * CUT 3: lock PRIMARY contrast under `[data-admin]` — never bare sam-primary washout
 * (global descendant rules can wash out foreground).
 */

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode,
} from "react";

export type AdminActionVariant =
  | "primary"
  | "secondary"
  | "neutral"
  | "danger"
  | "ghost"
  | "quiet";

const VARIANT_CLASS: Record<AdminActionVariant, string> = {
  primary:
    "bg-[var(--admin-action-primary-bg,#111827)] text-[var(--admin-action-primary-fg,#ffffff)] hover:bg-[var(--admin-action-primary-hover,#0b1220)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-action-primary-bg,#111827)] disabled:bg-[var(--admin-action-primary-disabled-bg,#9ca3af)] disabled:text-[var(--admin-action-primary-disabled-fg,#f9fafb)] disabled:opacity-100",
  secondary:
    "border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] text-[var(--admin-console-fg,#1f2937)] hover:bg-[var(--admin-console-hover,#eef1f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  neutral:
    "border border-[var(--admin-console-border,#d0d7e2)] bg-transparent text-[var(--admin-console-fg,#1f2937)] hover:bg-[var(--admin-console-hover,#eef1f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  danger:
    "border border-sam-danger bg-sam-danger text-white hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sam-danger disabled:opacity-50",
  ghost:
    "bg-transparent text-[var(--admin-console-accent,#1d4ed8)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50",
  quiet:
    "bg-transparent text-[var(--admin-console-muted,#667085)] hover:text-[var(--admin-console-fg,#1f2937)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-console-border,#d0d7e2)] disabled:opacity-50",
};

export type AdminActionSize = "md" | "sm";

const SIZE_CLASS: Record<AdminActionSize, string> = {
  md: "h-10 px-3 text-[14px]",
  sm: "h-8 px-2.5 text-[13px]",
};

function actionClassName(variant: AdminActionVariant, className = "", size: AdminActionSize = "md") {
  return [
    "inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-ui-rect font-semibold leading-5 transition-colors",
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function AdminActionButton({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AdminActionVariant;
  size?: AdminActionSize;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      data-admin-action={variant === "quiet" ? "quiet" : variant}
      className={actionClassName(variant, className, size)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function AdminActionLink({
  href,
  variant = "secondary",
  size = "md",
  className = "",
  children,
  prefetch = false,
  ...rest
}: {
  href: string;
  variant?: AdminActionVariant;
  size?: AdminActionSize;
  className?: string;
  children: ReactNode;
  prefetch?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className" | "children">) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      data-admin-action={variant === "quiet" ? "quiet" : variant}
      className={actionClassName(variant, className, size)}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** File-picker / labeled control that must share Admin CTA contrast SSOT (never Sam.btn). */
export function AdminActionLabel({
  variant = "secondary",
  size = "md",
  className = "",
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & {
  variant?: AdminActionVariant;
  size?: AdminActionSize;
  children: ReactNode;
}) {
  return (
    <label
      data-admin-action={variant === "quiet" ? "quiet" : variant}
      className={actionClassName(variant, `cursor-pointer ${className}`.trim(), size)}
      {...rest}
    >
      {children}
    </label>
  );
}
