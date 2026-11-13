import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/messenger-media-purge", () => ({
  purgeMessengerMediaStoragePaths: vi.fn().mockResolvedValue(undefined),
}));

import { copyMessengerMediaForForward } from "@/lib/community-messenger/server/messenger-forward-media";
import { purgeMessengerMediaStoragePaths } from "@/lib/community-messenger/messenger-media-purge";

// 「모두에게서 삭제」 정리 규칙 실제 함수(목 아님)로 전달본 정리 범위를 검사한다
const { collectMessengerMediaStoragePaths } = await vi.importActual<
  typeof import("@/lib/community-messenger/messenger-media-purge")
>("@/lib/community-messenger/messenger-media-purge");

const BASE = "https://x.supabase.co/storage/v1/object/public/messenger-media";

function fakeSb(failOn?: string) {
  const copies: Array<[string, string, string]> = [];
  const sb = {
    storage: {
      from: (bucket: string) => ({
        copy: async (from: string, to: string) => {
          if (failOn && from === failOn) return { error: { message: "boom" } };
          copies.push([bucket, from, to]);
          return { error: null };
        },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `${BASE}/${p}` } }),
      }),
    },
  };
  return { sb: sb as never, copies };
}

const srcMeta = {
  storage_bucket: "messenger-media",
  storage_path: "u1/community/messenger-image/r1/abc.jpg",
  storagePath: "u1/community/messenger-image/r1/abc.jpg",
  image_thumb_url: `${BASE}/u1/community/messenger-image/r1/abc.thumb.webp`,
  image_preview_url: `${BASE}/u1/community/messenger-image/r1/abc.preview.webp`,
  image_original_url: `${BASE}/u1/community/messenger-image/r1/abc.jpg`,
  image_width: 100,
  image_height: 80,
  client_message_id: "old-cmid",
  reply_to_message_id: "m0",
};

describe("S6-2 사진·파일 전달 — 저장 객체 복사", () => {
  it("모든 객체를 대상 방 경로로 복사하고 경로·주소를 새 객체로 바꾼다 (원본 경로 0)", async () => {
    const { sb, copies } = fakeSb();
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "image",
      content: srcMeta.image_thumb_url,
      metadata: srcMeta,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(copies).toHaveLength(3);
    for (const [, , to] of copies) expect(to.startsWith("u2/community/messenger-image/r9/fwd-")).toBe(true);
    const json = JSON.stringify({ c: r.content, m: r.metadata });
    expect(json).not.toContain("/r1/");
    expect(r.metadata.image_width).toBe(100);
    expect(r.metadata).not.toHaveProperty("client_message_id");
    expect(r.metadata).not.toHaveProperty("reply_to_message_id");
    expect(String(r.metadata.storage_path)).toMatch(/^u2\/community\/messenger-image\/r9\/fwd-/);
    expect(r.content.startsWith(`${BASE}/u2/community/messenger-image/r9/fwd-`)).toBe(true);
  });

  // 원본 객체 수집 순서(collectMessengerMessageMediaRefs) = storage_path(orig) → content(thumb) → image_preview_url(prev)
  it("세 번째 복사 실패 → 앞서 복사한 2개만 지우고 실패", async () => {
    vi.mocked(purgeMessengerMediaStoragePaths).mockClear();
    const { sb, copies } = fakeSb("u1/community/messenger-image/r1/abc.preview.webp");
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "image",
      content: srcMeta.image_thumb_url,
      metadata: srcMeta,
    });
    expect(r).toEqual({ ok: false, error: "forward_media_copy_failed" });
    expect(copies).toHaveLength(2);
    expect(purgeMessengerMediaStoragePaths).toHaveBeenCalledTimes(1);
    const [, paths, opts] = vi.mocked(purgeMessengerMediaStoragePaths).mock.calls[0]!;
    expect(paths).toEqual(copies.map(([, , to]) => to));
    expect(opts).toEqual({ roomId: "r9", bucket: "messenger-media" });
  });

  it("첫 복사 실패 → 지울 것 없음(purge 호출 0) · 실패", async () => {
    vi.mocked(purgeMessengerMediaStoragePaths).mockClear();
    const { sb, copies } = fakeSb("u1/community/messenger-image/r1/abc.jpg");
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "image",
      content: srcMeta.image_thumb_url,
      metadata: srcMeta,
    });
    expect(r).toEqual({ ok: false, error: "forward_media_copy_failed" });
    expect(copies).toHaveLength(0);
    expect(purgeMessengerMediaStoragePaths).not.toHaveBeenCalled();
  });

  it("파생본은 같은 접두사 — 전달본 「모두에게서 삭제」 정리가 복사한 객체 3개를 모두 지운다", async () => {
    const { sb, copies } = fakeSb();
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "image",
      content: srcMeta.image_thumb_url,
      metadata: srcMeta,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const copiedPaths = copies.map(([, , to]) => to).sort();
    const prefixes = new Set(copiedPaths.map((p) => p.split("/").pop()!.split("-").slice(0, 6).join("-")));
    expect(prefixes.size).toBe(1);
    const purgeTargets = collectMessengerMediaStoragePaths({ metadata: r.metadata, content: r.content });
    for (const p of copiedPaths) expect(purgeTargets).toContain(p);
    // 원본은 정리 대상이 아님
    expect(purgeTargets.some((p) => p.includes("/r1/"))).toBe(false);
  });

  it("운영 실측 metadata(2026-11-14 FAIL 재현) — storage_bucket=post-images 인데 파일·주소는 messenger-media → messenger-media 에서 복사", async () => {
    const P = "5f875d4b/community/messenger-image/c8df6209/cf94bf79";
    const prodMeta = {
      mimeType: "image/jpeg",
      image_width: 1920,
      image_height: 1282,
      storagePath: `${P}.jpg`,
      storage_path: `${P}.jpg`,
      storage_bucket: "post-images",
      image_thumb_url: `${BASE}/${P}.thumb.webp`,
      image_preview_url: `${BASE}/${P}.preview.webp`,
      image_original_url: `${BASE}/${P}.jpg`,
    };
    const { sb, copies } = fakeSb();
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "image",
      content: prodMeta.image_thumb_url,
      metadata: prodMeta,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 3개(원본·섬네일·미리보기)만, 전부 messenger-media 에서 — post-images 복사 시도 0
    expect(copies).toHaveLength(3);
    expect(copies.every(([bucket]) => bucket === "messenger-media")).toBe(true);
    expect(r.metadata.storage_bucket).toBe("messenger-media");
    expect(String(r.metadata.storage_path)).toMatch(/^u2\/community\/messenger-image\/r9\/fwd-/);
    const purgeTargets = collectMessengerMediaStoragePaths({ metadata: r.metadata, content: r.content });
    for (const [, , to] of copies) expect(purgeTargets).toContain(to);
  });

  it("근본 수정 — 사진 전송 함수가 업로드 버킷(storageBucket)을 버리지 않는다", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("lib/community-messenger/service.ts", "utf8");
    const a = src.indexOf("export async function sendCommunityMessengerImageMessage");
    const body = src.slice(a, src.indexOf("communityMessengerImageMessageMetadata(items)", a));
    expect(body).toContain("storageBucket: trimText(it.storageBucket) || null");
  });

  it("저장 객체가 없는 메시지는 전달 불가", async () => {
    const { sb } = fakeSb();
    const r = await copyMessengerMediaForForward(sb, {
      userId: "u2",
      targetRoomId: "r9",
      messageType: "file",
      content: "hello",
      metadata: {},
    });
    expect(r).toEqual({ ok: false, error: "forward_media_missing" });
  });
});
