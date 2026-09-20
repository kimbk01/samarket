"use client";

import Link from "next/link";
import { CustomerCenterSafeMarkdownBody } from "@/components/notices/CustomerCenterSafeMarkdownBody";
import { resolvePlatformEventFinalCtaHref } from "@/lib/platform-events/destination";
import type { PlatformEventRow, PlatformEventSection } from "@/lib/platform-events/types";

export type PlatformEventDetailViewModel = {
  event: PlatformEventRow;
  /** When false, omit primary CTA (unavailable / preview-only). */
  showPrimaryCta?: boolean;
};

function formatPeriod(startsAt: string | null, endsAt: string | null, language: "ko" | "en"): string {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleDateString(language === "en" ? "en-PH" : "ko-KR", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };
  const a = startsAt ? fmt(startsAt) : "";
  const b = endsAt ? fmt(endsAt) : "";
  if (a && b) return `${a} – ${b}`;
  if (a) return language === "en" ? `From ${a}` : `${a}부터`;
  if (b) return language === "en" ? `Until ${b}` : `${b}까지`;
  return "";
}

function SectionBlock({ section }: { section: PlatformEventSection }) {
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
      <Link
        href={href.href}
        className="flex min-h-12 items-center justify-center rounded-ui-rect bg-[var(--sam-brand,#085c3f)] px-4 text-[15px] font-semibold text-white"
      >
        {section.label}
      </Link>
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
  language = "ko",
}: PlatformEventDetailViewModel & { language?: "ko" | "en" }) {
  const period = formatPeriod(event.startsAt, event.endsAt, language);
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
    >
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
        <SectionBlock key={`${section.type}-${i}`} section={section} />
      ))}

      {primary && primary.ok ? (
        <Link
          href={primary.href}
          className="flex min-h-12 items-center justify-center rounded-ui-rect bg-[var(--sam-brand,#085c3f)] px-4 text-[16px] font-semibold text-white"
          data-platform-event-primary-cta="1"
        >
          {event.ctaLabel}
        </Link>
      ) : null}

      {event.terms ? (
        <section className="border-t border-sam-border pt-4 text-[12px] text-sam-muted">
          <CustomerCenterSafeMarkdownBody body={event.terms} />
        </section>
      ) : null}
    </article>
  );
}
