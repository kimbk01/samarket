/**
 * @vitest-environment jsdom
 *
 * 거래 글쓰기 사진 보관·시트 재열기 — docs/audit/trade-write-photo-loss-fix-design-2026-10-30.md §7.1
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindAuthUserId, clearBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  clearTradeWriteDraftPhotosForCategory,
  deleteTradeWriteDraftPhotoDatabase,
  loadTradeWriteDraftPhotos,
  setTradeWriteDraftPhotoBackendForTests,
  stashTradeWriteDraftPhoto,
  sweepTradeWriteDraftPhotos,
  type TradeWriteDraftPhotoBackend,
  type TradeWriteDraftPhotoRecord,
} from "@/lib/posts/trade-write-draft-photo-store";
import {
  buildTradeWriteFormSessionDraft,
  collectTradeWriteDraftLocalPhotoIds,
  readTradeWriteDraftImageRefs,
  tradeWriteBuiltDraftLooksFilled,
  type TradeWriteFormSessionDraftBuildArgs,
  type TradeWriteFormSessionDraftV1,
} from "@/lib/posts/trade-write-form-session-draft";
import {
  clearTradeWriteSheetOpenMarker,
  decideTradeWriteSheetReopen,
  readTradeWriteSheetOpenMarker,
  writeTradeWriteSheetOpenMarker,
} from "@/lib/posts/trade-write-sheet-open-marker";
import { discardTradeWriteStashedDraft } from "@/lib/posts/trade-write-exit-cleanup";
import {
  peekTradeWriteMeetSpotStaging,
  persistTradeWriteMeetSpotStaging,
  scheduleClearTradeWriteMeetSpotStaging,
} from "@/lib/posts/trade-write-meet-spot-staging";

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  } as Storage;
}

function memoryBackend(): TradeWriteDraftPhotoBackend & { rows: Map<string, TradeWriteDraftPhotoRecord> } {
  const rows = new Map<string, TradeWriteDraftPhotoRecord>();
  return {
    rows,
    async put(rec) {
      rows.set(rec.localId, rec);
    },
    async get(id) {
      return rows.get(id) ?? null;
    },
    async del(id) {
      rows.delete(id);
    },
    async all() {
      return [...rows.values()];
    },
    async destroy() {
      rows.clear();
    },
  };
}

const CAT = "11111111-2222-3333-4444-555555555555";
const OTHER_CAT = "99999999-2222-3333-4444-555555555555";
const HTTPS = "https://example.supabase.co/storage/v1/object/public/post-images/a.webp";

function file(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

function buildArgs(images: TradeWriteFormSessionDraftBuildArgs["images"]): TradeWriteFormSessionDraftBuildArgs {
  return {
    categoryId: CAT,
    skinKey: "default",
    title: "",
    description: "",
    price: "",
    region: "",
    city: "",
    images,
    isFreeShare: false,
    isPriceOfferEnabled: false,
    isDirectDeal: true,
    tradeTopicChildId: "",
    neighborhood: "",
    buildingName: "",
    estateType: "",
    dealType: "임대",
    deposit: "",
    monthly: "",
    managementFee: "",
    hasPremium: false,
    areaSqm: "",
    roomCount: "",
    bathroomCount: "",
    moveInDate: "",
    carModel: "",
    carYear: "",
    mileage: "",
    usedCarTrade: null,
    carHasAccident: false,
    salary: "",
    workPlace: "",
    workType: "",
    currency: "",
    exchangeRate: "",
    tradeChatCallPolicy: "none",
    descriptionAppend: "",
  };
}

let mem: ReturnType<typeof memoryBackend>;

beforeEach(() => {
  const ls = createMemoryStorage();
  const ss = createMemoryStorage();
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("sessionStorage", ss);
  Object.defineProperty(window, "localStorage", { value: ls, configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: ss, configurable: true, writable: true });
  mem = memoryBackend();
  setTradeWriteDraftPhotoBackendForTests(mem);
  bindAuthUserId("user-a");
});

afterEach(() => {
  setTradeWriteDraftPhotoBackendForTests(null);
  clearBoundAuthUserId();
  vi.unstubAllGlobals();
});

describe("기기 사진 보관 (D1)", () => {
  it("보관한 사진을 같은 사용자·카테고리로 다시 불러온다", async () => {
    const id = await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    expect(id).toBeTruthy();
    const loaded = await loadTradeWriteDraftPhotos(CAT, [id!]);
    expect(loaded.get(id!)?.name).toBe("a.jpg");
  });

  it("다른 사용자·다른 카테고리 사진은 읽지 않는다", async () => {
    const id = await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    expect((await loadTradeWriteDraftPhotos(OTHER_CAT, [id!])).size).toBe(0);
    bindAuthUserId("user-b");
    expect((await loadTradeWriteDraftPhotos(CAT, [id!])).size).toBe(0);
  });

  it("비로그인이면 보관하지 않는다", async () => {
    clearBoundAuthUserId();
    expect(await stashTradeWriteDraftPhoto(CAT, file("a.jpg"))).toBeNull();
    expect(mem.rows.size).toBe(0);
  });

  it("저장 실패는 null — 예외를 던지지 않는다", async () => {
    setTradeWriteDraftPhotoBackendForTests({ ...mem, put: () => Promise.reject(new Error("quota")) });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await stashTradeWriteDraftPhoto(CAT, file("a.jpg"))).toBeNull();
  });

  it("카테고리 삭제는 그 카테고리만 지운다", async () => {
    await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    const keep = await stashTradeWriteDraftPhoto(OTHER_CAT, file("b.jpg"));
    await clearTradeWriteDraftPhotosForCategory(CAT);
    expect([...mem.rows.keys()]).toEqual([keep]);
  });

  it("정리: 다른 사용자 사진과 초안이 참조하지 않는 이전 사진만 지운다", async () => {
    const referenced = await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    const orphan = await stashTradeWriteDraftPhoto(CAT, file("b.jpg"));
    const otherCat = await stashTradeWriteDraftPhoto(OTHER_CAT, file("c.jpg"));
    mem.rows.set("foreign", { ...mem.rows.get(referenced!)!, localId: "foreign", ownerUserId: "user-z" });
    const startedAt = Date.now() + 1;
    const fresh = await stashTradeWriteDraftPhoto(CAT, file("d.jpg"));
    mem.rows.set(fresh!, { ...mem.rows.get(fresh!)!, createdAt: startedAt + 10 });
    await sweepTradeWriteDraftPhotos(CAT, new Set([referenced!]), startedAt);
    const left = new Set(mem.rows.keys());
    expect(left.has(referenced!)).toBe(true);
    expect(left.has(otherCat!)).toBe(true);
    expect(left.has(fresh!)).toBe(true);
    expect(left.has(orphan!)).toBe(false);
    expect(left.has("foreign")).toBe(false);
  });

  it("정리: 소유자 미상(비로그인·부팅 중)이면 아무것도 지우지 않는다", async () => {
    await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    clearBoundAuthUserId();
    await sweepTradeWriteDraftPhotos(CAT, new Set(), Date.now() + 1000);
    expect(mem.rows.size).toBe(1);
  });

  it("로그아웃용 DB 삭제", async () => {
    await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    await deleteTradeWriteDraftPhotoDatabase();
    expect(mem.rows.size).toBe(0);
  });

  it("새로 작성(discardTradeWriteStashedDraft)이 보관 사진도 지운다", async () => {
    await stashTradeWriteDraftPhoto(CAT, file("a.jpg"));
    discardTradeWriteStashedDraft(CAT);
    await vi.waitFor(() => expect(mem.rows.size).toBe(0));
  });
});

describe("초안 imageRefs (D1·D3)", () => {
  it("https 와 기기 보관 사진을 순서대로 남기고, 보관 못 한 blob 은 뺀다", () => {
    const d = buildTradeWriteFormSessionDraft(
      buildArgs([
        { url: "blob:x1", file: file("a.jpg"), localId: "L1" },
        { url: HTTPS },
        { url: "blob:x2", file: file("b.jpg") },
      ])
    );
    expect(d.imageRefs).toEqual([{ localId: "L1" }, { url: HTTPS }]);
    expect(d.imageUrls).toEqual([HTTPS]);
    expect(collectTradeWriteDraftLocalPhotoIds(d)).toEqual(["L1"]);
  });

  it("imageRefs 가 없는 이전 초안은 imageUrls 로 읽는다", () => {
    const legacy = { imageUrls: [HTTPS] } as unknown as TradeWriteFormSessionDraftV1;
    expect(readTradeWriteDraftImageRefs(legacy)).toEqual([{ url: HTTPS }]);
  });

  it("보관 못 한 사진만 있으면 빈 초안을 만들지 않는다", () => {
    expect(tradeWriteBuiltDraftLooksFilled(buildArgs([{ url: "blob:x", file: file("a.jpg") }]))).toBe(false);
    expect(
      tradeWriteBuiltDraftLooksFilled(buildArgs([{ url: "blob:x", file: file("a.jpg"), localId: "L1" }]))
    ).toBe(true);
  });
});

describe("시트 다시 열기 판정 (D2)", () => {
  const envelope = { schema: 1, path: "/market", accountKey: "user-a", writtenAt: Date.now() };

  it("표시 쓰기·읽기·지우기 (경로의 쿼리는 버림)", () => {
    writeTradeWriteSheetOpenMarker("/market?x=1", " cat ", "user-a");
    expect(readTradeWriteSheetOpenMarker()).toMatchObject({ path: "/market", categoryKey: "cat", ownerUserId: "user-a" });
    clearTradeWriteSheetOpenMarker();
    expect(readTradeWriteSheetOpenMarker()).toBeNull();
  });

  it.each([
    ["os_restore", envelope, "user-a", "/market", "reopen"],
    ["doc_reset", envelope, "user-a", "/market", "reopen"],
    ["user_cold", null, "user-a", "/market", "discard"],
    ["ambiguous", null, "user-a", "/market", "discard"],
    ["os_restore", null, "user-a", "/market", "discard"],
    ["os_restore", envelope, "user-b", "/market", "discard"],
    ["os_restore", envelope, null, "/market", "discard"],
    ["os_restore", envelope, "user-a", "/philife", "discard"],
  ] as const)("%s · envelope=%s · owner=%s · path=%s → %s", (kind, env, owner, path, expected) => {
    const marker = { v: 1 as const, path, categoryKey: "cat", ownerUserId: "user-a", writtenAt: 1 };
    expect(decideTradeWriteSheetReopen({ kind, envelope: env }, marker, owner)).toBe(expected);
  });

  it("인증·동의 화면에서 넘어온 문서는 Lifecycle 판정과 무관하게 복원 대상 (같은 계정만)", () => {
    const marker = { v: 1 as const, path: "/market", categoryKey: "cat", ownerUserId: "user-a", writtenAt: 1 };
    expect(decideTradeWriteSheetReopen({ kind: "ambiguous", envelope: null }, marker, "user-a", true)).toBe("reopen");
    expect(decideTradeWriteSheetReopen({ kind: "ambiguous", envelope: null }, marker, "user-b", true)).toBe("discard");
  });
});

describe("지도 스테이징 잔존 (D9)", () => {
  it("적용 직후 예약 삭제 — 같은 턴에는 남고(Strict 이중 layout) 다음 턴에 세션·로컬 모두 사라진다", async () => {
    const draft = buildTradeWriteFormSessionDraft(buildArgs([{ url: HTTPS }]));
    persistTradeWriteMeetSpotStaging(CAT, draft);
    expect(peekTradeWriteMeetSpotStaging(CAT)).not.toBeNull();
    scheduleClearTradeWriteMeetSpotStaging(CAT);
    expect(peekTradeWriteMeetSpotStaging(CAT)).not.toBeNull();
    await Promise.resolve();
    expect(peekTradeWriteMeetSpotStaging(CAT)).toBeNull();
  });
});
