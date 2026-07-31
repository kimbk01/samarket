import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ROOM_UNREAD_BADGE_PROJECTION_CUTOVER,
  ROOM_UNREAD_AUTHORITY_RUNTIME_PASS,
  ROOM_UNREAD_HEAL_FROZEN,
} from "@/lib/messenger/contracts/room-unread-authority";

const root = process.cwd();

describe("Room Unread Authority — reintro bans", () => {
  it("keeps badge cutover and heal frozen until Runtime PASS", () => {
    expect(ROOM_UNREAD_AUTHORITY_RUNTIME_PASS).toBe(false);
    expect(ROOM_UNREAD_BADGE_PROJECTION_CUTOVER).toBe(false);
    expect(ROOM_UNREAD_HEAL_FROZEN).toBe(true);
  });

  it("store_order readOrderChat does not counter-only reset", () => {
    const src = readFileSync(join(root, "lib/order-domain/read-order-chat.ts"), "utf8");
    expect(src).toContain("dibay_mark_room_read_atomic");
    expect(src).not.toContain("markOrderParticipantRead");
    expect(src).not.toMatch(/\.update\(\{\s*unread_count:\s*0/);
  });

  it("bulk mark-all is quarantined (no counter-only UPDATE)", () => {
    const src = readFileSync(join(root, "lib/community-messenger/bulk-mark-all-read.ts"), "utf8");
    expect(src).toContain("ROOM_UNREAD_HEAL_FROZEN");
    expect(src).toContain("quarantined");
    expect(src).not.toMatch(/\.update\(\{\s*unread_count:\s*0/);
  });

  it("call_stub uses atomic append (no direct unread_count +1 loop)", () => {
    const src = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain('messageType: "call_stub"');
    expect(src).toContain("call_stub_append");
    expect(src).not.toMatch(
      /message_type:\s*"call_stub"[\s\S]{0,800}unread_count:\s*Number\(participant\.unread_count/
    );
  });

  it("sticker/voice/file/image use dibay_append_room_message_atomic (no apply_unread)", () => {
    const src = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    for (const kind of ["sticker_append", "voice_append", "file_append", "image_append"] as const) {
      expect(src).toContain(kind);
    }
    // Typed media paths must not call apply_unread after their atomic cutover markers.
    const stickerIdx = src.indexOf("[room_unread_v1] sticker_append");
    const voiceIdx = src.indexOf("[room_unread_v1] voice_append");
    const fileIdx = src.indexOf("[room_unread_v1] file_append");
    const imageIdx = src.indexOf("[room_unread_v1] image_append");
    expect(stickerIdx).toBeGreaterThan(0);
    expect(voiceIdx).toBeGreaterThan(0);
    expect(fileIdx).toBeGreaterThan(0);
    expect(imageIdx).toBeGreaterThan(0);
    const windowAfter = (i: number) => src.slice(i, i + 400);
    for (const i of [stickerIdx, voiceIdx, fileIdx, imageIdx]) {
      expect(windowAfter(i)).not.toContain("community_messenger_apply_unread_for_text_message");
    }
  });

  it("mark-read prefers dibay_mark_room_read_atomic", () => {
    const src = readFileSync(join(root, "lib/community-messenger/service.ts"), "utf8");
    expect(src).toContain("markRoomReadAtomic");
    expect(src).toContain("room_unread_v1_atomic");
    expect(src).toContain("mark_read_legacy_fallback");
  });
});
