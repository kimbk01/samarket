"use client";

import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import { MessengerTabs } from "@/components/community-messenger/line-ui";

type Props = {
  value: MessengerMainSection;
  onChange: (next: MessengerMainSection) => void;
};

/**
 * 메신저 1차 네비 — `MessengerTabs` 단일 구현을 사용한다.
 */
export function MessengerPrimarySectionNav(props: Props) {
  return <MessengerTabs {...props} />;
}
