/**
 * @vitest-environment jsdom
 *
 * 거래 글쓰기 남은 결함 — docs/audit/trade-write-remaining-defects-fix-design-2026-10-30.md §5.1
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindAuthUserId, clearBoundAuthUserId } from "@/lib/auth/client-instance-id";
import {
  decideTradeWriteSheetGateReturn,
  isTradeWriteGatePath,
  markTradeWriteSheetGateDeparture,
  readTradeWriteSheetOpenMarker,
  writeTradeWriteSheetOpenMarker,
  type TradeWriteSheetOpenMarkerV1,
} from "@/lib/posts/trade-write-sheet-open-marker";
import { isTradeWriteSheetSurfacePath } from "@/contexts/TradeWriteSheetContext";
import { uploadPostImagesDetailed } from "@/lib/posts/uploadPostImages";
import { keepUploadedTradeWriteImages } from "@/lib/posts/trade-write-image-order";
import {
  peekExchangeWriteMeetSpotStaging,
  peekJobsWriteMeetSpotStaging,
  persistExchangeWriteBeforeMeetSpot,
  persistJobsWriteBeforeMeetSpot,
  type ExchangeWriteMeetSpotStagingV1,
  type JobsWriteMeetSpotStagingV1,
} from "@/lib/posts/jobs-exchange-write-meet-spot-staging";
import {
  exchangeMeetSpotStagingLooksMeaningful,
  jobsMeetSpotStagingLooksMeaningful,
} from "@/lib/posts/jobs-exchange-write-draft-signal";
import { readDraftImageRefsFromFields, tradeWriteImagesToDraftRefs } from "@/lib/posts/trade-write-form-session-draft";

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

const CAT = "11111111-2222-3333-4444-555555555555";
const HTTPS = "https://example.supabase.co/storage/v1/object/public/post-images/a.webp";

beforeEach(() => {
  const ls = createMemoryStorage();
  const ss = createMemoryStorage();
  vi.stubGlobal("localStorage", ls);
  vi.stubGlobal("sessionStorage", ss);
  Object.defineProperty(window, "localStorage", { value: ls, configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: ss, configurable: true, writable: true });
  bindAuthUserId("user-a");
});

afterEach(() => {
  clearBoundAuthUserId();
  vi.unstubAllGlobals();
});

describe("D6 내 매물 시트 경로", () => {
  it("/mypage/products 는 시트 표면, /mypage 와 다른 내정보 경로는 아님", () => {
    expect(isTradeWriteSheetSurfacePath("/mypage/products")).toBe(true);
    expect(isTradeWriteSheetSurfacePath("/mypage")).toBe(false);
    expect(isTradeWriteSheetSurfacePath("/mypage/products/x")).toBe(false);
    expect(isTradeWriteSheetSurfacePath("/market")).toBe(true);
  });
});

describe("D5 인증·보완 화면 복귀", () => {
  it.each([
    ["/login", "", true],
    ["/signup", "", true],
    ["/auth/onboarding/terms", "?next=%2Fmarket", true],
    ["/mypage/required/phone", "?returnTo=%2Fmarket", true],
    ["/mypage/required/dibay-id", "", true],
    ["/mypage/addresses", "?returnTo=x", true],
    ["/mypage", "?returnTo=%2Fmarket", true],
    ["/mypage", "", false],
    ["/chats", "", false],
    ["/market", "", false],
  ] as const)("게이트 경로 %s%s → %s", (path, search, expected) => {
    expect(isTradeWriteGatePath(path, search)).toBe(expected);
  });

  const marker: TradeWriteSheetOpenMarkerV1 = {
    v: 1,
    path: "/market",
    categoryKey: "cat",
    ownerUserId: "user-a",
    writtenAt: 1,
    gate: true,
  };

  it.each([
    // [경로, 이 문서에서 나감, 인증 화면에서 넘어온 새 문서, owner, 기대]
    ["/market", true, false, "user-a", "reopen"],
    ["/market", false, true, "user-a", "reopen"],
    ["/market", false, false, "user-a", "discard"], // 새로 실행·새 방문
    ["/auth/onboarding/terms", true, false, "user-a", "wait"],
    ["/mypage/required/phone", false, false, "user-a", "wait"],
    ["/", false, false, "user-a", "wait"], // 새 문서 부팅 경로
    ["/", true, false, "user-a", "discard"], // 인증 포기 후 홈
    ["/chats", true, false, "user-a", "discard"],
    ["/market", true, false, "user-b", "discard"],
    ["/market", true, false, null, "discard"],
  ] as const)("경로 %s · 이 문서=%s · 인증 복귀=%s · owner=%s → %s", (path, here, fromGate, owner, expected) => {
    expect(
      decideTradeWriteSheetGateReturn(marker, owner, path, "", {
        departedThisDocument: here,
        newDocumentFromGate: fromGate,
      })
    ).toBe(expected);
  });

  it("표시가 있을 때만 gate 를 기록한다", () => {
    markTradeWriteSheetGateDeparture();
    expect(readTradeWriteSheetOpenMarker()).toBeNull();
    writeTradeWriteSheetOpenMarker("/market", "cat", "user-a");
    expect(readTradeWriteSheetOpenMarker()?.gate).toBeUndefined();
    const before = Date.now();
    markTradeWriteSheetGateDeparture();
    expect(readTradeWriteSheetOpenMarker()).toMatchObject({ path: "/market", categoryKey: "cat", gate: true });
    expect(readTradeWriteSheetOpenMarker()!.gateAt!).toBeGreaterThanOrEqual(before);
    writeTradeWriteSheetOpenMarker("/market", "cat", "user-a");
    expect(readTradeWriteSheetOpenMarker()?.gate).toBeUndefined();
  });
});

describe("D7 사진 축소는 한 장씩", () => {
  it("축소가 동시에 2장 이상 진행되지 않고, 결과는 입력 순서", async () => {
    let active = 0;
    let maxActive = 0;
    const prepare = vi.fn(async (f: File) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      if (f.name === "bad.jpg") return { ok: false as const, error: "file_too_large" as const };
      return { ok: true as const, file: f, resized: true };
    });
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const name = ((init?.body as FormData).get("file") as File).name;
      return new Response(JSON.stringify({ ok: true, url: `https://cdn/${name}` }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const files = ["a.jpg", "bad.jpg", "c.jpg"].map((n) => new File([new Uint8Array([1])], n, { type: "image/jpeg" }));
    const results = await uploadPostImagesDetailed(files, prepare);
    expect(maxActive).toBe(1);
    expect(results).toEqual([
      { ok: true, url: "https://cdn/a.jpg" },
      { ok: false, reason: "file_too_large" },
      { ok: true, url: "https://cdn/c.jpg" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("D8 성공한 사진은 다시 올리지 않음", () => {
  it("성공분은 주소로, 실패분만 파일로 남고 순서 유지", () => {
    const fa = new File([new Uint8Array([1])], "a.jpg");
    const fb = new File([new Uint8Array([1])], "b.jpg");
    const items = [
      { url: "blob:a", file: fa, localId: "LA" },
      { url: HTTPS },
      { url: "blob:b", file: fb, localId: "LB" },
    ];
    const next = keepUploadedTradeWriteImages(items, items, [{ ok: true, url: "https://cdn/a" }, { ok: false }]);
    expect(next).toEqual([{ url: "https://cdn/a" }, { url: HTTPS }, items[2]]);
  });

  it("업로드 중 붙은 기기 보관 id·순서 변경을 덮지 않고 현재 목록에 반영", () => {
    const fa = new File([new Uint8Array([1])], "a.jpg");
    const fb = new File([new Uint8Array([1])], "b.jpg");
    const snapshot = [
      { url: "blob:a", file: fa },
      { url: "blob:b", file: fb },
    ];
    /** 업로드 중: b 에 localId 가 붙고 순서가 바뀜 */
    const current = [
      { url: "blob:b", file: fb, localId: "LB" },
      { url: "blob:a", file: fa, localId: "LA" },
    ];
    const next = keepUploadedTradeWriteImages(current, snapshot, [{ ok: true, url: "https://cdn/a" }, { ok: false }]);
    expect(next).toEqual([{ url: "blob:b", file: fb, localId: "LB" }, { url: "https://cdn/a" }]);
  });
});

describe("D11 일자리·환전 사진 순서 저장", () => {
  it("https·기기 보관 사진을 순서대로 남기고, 보관 못 한 blob 은 뺀다", () => {
    expect(
      tradeWriteImagesToDraftRefs([{ url: "blob:x", localId: "L1" }, { url: HTTPS }, { url: "blob:y" }])
    ).toEqual({ imageUrls: [HTTPS], imageRefs: [{ localId: "L1" }, { url: HTTPS }] });
  });

  it("일자리 스테이징 imageRefs 저장·읽기, 이전 저장본은 imageUrls 로", () => {
    const base = {
      listingKind: "hire",
      title: "",
      workCategory: "",
      workCategoryOther: "",
      workTerm: "short",
      payType: "hourly",
      payAmount: "",
      description: "",
      region: "",
      city: "",
      tradeTopicChildId: "",
      workDate: "",
      workDateEnd: "",
      workTimeStart: "",
      workTimeEnd: "",
      companyName: "",
      availableTime: "",
      experienceLevel: "none",
      imageUrls: [],
    } satisfies Omit<JobsWriteMeetSpotStagingV1, "v" | "savedAt">;
    persistJobsWriteBeforeMeetSpot(CAT, { ...base, imageRefs: [{ localId: "L1" }] });
    const staged = peekJobsWriteMeetSpotStaging(CAT)!;
    expect(readDraftImageRefsFromFields(staged)).toEqual([{ localId: "L1" }]);
    expect(jobsMeetSpotStagingLooksMeaningful(staged)).toBe(true);
    expect(jobsMeetSpotStagingLooksMeaningful({ ...staged, imageRefs: [] })).toBe(false);
    expect(readDraftImageRefsFromFields({ imageUrls: [HTTPS] })).toEqual([{ url: HTTPS }]);
  });

  it("환전 스테이징 imageRefs 만 있어도 작성 중으로 본다", () => {
    const base = {
      direction: "sell",
      rate: "",
      ratePlus: "0",
      amount: "",
      ratesFetchedAt: "",
      sellerPrep: [],
      buyerPrep: [],
      memo: "",
      descriptionAppend: "",
      region: "",
      city: "",
      tradeTopicChildId: "",
      imageUrls: [],
    } as unknown as Omit<ExchangeWriteMeetSpotStagingV1, "v" | "savedAt">;
    persistExchangeWriteBeforeMeetSpot(CAT, { ...base, imageRefs: [{ localId: "L1" }] });
    const staged = peekExchangeWriteMeetSpotStaging(CAT)!;
    expect(exchangeMeetSpotStagingLooksMeaningful(staged)).toBe(true);
    expect(exchangeMeetSpotStagingLooksMeaningful({ ...staged, imageRefs: [] })).toBe(false);
  });
});
