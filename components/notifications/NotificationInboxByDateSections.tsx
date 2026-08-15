"use client";

import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { groupInboxItemsByDateSection } from "@/lib/notifications/group-inbox-by-date-section";
import type { InboxGroupItem } from "@/lib/notifications/group-inbox-by-thread";
import { InboxGroupCardList } from "@/components/notifications/InboxGroupCardList";

type CardListProps = Omit<ComponentProps<typeof InboxGroupCardList>, "items">;

type Props = CardListProps & {
  items: InboxGroupItem[];
};

/**
 * Date sections (오늘·어제·이전) with mockup-aligned flat row list.
 */
export function NotificationInboxByDateSections({ items, ...cardProps }: Props) {
  const { language } = useI18n();
  const sections = useMemo(() => groupInboxItemsByDateSection(items, language), [items, language]);

  if (items.length === 0) {
    return <InboxGroupCardList items={[]} {...cardProps} />;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-sam-border/55 bg-sam-surface">
      {sections.map((sec, sectionIndex) => (
        <section key={sec.sectionKey} aria-label={sec.sectionLabel} className="min-w-0">
          {sections.length > 1 ? (
            <h3
              className={`px-3 text-[11px] font-semibold uppercase tracking-wide text-sam-meta ${
                sectionIndex === 0 ? "pt-2.5 pb-1" : "border-t border-sam-border/45 pt-3 pb-1"
              }`}
            >
              {sec.sectionLabel}
            </h3>
          ) : null}
          <InboxGroupCardList {...cardProps} items={sec.items} emptyLabel="" />
        </section>
      ))}
    </div>
  );
}
