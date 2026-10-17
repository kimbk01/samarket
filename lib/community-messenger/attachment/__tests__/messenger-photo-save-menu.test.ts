import { describe, expect, it } from "vitest";
import {
  MESSENGER_ALBUM_REST_TILE_INDEX,
  buildMessengerPhotoSaveMenu,
  extractMessengerAlbumIndexFromTarget,
  messengerSelectedOriginalUrls,
} from "@/lib/community-messenger/attachment/messenger-photo-save-menu";
import { messengerImageOriginalUrlSlots } from "@/lib/community-messenger/attachment/messenger-image-save";

const P = "https://x.supabase.co/storage/v1/object/public/post-images/u/r";

/** DOM 없이 closest 를 흉내 — 조상 체인에서 data-album-index 를 찾는다. */
type FakeEl = {
  attrs: Record<string, string>;
  parent: FakeEl | null;
  getAttribute: (n: string) => string | null;
  closest: (sel: string) => FakeEl | null;
};

function fakeEl(attrs: Record<string, string>, parent: FakeEl | null = null): FakeEl {
  const el: FakeEl = {
    attrs,
    parent,
    getAttribute: (n: string) => (n in attrs ? attrs[n]! : null),
    closest(sel: string) {
      const name = sel.replace(/^\[|\]$/g, "");
      let cur: FakeEl | null = el;
      while (cur) {
        if (name in cur.attrs) return cur;
        cur = cur.parent;
      }
      return null;
    },
  };
  return el;
}

describe("extractMessengerAlbumIndexFromTarget", () => {
  const bubble = fakeEl({});
  it("reads the pressed album cell index from an inner <img>", () => {
    const cell = fakeEl({ "data-album-index": "2" }, bubble);
    const img = fakeEl({}, cell);
    expect(extractMessengerAlbumIndexFromTarget(img)).toBe(2);
  });
  it("single image cell → 0", () => {
    expect(extractMessengerAlbumIndexFromTarget(fakeEl({ "data-album-index": "0" }, bubble))).toBe(0);
  });
  it("+N tile / bubble padding / non-element → undefined", () => {
    const rest = fakeEl({ "data-album-rest": "1" }, bubble);
    expect(extractMessengerAlbumIndexFromTarget(fakeEl({}, rest))).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget(bubble)).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget(null)).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget({})).toBeUndefined();
  });
  it("invalid values → undefined", () => {
    expect(extractMessengerAlbumIndexFromTarget(fakeEl({ "data-album-index": "" }))).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget(fakeEl({ "data-album-index": "-1" }))).toBeUndefined();
    expect(extractMessengerAlbumIndexFromTarget(fakeEl({ "data-album-index": "x" }))).toBeUndefined();
  });
});

describe("D3 — +N tile opens the photo it shows", () => {
  it("rest tile index is 3 (urls[3])", () => {
    expect(MESSENGER_ALBUM_REST_TILE_INDEX).toBe(3);
  });
});

describe("buildMessengerPhotoSaveMenu", () => {
  const album = [`${P}/a.jpg`, `${P}/b.jpg`, `${P}/c.jpg`, `${P}/d.jpg`, `${P}/e.jpg`];
  const kinds = (rows: ReturnType<typeof buildMessengerPhotoSaveMenu>) => rows.map((r) => r.kind);

  it("single photo → 「사진 저장」 (native, web, update_required)", () => {
    for (const mode of ["native", "web", "update_required"] as const) {
      const rows = buildMessengerPhotoSaveMenu({ slots: [`${P}/a.jpg`], mode, albumIndex: 0 });
      expect(rows).toEqual([{ key: "photo-save", kind: "single", urls: [`${P}/a.jpg`] }]);
    }
  });
  it("album + pressed photo → this / all / select", () => {
    const rows = buildMessengerPhotoSaveMenu({ slots: album, mode: "native", albumIndex: 2 });
    expect(kinds(rows)).toEqual(["this", "all", "select"]);
    expect(rows[0]).toMatchObject({ urls: [`${P}/c.jpg`], index: 2 });
    expect(rows[1]).toMatchObject({ urls: album, count: 5 });
    expect(rows[2]).toMatchObject({ preselectIndex: 2 });
  });
  it("album without index (+N tile / padding) → all / select", () => {
    const rows = buildMessengerPhotoSaveMenu({ slots: album, mode: "web" });
    expect(kinds(rows)).toEqual(["all", "select"]);
    expect(rows[1]).not.toHaveProperty("preselectIndex");
  });
  it("out of range index is ignored", () => {
    expect(kinds(buildMessengerPhotoSaveMenu({ slots: album, mode: "native", albumIndex: 9 }))).toEqual(["all", "select"]);
  });
  it("old app (update_required): same menu as native — Android/iOS identical", () => {
    for (const albumIndex of [1, undefined]) {
      expect(buildMessengerPhotoSaveMenu({ slots: album, mode: "update_required", albumIndex })).toEqual(
        buildMessengerPhotoSaveMenu({ slots: album, mode: "native", albumIndex }),
      );
    }
  });
  it("unsupported binary / nothing savable → no rows", () => {
    expect(buildMessengerPhotoSaveMenu({ slots: album, mode: "none", albumIndex: 1 })).toEqual([]);
    expect(buildMessengerPhotoSaveMenu({ slots: ["", ""], mode: "native" })).toEqual([]);
  });
  it("no old expandable one-by-one list", () => {
    const rows = buildMessengerPhotoSaveMenu({ slots: album, mode: "native", albumIndex: 0 });
    expect(rows.length).toBe(3);
  });
});

describe("select sheet — selection → urls in album order", () => {
  const slots = [`${P}/a.jpg`, "", `${P}/c.jpg`, `${P}/d.jpg`];
  it("keeps album order regardless of tap order, skips unsavable", () => {
    expect(messengerSelectedOriginalUrls(slots, [3, 0, 1])).toEqual([`${P}/a.jpg`, `${P}/d.jpg`]);
    expect(messengerSelectedOriginalUrls(slots, new Set([2]))).toEqual([`${P}/c.jpg`]);
    expect(messengerSelectedOriginalUrls(slots, [])).toEqual([]);
  });
});

describe("messengerImageOriginalUrlSlots — per-slot fallback keeps indices", () => {
  it("empty original falls back to display URL in the same slot", () => {
    expect(
      messengerImageOriginalUrlSlots({
        messageType: "image",
        content: "",
        imageAlbumUrls: [`${P}/a.thumb.webp`, `${P}/b.thumb.webp`, "blob:x"],
        imageAlbumOriginalUrls: [`${P}/a.jpg`, "", ""],
      })
    ).toEqual([`${P}/a.jpg`, `${P}/b.thumb.webp`, ""]);
  });
});
