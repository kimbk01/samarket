import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 통화 기록 리스트 토큰(`cmcall1|…`)이 원문으로 화면에 나가지 않도록 하는 경로 가드.
 * `community_messenger_rooms.last_message` 를 읽는 모든 TS 파일은
 *  (a) call-stub-room-tip 해석기를 거치거나, (b) 비표시 용도(쓰기·공백 판정·진단)로 아래 허용 목록에 있어야 한다.
 */
const ROOT = resolve(process.cwd());
const NON_DISPLAY_READERS: Record<string, string> = {
  "lib/community-messenger/service.ts": "쓰기 + buildRoomSummaryFromHydratedMembers 에서 해석(별도 단언)",
  "lib/community-messenger/store-order-chat-service.ts": "tip 쓰기(재계산)",
  "lib/community-messenger/group/group-room-repository.ts": "tip 쓰기",
  "lib/trade/insert-seller-listing-change-system-messages.ts": "tip 쓰기",
  "lib/offers/price-offers.server.ts": "tip 쓰기",
  "lib/notifications/load-messenger-unread-room-facts-from-participants.ts": "비어 있음 판정만",
  "lib/notifications/load-trade-store-order-unread-room-facts-from-participants.ts": "비어 있음 판정만",
  "lib/notifications/badge-authority-rebuild/conversation-b-from-participant-facts.ts": "주석/라벨 문자열",
  "lib/community-messenger/cm-bootstrap-snapshot-assemble.ts": "RoomRow 로 전달 → service 요약에서 해석",
  "lib/community-messenger/home-sync-snapshot-assemble.ts": "RoomRow 로 전달 → service 요약에서 해석",
  "lib/community-messenger/full-bootstrap-snapshot-assemble.ts": "RoomRow 로 전달 → service 요약에서 해석",
  "lib/community-messenger/home/home-room-live-patch-from-realtime.ts":
    "클라 캐시 tip(type=call_stub) → getRoomPreviewText 가 viewer 해석",
  "lib/community-messenger/home-sync-deep-trace-log.ts": "주석",
  "lib/community-messenger/bootstrap-lite-policy.ts": "주석",
  "lib/community-messenger/call-event-presentation.ts": "주석",
  "lib/community-messenger/room-list-semantic-preview.ts": "토큰 생성(해석기와 동일 모듈 사용)",
  "lib/community-messenger/call-stub-room-tip.ts": "해석기 자체",
  "lib/trade/trade-bridge-exit-conditions.ts": "설명 문자열",
  "lib/messenger/contracts/phase11c5-loader-query-catalog.ts": "쿼리 카탈로그 문자열",
  "lib/messenger/contracts/domain-loader-batch-phase11a.ts": "주석",
  "lib/admin/data-reset/planner.ts": "리셋 계획(쓰기)",
  "lib/community-messenger/group/group-room.types.ts": "타입 정의",
  "lib/community-messenger/home-sync-trace.ts": "주석",
  "lib/community-messenger/realtime/community-messenger-realtime-types.ts": "주석",
};

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
}

describe("call stub room tip — 원문 토큰 비노출 경로 가드", () => {
  it("rooms.last_message 를 읽는 파일은 해석기를 쓰거나 비표시 허용 목록에 있다", () => {
    const files: string[] = [];
    for (const d of ["lib", "app", "components"]) walk(join(ROOT, d), files);
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      if (rel.startsWith("lib/i18n/")) continue;
      const src = readFileSync(f, "utf8");
      if (!/\blast_message\b(?!_)/.test(src)) continue;
      if (src.includes("call-stub-room-tip")) continue;
      if (NON_DISPLAY_READERS[rel]) continue;
      offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });

  it("service 요약 빌더는 viewer 기준으로 해석한다", () => {
    const src = readFileSync(join(ROOT, "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain("resolveRoomLastMessageForViewer(isDbRoom ? room.last_message : room.lastMessage, userId)");
  });
});
