"use client";

import { useRouter } from "next/navigation";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { openDestination } from "@/lib/destination/open-destination";
import { formatPlatformEventPeriod } from "@/lib/platform-events/board";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { resolvePlatformEventFinalCtaHref } from "@/lib/platform-events/destination";
import type { PlatformEventRow, PlatformEventSection } from "@/lib/platform-events/types";

export type PlatformEventDetailViewModel = {
  event: PlatformEventRow;
  /** When false, omit primary CTA (unavailable / preview-only). */
  showPrimaryCta?: boolean;
  /** EVT-02 — ended events keep their body; band on top and every CTA disabled (gray). */
  ended?: boolean;
};

const CTA_ENABLED_CLASS =
  "flex min-h-12 w-full items-center justify-center rounded-ui-rect bg-[var(--sam-brand,#085c3f)] px-4 font-semibold text-white";
const CTA_DISABLED_CLASS =
  "flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-ui-rect bg-sam-surface-muted px-4 font-semibold text-sam-muted";

/** Every Event CTA opens through the shared destination contract (internal → router, external → in-app browser). */
function EventCtaButton({
  href,
  label,
  disabled,
  sizeClass,
  primary,
}: {
  href: string;
  label: string;
  disabled: boolean;
  sizeClass: string;
  primary?: boolean;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      className={`${disabled ? CTA_DISABLED_CLASS : CTA_ENABLED_CLASS} ${sizeClass}`}
      data-platform-event-primary-cta={primary ? "1" : undefined}
      data-platform-event-cta-disabled={disabled ? "1" : undefined}
      onClick={() => {
        if (disabled) return;
        openDestination(href, router);
      }}
    >
      {label}
    </button>
  );
}

function SectionBlock({ section, ctaDisabled }: { section: PlatformEventSection; ctaDisabled: boolean }) {
  if (section.type === "text") {
    return (
      <section className="space-y-2">
        {section.title ? (
          <h2 className="text-[17px] font-semibold text-sam-fg">{section.title}</h2>
        ) : null}
        <CustomerCenterSafeMarkdownBody body={section.body} />
      </section>
    );
  }
  if (section.type === "image") {
    const src = String(section.imageUrl ?? "").trim();
    if (!/^https?:\/\//i.test(src)) return null;
    return (
      <figure className="overflow-hidden rounded-ui-rect">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={section.alt || ""}
          className="h-auto w-full object-cover"
        />
      </figure>
    );
  }
  if (section.type === "benefit") {
    return (
      <section className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3">
        <h3 className="text-[15px] font-semibold text-sam-fg">{section.title}</h3>
        {section.body ? (
          <p className="mt-1 text-[14px] leading-relaxed text-sam-muted">{section.body}</p>
        ) : null}
      </section>
    );
  }
  if (section.type === "cta") {
    const href = resolvePlatformEventFinalCtaHref({
      ctaType: section.ctaType,
      ctaTarget: section.ctaTarget,
      externalUrl: section.externalUrl,
    });
    if (!href.ok) return null;
    return (
      <EventCtaButton
        href={href.href}
        label={section.label}
        disabled={ctaDisabled}
        sizeClass="text-[15px]"
      />
    );
  }
  if (section.type === "terms") {
    return (
      <section className="space-y-1">
        <h3 className="text-[13px] font-semibold text-sam-muted">Terms</h3>
        <div className="text-[12px] leading-relaxed text-sam-muted">
          <CustomerCenterSafeMarkdownBody body={section.body} />
        </div>
      </section>
    );
  }
  return null;
}

/**
 * Canonical Event Detail content renderer — shared by App + Admin preview.
 */
export function PlatformEventDetailContent({
  event,
  showPrimaryCta = true,
  ended = false,
  language = "ko",
}: PlatformEventDetailViewModel & { language?: "ko" | "en" }) {
  const period = formatPlatformEventPeriod(event.startsAt, event.endsAt, language);
  const primary =
    showPrimaryCta && event.ctaLabel && event.ctaType
      ? resolvePlatformEventFinalCtaHref({
          ctaType: event.ctaType,
          ctaTarget: event.ctaTarget,
          externalUrl: event.ctaExternalUrl,
        })
      : null;

  return (
    <article
      className="mx-auto w-full max-w-[720px] space-y-5 px-4 pb-10 pt-2"
      data-platform-event-detail="1"
      data-event-id={event.id}
      data-platform-event-ended={ended ? "1" : undefined}
    >
      {ended ? (
        <div
          role="status"
          className="rounded-ui-rect border border-sam-border bg-sam-surface-muted px-4 py-3 text-center text-[14px] font-semibold text-sam-muted"
          data-platform-event-ended-band="1"
        >
          {safeTranslate(language, "platform_event_detail_ended_band", { fallbackKo: "종료된 이벤트입니다", fallbackEn: "This event has ended." })}
        </div>
      ) : null}
      {event.heroImageUrl && /^https?:\/\//i.test(event.heroImageUrl) ? (
        <div className="overflow-hidden rounded-ui-rect bg-sam-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={event.heroImageUrl}
            alt=""
            className="h-auto w-full object-cover"
            data-platform-event-hero="1"
          />
        </div>
      ) : null}

      <header className="space-y-1">
        <h1 className="text-[22px] font-bold leading-snug text-sam-fg">{event.title}</h1>
        {event.subtitle ? (
          <p className="text-[15px] text-sam-muted">{event.subtitle}</p>
        ) : null}
        {period ? <p className="text-[13px] text-sam-muted">{period}</p> : null}
      </header>

      {event.sections.map((section, i) => (
        <SectionBlock key={`${section.type}-${i}`} section={section} ctaDisabled={ended} />
      ))}

      {primary && primary.ok && event.ctaLabel ? (
        <EventCtaButton
          href={primary.href}
          label={event.ctaLabel}
          disabled={ended}
          sizeClass="text-[16px]"
          primary
        />
      ) : null}

      {event.terms ? (
        <section className="border-t border-sam-border pt-4 text-[12px] text-sam-muted">
          <CustomerCenterSafeMarkdownBody body={event.terms} />
        </section>
      ) : null}
    </article>
  );
}
