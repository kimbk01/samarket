/**
 * 재감사 P-4 — 탭 목록·행 라벨·상세 상단 분류는 같은 입력(memberNotificationDomainRowFromInbox)을 쓴다.
 * kind 가 최상위(display_payload.kind)에만 있는 행도 화면마다 같은 분류가 나와야 한다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildInboxGroupItems } from "@/lib/notifications/group-inbox-by-thread";
import { classifyInboxRowMemberDomain, type InboxNotificationRow } from "@/lib/notifications/inbox-events-merge";
import {
  classifyMemberNotificationDomain,
  memberNotificationDomainRowFromInbox,
  resolveMemberNotificationRowLabelKey,
} from "@/lib/notifications/member-notification-domain";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

/** 배달 광고 결과 — kind 는 event_kind 에만 있고 meta 에는 없다. */
const row: InboxNotificationRow = {
  id: "e1",
  source: "event",
  notification_type: "commerce",
  title: "t",
  body: "b",
  link_url: null,
  is_read: false,
  created_at: "2026-10-27T00:00:00.000Z",
  meta: {},
  push_kind: "delivery",
  event_type: "order_status",
  event_kind: "delivery_ad_approved",
};

describe("P-4 member domain same input", () => {
  it("tab list, group row label and detail use the same domain", () => {
    const tab = classifyInboxRowMemberDomain(row);
    expect(tab).toBe("marketing");
    const [item] = buildInboxGroupItems([row]);
    expect(item!.event_kind).toBe("delivery_ad_approved");
    expect(resolveMemberNotificationRowLabelKey(memberNotificationDomainRowFromInbox(item!))).toBe(
      "notif_filter_marketing"
    );
    expect(classifyMemberNotificationDomain(memberNotificationDomainRowFromInbox(row))).toBe(tab);
  });

  it("surfaces build the classifier input through the shared helper", () => {
    for (const rel of [
      "app/(main)/notifications/[notificationId]/page.tsx",
      "components/notifications/InboxGroupCardList.tsx",
    ]) {
      expect(read(rel)).toContain("memberNotificationDomainRowFromInbox(");
    }
  });
});
