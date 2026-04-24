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
 * 날짜(오늘·어제·이전) 섹션으로 나눠 시각적 구분을 준다.
 */
export function NotificationInboxByDateSections({ items, ...cardProps }: Props) {
  const { language } = useI18n();
  const sections = useMemo(() => groupInboxItemsByDateSection(items, language), [items, language]);

  if (items.length === 0) {
    return <InboxGroupCardList items={[]} {...cardProps} />;
  }

  return (
    <div className="space-y-5">
      {sections.map((sec) => (
        <section key={sec.sectionKey} aria-label={sec.sectionLabel} className="min-w-0">
          <h3 className="mb-2 px-0.5 text-[12px] font-semibold tracking-wide text-sam-muted">
            {sec.sectionLabel}
          </h3>
          <InboxGroupCardList {...cardProps} items={sec.items} emptyLabel="" />
        </section>
      ))}
    </div>
  );
}
