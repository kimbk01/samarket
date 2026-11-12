import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readLiteBundleRoomAvatarUrl } from "@/lib/community-messenger/lite-bundle-room-avatar";
import { mergeCommunityMessengerSilentDeltaIntoSnapshot } from "@/lib/community-messenger/room/merge-community-messenger-silent-delta";
import {
  GROUP_IDENTITY_LOCAL_SAVE_GUARD_MS,
  noteGroupRoomIdentitySavedLocally,
  resetGroupRoomIdentitySavedLocallyForTests,
} from "@/lib/community-messenger/room/group-room-identity-local-save";
import { MESSENGER_API_EDGE_CACHE_CONTROL } from "@/lib/http/messenger-api-edge-cache";
import { ROOM_BOOTSTRAP_SILENT_DELTA_CACHE_TTL_MS } from "@/lib/community-messenger/server/room-bootstrap-route-cache";
import { beforeEach } from "vitest";
import { normalizeGroupRoomProfilePatch } from "@/lib/community-messenger/group/group-room-profile-policy";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/**
 * 그룹 채팅 전체 결함 G3·G4·G5·G7 (docs/design/group-chat-full-fix-design-2026-11-13.md · PR C).
 * 운영 실측 2026-11-13: 그룹 사진을 저장해도 홈 목록 스냅샷에 avatar_url 이 없어 기본 아이콘만 표시.
 */
const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("G3 홈 목록 그룹 사진", () => {
  it("lite bundle 방 사진을 읽는다 (구 DB 키 없음·빈 값 → null)", () => {
    expect(readLiteBundleRoomAvatarUrl({ avatar_url: " https://x/a.webp " })).toBe("https://x/a.webp");
    expect(readLiteBundleRoomAvatarUrl({})).toBeNull();
    expect(readLiteBundleRoomAvatarUrl({ avatar_url: "" })).toBeNull();
    expect(readLiteBundleRoomAvatarUrl({ avatar_url: null })).toBeNull();
    expect(readLiteBundleRoomAvatarUrl(null)).toBeNull();
  });

  it("lite bundle 방을 읽는 4곳이 모두 방 사진을 읽는다 (null 고정 0)", () => {
    for (const rel of [
      "lib/community-messenger/home-sync-snapshot-assemble.ts",
      "lib/community-messenger/cm-bootstrap-snapshot-assemble.ts",
      "lib/community-messenger/full-bootstrap-snapshot-assemble.ts",
      "lib/community-messenger/service.ts",
    ]) {
      const s = read(rel);
      expect(s, rel).toMatch(/avatar_url: readLiteBundleRoomAvatarUrl\((r|row) as \{ avatar_url\?: unknown \}\),/);
      expect(s, rel).not.toMatch(/title: \(?(r|row)\.title[^\n]*\n\s*summary: null,\n\s*avatar_url: null,/);
    }
  });

  it("마이그레이션은 운영 정의에서 방 객체 avatar_url 1필드만 추가(문장 1회 확인·멱등)", () => {
    const sql = read("supabase/migrations/20271114100000_cm_lite_bundle_room_avatar_url.sql");
    expect(sql).toContain("p.proname = 'community_messenger_bootstrap_lite_my_rooms_bundle'");
    expect(sql).toContain("E'      r.title,\\n      r.avatar_url,\\n      r.created_by,\\n'");
    expect(sql).toContain("''avatar_url'', c.avatar_url,");
    expect(sql).toContain("if position('''avatar_url'', c.avatar_url' in v_def) > 0 then return; end if;");
    expect(sql).toContain("<> 1 then raise exception 'lite bundle 문장 A 불일치'");
    expect(sql).toContain("<> 1 then raise exception 'lite bundle 문장 B 불일치'");
  });
});

function groupSnap(room: Partial<CommunityMessengerRoomSnapshot["room"]>): CommunityMessengerRoomSnapshot {
  return {
    viewerUserId: "u1",
    room: {
      id: "g1",
      roomType: "private_group",
      title: "옛 제목",
      avatarUrl: null,
      unreadCount: 0,
      lastMessage: "",
      lastMessageAt: "2026-11-13T00:00:00Z",
      ...room,
    },
    members: [],
    messages: [],
  } as unknown as CommunityMessengerRoomSnapshot;
}

describe("G4 열린 그룹 방 머리글 — silent_delta 사진·제목 반영", () => {
  beforeEach(() => resetGroupRoomIdentitySavedLocallyForTests());

  it("다른 멤버가 바꾼 사진·실제 제목을 따른다", () => {
    const out = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      groupSnap({}),
      groupSnap({ title: "새 제목", titleFromRoom: true, avatarUrl: "https://x/new.webp" })
    );
    expect(out.room.title).toBe("새 제목");
    expect(out.room.avatarUrl).toBe("https://x/new.webp");
  });

  it("사진을 지우면 null, 서버 대체 제목(titleFromRoom 없음/false)으로는 덮지 않는다", () => {
    const out = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      groupSnap({ avatarUrl: "https://x/old.webp" }),
      groupSnap({ title: "대체", titleFromRoom: false, avatarUrl: null })
    );
    expect(out.room.avatarUrl).toBeNull();
    expect(out.room.title).toBe("옛 제목");
  });

  it("이 기기에서 방금 저장한 값과 다른 delta(캐시된 옛 응답)는 보호 시간 동안 덮지 않고, 같은 값·시간 지난 뒤는 따른다", () => {
    const now = Date.now();
    noteGroupRoomIdentitySavedLocally("g1", { title: "내가 바꾼 제목", avatarUrl: "https://x/mine.webp" }, now);
    const saved = groupSnap({ title: "내가 바꾼 제목", avatarUrl: "https://x/mine.webp" });
    const stale = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      saved,
      groupSnap({ title: "옛 제목", titleFromRoom: true, avatarUrl: null })
    );
    expect(stale.room.title).toBe("내가 바꾼 제목");
    expect(stale.room.avatarUrl).toBe("https://x/mine.webp");
    const fresh = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      saved,
      groupSnap({ title: "내가 바꾼 제목", titleFromRoom: true, avatarUrl: "https://x/mine.webp" })
    );
    expect(fresh.room.avatarUrl).toBe("https://x/mine.webp");
  });

  it("보호 시간 = 서버 silent_delta 캐시 + CDN s-maxage + stale-while-revalidate (값이 바뀌면 함께 맞춘다)", () => {
    const sMax = Number(/s-maxage=(\d+)/.exec(MESSENGER_API_EDGE_CACHE_CONTROL)?.[1] ?? NaN);
    const swr = Number(/stale-while-revalidate=(\d+)/.exec(MESSENGER_API_EDGE_CACHE_CONTROL)?.[1] ?? NaN);
    expect(GROUP_IDENTITY_LOCAL_SAVE_GUARD_MS).toBe(ROOM_BOOTSTRAP_SILENT_DELTA_CACHE_TTL_MS + (sMax + swr) * 1000);
  });

  it("1:1 방은 제목·사진을 바꾸지 않는다", () => {
    const prev = groupSnap({ roomType: "direct", title: "상대", avatarUrl: "https://x/peer.webp" });
    const out = mergeCommunityMessengerSilentDeltaIntoSnapshot(
      prev,
      groupSnap({ roomType: "direct", title: "대화", titleFromRoom: true, avatarUrl: null })
    );
    expect(out.room.title).toBe("상대");
    expect(out.room.avatarUrl).toBe("https://x/peer.webp");
  });
});

describe("G5 저장 후 다른 멤버 목록 — 안 읽음을 만드는 bump 금지", () => {
  it("프로필 저장은 사용자 채널 방 요약 + home-sync 무효화, publishGroupRoomListBump 미사용", () => {
    const s = read("lib/community-messenger/group/group-room-profile-service.ts");
    expect(s).toContain("await notifyGroupRoomProfileChangedToMembersBestEffort({ roomId, actorUserId: userId });");
    expect(s).toContain("publishHomeListRoomInsertForInviteesBestEffort");
    expect(s).toContain("invalidateHomeSyncSnapshotCache(uid)");
    expect(s).not.toMatch(/import[^\n]*publishGroupRoomListBump/);
  });
});

describe("G7 그룹 프로필 저장 검증", () => {
  const ORIGIN = "https://proj.supabase.co";
  const EDITOR = "631a4438-586d-429a-8a9c-bd73c9b622b8";
  const own = `${ORIGIN}/storage/v1/object/public/post-images/${EDITOR}/profile/b75232c3-1b7f-4292-a963-664f93c00fe4.webp`;
  const ctx = { editorUserId: EDITOR, currentAvatarUrl: null, storageOrigin: ORIGIN };

  it("빈 제목은 역할과 무관하게 거부", () => {
    expect(normalizeGroupRoomProfilePatch({ title: "   " }, ctx)).toEqual({ ok: false, error: "title_required" });
  });

  it("편집자 본인이 올린 사진 주소·지우기·지금 값은 허용", () => {
    expect(normalizeGroupRoomProfilePatch({ avatarUrl: own }, ctx)).toEqual({ ok: true, patch: { avatarUrl: own } });
    expect(normalizeGroupRoomProfilePatch({ avatarUrl: null }, ctx)).toEqual({ ok: true, patch: { avatarUrl: null } });
    expect(
      normalizeGroupRoomProfilePatch({ title: "방", avatarUrl: "https://samarket.vercel.app/favicon.ico" }, {
        ...ctx,
        currentAvatarUrl: "https://samarket.vercel.app/favicon.ico",
      })
    ).toEqual({ ok: true, patch: { title: "방", avatarUrl: "https://samarket.vercel.app/favicon.ico" } });
  });

  it("외부 주소·다른 사람 폴더 사진은 거부", () => {
    expect(normalizeGroupRoomProfilePatch({ avatarUrl: "https://evil.example/x.png" }, ctx)).toEqual({
      ok: false,
      error: "invalid_avatar_url",
    });
    const other = own.replace(EDITOR, "8f113095-eeb6-4f54-8668-2a7c5f6a19c3");
    expect(normalizeGroupRoomProfilePatch({ avatarUrl: other }, ctx)).toEqual({ ok: false, error: "invalid_avatar_url" });
  });
});

describe("G6 그룹 사진 올리기", () => {
  it("선택 창은 서버 허용 형식만 · 올리기 전 3MB 기준 축소 · 이유별 안내 키", () => {
    const sheets = read("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2RoomSheets.tsx");
    expect(sheets).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(sheets).not.toContain("image/gif");
    const ctrl = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(ctrl).toContain("prepareCommunityImageForUpload(file, { skipBelowBytes: GROUP_PHOTO_MAX_BYTES })");
    expect(ctrl).toContain('translateCmUi("cm_ui_group_photo_too_large")');
    expect(ctrl).toContain('translateCmUi("cm_ui_group_photo_type_only")');
  });
});
