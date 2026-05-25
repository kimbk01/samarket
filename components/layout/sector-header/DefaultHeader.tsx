"use client";

import type { ReactNode } from "react";
import { SectorHeaderBar } from "./SectorHeaderBar";
import { SectorHeaderBackButton } from "./SectorHeaderBackButton";
import { SectorHeaderShell } from "./SectorHeaderShell";
import { SectorHeaderTitle, SectorHeaderTitleCluster } from "./SectorHeaderTitle";

export function DefaultHeader({
  title,
  subtitle,
  subtitleHref,
  backHref,
  onBack,
  preferHistoryBack,
  interceptBack,
  showBack = true,
  rightSlot,
  embedded = false,
  flat = false,
  className = "",
}: {
  title: ReactNode;
  subtitle?: string;
  subtitleHref?: string;
  backHref?: string;
  onBack?: () => void;
  preferHistoryBack?: boolean;
  interceptBack?: () => boolean;
  showBack?: boolean;
  rightSlot?: ReactNode;
  embedded?: boolean;
  flat?: boolean;
  className?: string;
}) {
  const withSubtitle = Boolean(subtitle?.trim());
  return (
    <SectorHeaderShell embedded={embedded} flat={flat} className={className}>
      <SectorHeaderBar
        withSubtitle={withSubtitle}
        left={
          showBack ? (
            <SectorHeaderBackButton
              backHref={backHref}
              onBack={onBack}
              preferHistoryBack={preferHistoryBack}
              interceptBack={interceptBack}
            />
          ) : undefined
        }
        center={
          withSubtitle ? (
            <SectorHeaderTitleCluster title={title} subtitle={subtitle} subtitleHref={subtitleHref} />
          ) : (
            <SectorHeaderTitle>{title}</SectorHeaderTitle>
          )
        }
        right={rightSlot}
      />
    </SectorHeaderShell>
  );
}

export function SectionHeader({
  title,
  subtitle,
  subtitleHref,
  titleAlign = "left",
  leftSlot,
  rightSlot,
  embedded = false,
  flat = false,
  className = "",
}: {
  title: ReactNode;
  subtitle?: string;
  subtitleHref?: string;
  titleAlign?: "center" | "left";
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  embedded?: boolean;
  flat?: boolean;
  className?: string;
}) {
  const withSubtitle = Boolean(subtitle?.trim());
  return (
    <SectorHeaderShell embedded={embedded} flat={flat} className={className}>
      <SectorHeaderBar
        withSubtitle={withSubtitle}
        centerAlign={titleAlign}
        left={leftSlot}
        center={
          withSubtitle ? (
            <SectorHeaderTitleCluster
              title={title}
              subtitle={subtitle}
              subtitleHref={subtitleHref}
              align={titleAlign}
            />
          ) : (
            <SectorHeaderTitle align={titleAlign}>{title}</SectorHeaderTitle>
          )
        }
        right={rightSlot}
      />
    </SectorHeaderShell>
  );
}

export function DetailHeader({
  title,
  subtitle,
  subtitleHref,
  backHref,
  onBack,
  preferHistoryBack,
  interceptBack,
  backVariant = "back",
  showBack = true,
  leftSlot,
  rightSlot,
  embedded = false,
  flat = false,
  className = "",
  backAriaLabelKey,
  backAriaLabel,
}: {
  title: ReactNode;
  subtitle?: string;
  subtitleHref?: string;
  backHref?: string;
  onBack?: () => void;
  preferHistoryBack?: boolean;
  interceptBack?: () => boolean;
  backVariant?: "back" | "close";
  showBack?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  embedded?: boolean;
  flat?: boolean;
  className?: string;
  backAriaLabelKey?: import("@/lib/i18n/messages").MessageKey;
  backAriaLabel?: string;
}) {
  const withSubtitle = Boolean(subtitle?.trim());
  const backNode =
    leftSlot ??
    (showBack ? (
      <SectorHeaderBackButton
        backHref={backHref}
        onBack={onBack}
        preferHistoryBack={preferHistoryBack}
        interceptBack={interceptBack}
        variant={backVariant}
        ariaLabelKey={backAriaLabelKey}
        ariaLabel={backAriaLabel}
      />
    ) : undefined);
  return (
    <SectorHeaderShell embedded={embedded} flat={flat} className={className}>
      <SectorHeaderBar
        withSubtitle={withSubtitle}
        left={backNode}
        center={
          withSubtitle ? (
            <SectorHeaderTitleCluster title={title} subtitle={subtitle} subtitleHref={subtitleHref} />
          ) : (
            <SectorHeaderTitle>{title}</SectorHeaderTitle>
          )
        }
        right={rightSlot}
      />
    </SectorHeaderShell>
  );
}

export function SearchHeader({
  value,
  onChange,
  placeholder,
  backHref,
  onBack,
  preferHistoryBack,
  interceptBack,
  embedded = false,
  className = "",
  inputRef,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  backHref?: string;
  onBack?: () => void;
  preferHistoryBack?: boolean;
  interceptBack?: () => boolean;
  embedded?: boolean;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onSubmit?: () => void;
}) {
  return (
    <SectorHeaderShell embedded={embedded} className={className}>
      <SectorHeaderBar
        left={
          <SectorHeaderBackButton
            backHref={backHref}
            onBack={onBack}
            preferHistoryBack={preferHistoryBack}
            interceptBack={interceptBack}
          />
        }
        center={
          <div className="sector-header-search-field">
            <input
              ref={inputRef}
              type="search"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="sector-header-search-input"
              enterKeyHint="search"
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmit?.();
              }}
            />
          </div>
        }
      />
    </SectorHeaderShell>
  );
}
