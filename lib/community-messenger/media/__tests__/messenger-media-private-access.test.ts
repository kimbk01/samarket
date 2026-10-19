import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildMessengerMediaRoutePath,
  collectMessengerMessageMediaRefs,
  decodeMessengerMediaObjectParam,
  isMessengerMediaRouteUrl,
  messengerMediaRouteUrlFor,
  parseMessengerStorageObjectUrl,
  withMessengerMediaRouteDownload,
  withMessengerMediaRouteUrls,
} from "@/lib/community-messenger/media/messenger-media-ref";
import {
  MESSENGER_MEDIA_SIGNED_URL_TTL_SEC,
  resolveMessengerMediaAccess,
  sanitizeMessengerMediaDownloadName,
  type MessengerMediaAccessDeps,
  type MessengerMediaMessageRow,
} from "@/lib/community-messenger/server/messenger-media-access";
import {
  messengerPrivateMediaBucketDisabledByEnv,
  resetMessengerMediaBucketCacheForTests,
  resolveMessengerMediaUploadBucket,
} from "@/lib/community-messenger/server/messenger-media-bucket";
import { buildAdminMessengerMediaUrl } from "@/lib/admin-community-messenger/admin-media-url";
import { resolveMessengerMediaUrlForExternalUse } from "@/lib/community-messenger/media/messenger-media-external-url";
import { buildMessengerFileDownloadUrl } from "@/lib/community-messenger/messenger-file-download";
import {
  messengerImageOriginalUrlSlots,
  pickMessengerHttpUrl,
} from "@/lib/community-messenger/attachment/messenger-image-save";
import { buildMessageNotificationDisplay } from "@/lib/notifications/display/build-message-notification-display";

const HOST = "https://abc.supabase.co";
const ROOM = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const LEGACY_PATH = `u1/community/messenger-image/${ROOM}/a.jpg`;
const LEGACY_URL = `${HOST}/storage/v1/object/public/post-images/${LEGACY_PATH}`;
const PRIVATE_PATH = `u1/community/messenger-file/${ROOM}/b.pdf`;
const PRIVATE_URL = `${HOST}/storage/v1/object/public/messenger-media/${PRIVATE_PATH}`;

describe("C-4 messenger media refs", () => {
  it("parses only messenger buckets and rejects traversal / foreign buckets", () => {
    expect(parseMessengerStorageObjectUrl(LEGACY_URL)).toEqual({ bucket: "post-images", path: LEGACY_PATH });
    expect(parseMessengerStorageObjectUrl(PRIVATE_URL)).toEqual({ bucket: "messenger-media", path: PRIVATE_PATH });
    expect(parseMessengerStorageObjectUrl(`${HOST}/storage/v1/object/public/store-product-images/x.jpg`)).toBeNull();
    expect(parseMessengerStorageObjectUrl(`${HOST}/storage/v1/object/public/post-images/a%2F..%2Fb.jpg`)).toBeNull();
    expect(parseMessengerStorageObjectUrl("blob:https://x/abc")).toBeNull();
    expect(decodeMessengerMediaObjectParam("post-images/../x")).toBeNull();
    expect(decodeMessengerMediaObjectParam("other/x.jpg")).toBeNull();
    expect(decodeMessengerMediaObjectParam(`messenger-media/${PRIVATE_PATH}`)).toEqual({
      bucket: "messenger-media",
      path: PRIVATE_PATH,
    });
  });

  it("collects every object a message row references (keys use storage_bucket, URLs carry their own bucket)", () => {
    const refs = collectMessengerMessageMediaRefs({
      content: PRIVATE_URL,
      metadata: { storage_bucket: "messenger-media", storage_path: PRIVATE_PATH, storagePath: PRIVATE_PATH },
    });
    expect(refs).toEqual([{ bucket: "messenger-media", path: PRIVATE_PATH }]);
    const legacyAlbum = collectMessengerMessageMediaRefs({
      content: LEGACY_URL,
      metadata: {
        storage_paths: [LEGACY_PATH],
        image_thumb_urls: [`${HOST}/storage/v1/object/public/post-images/u1/x.thumb.webp`],
      },
    });
    expect(legacyAlbum).toContainEqual({ bucket: "post-images", path: LEGACY_PATH });
    expect(legacyAlbum).toContainEqual({ bucket: "post-images", path: "u1/x.thumb.webp" });
  });

  it("builds route URLs for persisted messages only and is idempotent", () => {
    const route = messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: LEGACY_URL });
    expect(isMessengerMediaRouteUrl(route)).toBe(true);
    expect(route).toBe(buildMessengerMediaRoutePath({ roomId: ROOM, messageId: MSG, object: { bucket: "post-images", path: LEGACY_PATH } }));
    expect(route).not.toContain("supabase.co");
    expect(messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: route })).toBe(route);
    expect(messengerMediaRouteUrlFor({ roomId: ROOM, messageId: `pending:image:${ROOM}:1`, src: LEGACY_URL })).toBe(LEGACY_URL);
    expect(messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: "blob:https://x/1" })).toBe("blob:https://x/1");
    expect(messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: "https://cdn.example.com/sticker.png" })).toBe(
      "https://cdn.example.com/sticker.png"
    );
  });

  it("projects image/file message fields and preserves identity when nothing changes", () => {
    const msg = {
      id: MSG,
      roomId: ROOM,
      messageType: "image",
      content: LEGACY_URL,
      imagePreviewUrl: LEGACY_URL,
      imageOriginalUrl: LEGACY_URL,
    };
    const out = withMessengerMediaRouteUrls(msg);
    expect(out).not.toBe(msg);
    expect(isMessengerMediaRouteUrl(out.content)).toBe(true);
    expect(isMessengerMediaRouteUrl(out.imagePreviewUrl)).toBe(true);
    expect(withMessengerMediaRouteUrls(msg)).toBe(out);
    const sticker = { id: MSG, roomId: ROOM, messageType: "sticker", content: "https://cdn/s.png" };
    expect(withMessengerMediaRouteUrls(sticker)).toBe(sticker);
    const pending = { ...msg, id: "pending:image:x:1", pending: true };
    expect(withMessengerMediaRouteUrls(pending)).toBe(pending);
  });

  it("download param and file download helper route through the media route", () => {
    const route = messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: PRIVATE_URL });
    const dl = withMessengerMediaRouteDownload(route, "보고서 1.pdf");
    expect(dl).toContain("download=");
    expect(new URLSearchParams(dl!.split("?")[1]).get("download")).toBe("보고서 1.pdf");
    expect(buildMessengerFileDownloadUrl(route, "보고서 1.pdf")).toBe(dl);
  });

  it("save helpers accept route URLs and project slots by id/roomId", () => {
    const route = messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: LEGACY_URL });
    expect(pickMessengerHttpUrl("", route)).toBe(route);
    const slots = messengerImageOriginalUrlSlots({
      id: MSG,
      roomId: ROOM,
      messageType: "image",
      content: LEGACY_URL,
      imageOriginalUrl: LEGACY_URL,
      imageAlbumUrls: null,
      imageAlbumOriginalUrls: null,
    });
    expect(slots).toEqual([route]);
  });
});

describe("C-4 admin media url helper", () => {
  it("adds ctx=admin and optional ghost reason; non-storage URLs pass through", () => {
    const u = buildAdminMessengerMediaUrl({ roomId: ROOM, messageId: MSG, url: LEGACY_URL, reason: "신고 검토 사유입니다" });
    const q = new URLSearchParams(u.split("?")[1]);
    expect(q.get("ctx")).toBe("admin");
    expect(q.get("o")).toBe(`post-images/${LEGACY_PATH}`);
    expect(q.get("reason")).toBe("신고 검토 사유입니다");
    expect(buildAdminMessengerMediaUrl({ roomId: ROOM, messageId: MSG, url: "https://cdn/x.png" })).toBe("https://cdn/x.png");
  });
});

function deps(over: Partial<MessengerMediaAccessDeps> & { row?: MessengerMediaMessageRow | null } = {}) {
  const row: MessengerMediaMessageRow | null =
    over.row === undefined
      ? {
          id: MSG,
          room_id: ROOM,
          content: PRIVATE_URL,
          metadata: { storage_bucket: "messenger-media", storage_path: PRIVATE_PATH, storagePath: PRIVATE_PATH },
        }
      : over.row;
  const d: MessengerMediaAccessDeps = {
    loadMessage: vi.fn(async () => row),
    isParticipant: vi.fn(async (_roomId: string, userId: string) => userId === "member"),
    resolveCanonicalRoomId: vi.fn(async () => null),
    authorizeAdmin: vi.fn(async () => ({ ok: true as const })),
    createSignedUrl: vi.fn(async ({ bucket, path, download }) =>
      `${HOST}/storage/v1/object/sign/${bucket}/${path}?token=t${download ? `&download=${download}` : ""}`
    ),
    ...over,
  };
  return d;
}

describe("C-4 media access (route core)", () => {
  const object = { bucket: "messenger-media" as const, path: PRIVATE_PATH };

  it("participant → short signed URL for the private object", async () => {
    const d = deps();
    const r = await resolveMessengerMediaAccess({ userId: "member", rawRoomId: ROOM, messageId: MSG, object }, d);
    expect(r).toMatchObject({ ok: true, viewer: "participant", expiresInSec: MESSENGER_MEDIA_SIGNED_URL_TTL_SEC });
    expect(r.ok && r.signedUrl).toContain("/object/sign/messenger-media/");
    expect(d.createSignedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "messenger-media", path: PRIVATE_PATH, expiresInSec: 600 })
    );
    expect(MESSENGER_MEDIA_SIGNED_URL_TTL_SEC).toBeGreaterThanOrEqual(300);
    expect(MESSENGER_MEDIA_SIGNED_URL_TTL_SEC).toBeLessThanOrEqual(900);
  });

  it("non-participant → 403 and no signed URL", async () => {
    const d = deps();
    const r = await resolveMessengerMediaAccess({ userId: "stranger", rawRoomId: ROOM, messageId: MSG, object }, d);
    expect(r).toEqual({ ok: false, status: 403, error: "forbidden" });
    expect(d.createSignedUrl).not.toHaveBeenCalled();
  });

  it("object not referenced by the message → 404 (no arbitrary path reads)", async () => {
    const d = deps();
    const r = await resolveMessengerMediaAccess(
      { userId: "member", rawRoomId: ROOM, messageId: MSG, object: { bucket: "messenger-media", path: "u2/other.pdf" } },
      d
    );
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(d.createSignedUrl).not.toHaveBeenCalled();
  });

  it("legacy public post-images object is still routed through the check and signed", async () => {
    const d = deps({ row: { id: MSG, room_id: ROOM, content: LEGACY_URL, metadata: { storagePath: LEGACY_PATH } } });
    const ok = await resolveMessengerMediaAccess(
      { userId: "member", rawRoomId: ROOM, messageId: MSG, object: { bucket: "post-images", path: LEGACY_PATH } },
      d
    );
    expect(ok.ok && ok.signedUrl).toContain("/object/sign/post-images/");
    const denied = await resolveMessengerMediaAccess(
      { userId: "stranger", rawRoomId: ROOM, messageId: MSG, object: { bucket: "post-images", path: LEGACY_PATH } },
      d
    );
    expect(denied).toMatchObject({ ok: false, status: 403 });
  });

  it("deleted messages and wrong-room aliases are refused", async () => {
    const deleted = deps({
      row: { id: MSG, room_id: ROOM, content: PRIVATE_URL, metadata: { storage_bucket: "messenger-media", storagePath: PRIVATE_PATH }, deleted_for_everyone_at: "2026-10-19T00:00:00Z" },
    });
    expect(await resolveMessengerMediaAccess({ userId: "member", rawRoomId: ROOM, messageId: MSG, object }, deleted)).toMatchObject({ status: 404 });
    const alias = deps();
    expect(
      await resolveMessengerMediaAccess({ userId: "member", rawRoomId: "legacy-trade-room", messageId: MSG, object }, alias)
    ).toMatchObject({ status: 403 });
    const aliasOk = deps({ resolveCanonicalRoomId: vi.fn(async () => ROOM) });
    expect(
      await resolveMessengerMediaAccess({ userId: "member", rawRoomId: "legacy-trade-room", messageId: MSG, object }, aliasOk)
    ).toMatchObject({ ok: true });
  });

  it("admin context skips participant check but requires authorizeAdmin (permission + audit)", async () => {
    const d = deps();
    const r = await resolveMessengerMediaAccess(
      { userId: "admin-user", rawRoomId: ROOM, messageId: MSG, object, adminContext: true },
      d
    );
    expect(r).toMatchObject({ ok: true, viewer: "admin" });
    expect(d.authorizeAdmin).toHaveBeenCalledWith({ roomId: ROOM, messageId: MSG, object });
    expect(d.isParticipant).not.toHaveBeenCalled();
    const denied = deps({ authorizeAdmin: vi.fn(async () => ({ ok: false as const, status: 403, error: "forbidden_permission" })) });
    expect(
      await resolveMessengerMediaAccess({ userId: "x", rawRoomId: ROOM, messageId: MSG, object, adminContext: true }, denied)
    ).toMatchObject({ ok: false, status: 403 });
    expect(denied.createSignedUrl).not.toHaveBeenCalled();
  });

  it("sanitizes download names", () => {
    expect(sanitizeMessengerMediaDownloadName("../a/b.pdf")).toBe(".._a_b.pdf");
    expect(sanitizeMessengerMediaDownloadName("  ")).toBeNull();
  });
});

describe("C-4 upload bucket detection", () => {
  beforeEach(() => resetMessengerMediaBucketCacheForTests());

  it("uses the private bucket only when it exists and is not public", async () => {
    const exists = { storage: { getBucket: vi.fn(async () => ({ data: { public: false }, error: null })) } };
    expect(await resolveMessengerMediaUploadBucket(exists, { env: {} as NodeJS.ProcessEnv })).toBe("messenger-media");
    resetMessengerMediaBucketCacheForTests();
    const missing = { storage: { getBucket: vi.fn(async () => ({ data: null, error: { message: "not found" } })) } };
    expect(await resolveMessengerMediaUploadBucket(missing, { env: {} as NodeJS.ProcessEnv })).toBe("post-images");
    resetMessengerMediaBucketCacheForTests();
    const isPublic = { storage: { getBucket: vi.fn(async () => ({ data: { public: true }, error: null })) } };
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await resolveMessengerMediaUploadBucket(isPublic, { env: {} as NodeJS.ProcessEnv })).toBe("post-images");
    err.mockRestore();
  });

  it("env off switch forces the legacy bucket", async () => {
    const exists = { storage: { getBucket: vi.fn(async () => ({ data: { public: false }, error: null })) } };
    const env = { MESSENGER_PRIVATE_MEDIA_BUCKET: "off" } as unknown as NodeJS.ProcessEnv;
    expect(messengerPrivateMediaBucketDisabledByEnv(env)).toBe(true);
    expect(await resolveMessengerMediaUploadBucket(exists, { env })).toBe("post-images");
    expect(exists.storage.getBucket).not.toHaveBeenCalled();
  });
});

describe("C-4 external (native) URL resolution", () => {
  it("swaps a route URL for the signed URL from format=json", async () => {
    const route = messengerMediaRouteUrlFor({ roomId: ROOM, messageId: MSG, src: PRIVATE_URL });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, url: `${HOST}/storage/v1/object/sign/x?token=1` }))) as unknown as typeof fetch;
    expect(await resolveMessengerMediaUrlForExternalUse(route, fetchImpl)).toBe(`${HOST}/storage/v1/object/sign/x?token=1`);
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toContain("format=json");
    expect(await resolveMessengerMediaUrlForExternalUse(LEGACY_URL, fetchImpl)).toBe(LEGACY_URL);
  });
});

describe("C-4 chat push payload has no raw media URL", () => {
  it("image/file/voice previews are labels, never the stored URL", () => {
    for (const messageType of ["image", "file", "voice"]) {
      const d = buildMessageNotificationDisplay({
        language: "ko",
        chatPreviewEnabled: true,
        roomKind: "direct",
        messageType,
        textContent: LEGACY_URL,
        sender: { displayName: "A", avatarUrl: null },
        room: { name: null, contextLabel: null },
        roomId: ROOM,
      });
      const json = JSON.stringify(d);
      expect(json).not.toContain("supabase.co");
      expect(json).not.toContain("post-images");
    }
  });
});
