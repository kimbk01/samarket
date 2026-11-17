/**
 * 앱 진입 어드민 v3 §2·§3 — 「앱에 나오나」 서버 계산 · 종류(kind) 열 없음 견딤 · 미리보기 배치 · 목적지 href · 그림 가장자리 색.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LAUNCH_INTRO_POOL_POLICY,
  LAUNCH_INTRO_POOL_MAX_ACTIVE,
  computeLaunchIntroPoolApplied,
  normalizeLaunchIntroPoolKind,
  selectLiveLaunchIntroPoolRows,
  validateLaunchIntroPoolInput,
} from "@/lib/launch-intro/pool";
import {
  buildLaunchIntroCtaHref,
  dominantBorderColor,
  filterLaunchIntroItems,
  isLaunchIntroEventPickable,
  launchIntroOrderPayload,
  launchIntroPreviewGeometry,
  moveLaunchIntroItem,
  parseLaunchIntroCtaHref,
} from "@/lib/launch-intro/pool-admin-view";
import {
  isMissingKindColumnError,
  listLaunchIntroPoolRows,
  normalizeLaunchIntroPoolRow,
  validateLaunchIntroPoolOrder,
  writeLaunchIntroPoolWithKindTolerance,
} from "@/lib/launch-intro/pool-server";

const ROOT = process.cwd();
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const SHA = "a".repeat(64);
const NOW = new Date("2026-11-17T04:00:00.000Z");

function row(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    status: "active",
    start_at: null as string | null,
    end_at: null as string | null,
    sort_order: 10,
    image_path: `pool/${id}.png`,
    image_sha256: SHA,
    image_mime: "image/png",
    ...over,
  };
}

describe("「앱에 나오나」 — 기기 발견 응답과 같은 규칙", () => {
  const on = DEFAULT_LAUNCH_INTRO_POOL_POLICY;

  it("켜짐 · 기간 안 = 나오는 중, 첫 소재만 「다음 실행 1순위」", () => {
    const a = computeLaunchIntroPoolApplied([row("a", { sort_order: 10 }), row("b", { sort_order: 20 })], on, NOW);
    expect(a.a).toEqual({ state: "live", reason: null, rank: 0, firstInRotation: true });
    expect(a.b).toEqual({ state: "live", reason: null, rank: 1, firstInRotation: false });
  });

  it("시작 전 = 예약(시작 시각) · 끝남 · 꺼짐 · 종료 · 그림 없음은 이유와 함께 안 나옴", () => {
    const a = computeLaunchIntroPoolApplied(
      [
        row("s", { start_at: "2026-12-01T00:00:00.000Z" }),
        row("w", { end_at: "2026-11-01T00:00:00.000Z" }),
        row("p", { status: "paused" }),
        row("e", { status: "ended" }),
        row("i", { image_sha256: "" }),
      ],
      on,
      NOW
    );
    expect(a.s).toMatchObject({ state: "scheduled", startAt: "2026-12-01T00:00:00.000Z" });
    expect(a.w).toEqual({ state: "off", reason: "window_ended", endAt: "2026-11-01T00:00:00.000Z" });
    expect(a.p).toEqual({ state: "off", reason: "paused" });
    expect(a.e).toEqual({ state: "off", reason: "ended_status" });
    expect(a.i).toEqual({ state: "off", reason: "image_missing" });
  });

  it("전체 설정 꺼짐이면 켜진 소재도 안 나옴(policy_off)", () => {
    const a = computeLaunchIntroPoolApplied([row("a")], { enabled: false, showOnOsRestore: true }, NOW);
    expect(a.a).toEqual({ state: "off", reason: "policy_off" });
  });

  it("20개 상한 밖은 over_cap — 나오는 중·예약 = selectLiveLaunchIntroPoolRows 결과와 정확히 같다", () => {
    const rows = Array.from({ length: LAUNCH_INTRO_POOL_MAX_ACTIVE + 3 }, (_, i) =>
      row(`r${String(i).padStart(2, "0")}`, { sort_order: i, ...(i === 0 ? { start_at: "2026-12-01T00:00:00.000Z" } : {}) })
    );
    const a = computeLaunchIntroPoolApplied(rows, on, NOW);
    const shown = Object.entries(a)
      .filter(([, v]) => v.state !== "off")
      .map(([id]) => id)
      .sort();
    expect(shown).toEqual(selectLiveLaunchIntroPoolRows(rows, NOW).map((r) => r.id).sort());
    expect(Object.values(a).filter((v) => v.state === "off" && v.reason === "over_cap")).toHaveLength(3);
    // 시작 전 소재는 지금 소재 뒤로 밀려 상한 밖이 된다(재감사 L1 규칙 그대로)
    expect(a.r00).toEqual({ state: "off", reason: "over_cap" });
  });

  it("목록 API 는 이 함수로 계산해 항목마다 applied 를 싣는다", () => {
    const route = src("app/api/admin/launch-intro/pool/route.ts");
    expect(route).toContain("computeLaunchIntroPoolApplied(rows.rows, policy.policy, now)");
    expect(route).toContain("applied: applied[r.id]");
  });
});

describe("종류(kind) — 열이 없어도 동작", () => {
  it("읽기: 열이 없거나 모르는 값이면 'ad'", () => {
    expect(normalizeLaunchIntroPoolKind(undefined)).toBe("ad");
    expect(normalizeLaunchIntroPoolKind("x")).toBe("ad");
    expect(normalizeLaunchIntroPoolKind("notice")).toBe("notice");
    const r = normalizeLaunchIntroPoolRow({ id: "1", name: "n", created_by: "u" });
    expect(r.kind).toBe("ad");
    expect("created_by" in r).toBe(false);
  });

  it("목록 읽기는 열 이름을 고정하지 않는다(select *) — kind 없는 행도 'ad'", async () => {
    const select = vi.fn(() => ({
      order: () => ({ order: () => ({ limit: async () => ({ data: [{ id: "a", name: "A" }], error: null }) }) }),
    }));
    const sb = { from: () => ({ select }) } as never;
    const res = await listLaunchIntroPoolRows(sb);
    expect(select).toHaveBeenCalledWith("*");
    expect(res.ok && res.rows[0].kind).toBe("ad");
  });

  it("열 없음 오류 판별(PGRST204 · 42703 + kind)", () => {
    expect(isMissingKindColumnError({ code: "PGRST204", message: "Could not find the 'kind' column of 'launch_intro_creatives'" })).toBe(true);
    expect(isMissingKindColumnError({ code: "42703", message: 'column "kind" does not exist' })).toBe(true);
    expect(isMissingKindColumnError({ code: "PGRST204", message: "Could not find the 'name' column" })).toBe(false);
    expect(isMissingKindColumnError({ code: "23505", message: "kind" })).toBe(false);
  });

  it("쓰기: 열이 없을 때 'ad' 는 kind 를 빼고 다시 저장, 다른 종류는 kind_column_missing", async () => {
    const missing = { code: "PGRST204", message: "Could not find the 'kind' column" };
    const write = vi.fn(async (r: Record<string, unknown>) =>
      "kind" in r ? { data: null, error: missing } : { data: { id: "x" }, error: null }
    );
    const ad = await writeLaunchIntroPoolWithKindTolerance({ name: "a", kind: "ad" }, write);
    expect(ad).toEqual({ data: { id: "x" }, error: null, kindMissing: false });
    expect(write).toHaveBeenLastCalledWith({ name: "a" });

    write.mockClear();
    const ev = await writeLaunchIntroPoolWithKindTolerance({ name: "a", kind: "event" }, write);
    expect(ev.kindMissing).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("검사: 종류 값 · 광고는 「광고」 표기 필수 · 이벤트·안내는 끌 수 있음", () => {
    expect(validateLaunchIntroPoolInput({ kind: "promo" }, { partial: true })).toEqual({ ok: false, error: "kind_invalid" });
    expect(validateLaunchIntroPoolInput({ kind: "ad", showAdLabel: false }, { partial: true })).toEqual({
      ok: false,
      error: "ad_label_required",
    });
    expect(validateLaunchIntroPoolInput({ kind: "event", showAdLabel: false }, { partial: true })).toEqual({
      ok: true,
      row: { kind: "event", show_ad_label: false },
    });
  });

  it("마이그레이션 파일 = 열 추가만(기본 'ad' · 값 검사) · 화면은 kind_column_missing 을 한국어 문구로", () => {
    const sql = src("supabase/migrations/20271117140000_launch_intro_creative_kind.sql");
    expect(sql).toContain("add column if not exists kind text not null default 'ad'");
    expect(sql).toContain("check (kind in ('ad', 'event', 'notice'))");
    expect(src("components/admin/launch-intro/launch-intro-pool-client.ts")).toContain(
      'case "kind_column_missing":\n      return t("admin_launch_intro_v3_err_kind_column_missing")'
    );
  });
});

describe("순서 저장 · 목록 필터", () => {
  it("순서 값 = 위에서부터 10, 20 … · 읽은 판 포함 · 검사", () => {
    const items = [
      { id: "11111111-1111-4111-8111-111111111111", updated_at: "t1" },
      { id: "22222222-2222-4222-8222-222222222222", updated_at: "t2" },
    ];
    const moved = moveLaunchIntroItem(items, 1, 0);
    const payload = launchIntroOrderPayload(moved);
    expect(payload).toEqual([
      { id: items[1].id, expectedUpdatedAt: "t2", sortOrder: 10 },
      { id: items[0].id, expectedUpdatedAt: "t1", sortOrder: 20 },
    ]);
    expect(validateLaunchIntroPoolOrder(payload).ok).toBe(true);
    expect(validateLaunchIntroPoolOrder([payload[0], payload[0]])).toEqual({ ok: false, error: "order_invalid" });
    expect(validateLaunchIntroPoolOrder([{ ...payload[0], expectedUpdatedAt: "" }]).ok).toBe(false);
  });

  it("필터: 앱에 나오나 · 종류 · 이름", () => {
    const items = [
      { name: "11월 쿠폰", kind: "ad" as const, applied: { state: "live" as const, reason: null, rank: 0, firstInRotation: true } },
      { name: "추석 안내", kind: "notice" as const, applied: { state: "off" as const, reason: "paused" as const } },
    ];
    expect(filterLaunchIntroItems(items, { state: "live", kind: "all", q: "" })).toHaveLength(1);
    expect(filterLaunchIntroItems(items, { state: "all", kind: "notice", q: "" })[0].name).toBe("추석 안내");
    expect(filterLaunchIntroItems(items, { state: "all", kind: "all", q: "쿠폰" })[0].name).toBe("11월 쿠폰");
  });
});

describe("미리보기 배치 · 목적지 · 색", () => {
  it("앱 배치: 상태 줄 24 + 위 56 + 아래 88dp, 그림은 비율 유지(잘림 없음)", () => {
    const tall = launchIntroPreviewGeometry({ widthDp: 360, heightDp: 800 }, { width: 1080, height: 1920 });
    expect(tall.imageBox).toEqual({ x: 0, y: 80, width: 360, height: 632 });
    expect(tall.image!.width).toBeCloseTo(355.5, 1);
    expect(tall.image!.height).toBeCloseTo(632, 5);
    const tablet = launchIntroPreviewGeometry({ widthDp: 768, heightDp: 1024 }, { width: 1080, height: 1920 });
    expect(tablet.image!.height).toBeCloseTo(tablet.imageBox.height, 5);
    expect(tablet.image!.x).toBeGreaterThan(0);
    // 네이티브와 같은 값
    const java = src("android/app/src/main/java/com/dibay/app/DibayNativeIntro.java");
    expect(java).toContain("imgLp.bottomMargin = (int) (88 * dp)");
    expect(java).toContain("imgLp.topMargin = (int) (56 * dp)");
    expect(java).toContain('Color.parseColor("#E0A800")');
  });

  it("누르면 이동: 이벤트 /events/:id · 매장 /stores/:slug · 앱 화면 · 외부 — 서버 검사를 통과하는 형태", () => {
    for (const [type, value] of [
      ["event", "evt-1"],
      ["store", "my-shop"],
      ["screen", "/philife"],
      ["external", "https://example.com/a"],
    ] as const) {
      const href = buildLaunchIntroCtaHref(type, value);
      expect(validateLaunchIntroPoolInput({ ctaHref: href }, { partial: true }).ok).toBe(true);
      expect(parseLaunchIntroCtaHref(href)).toEqual({ type, value });
    }
    expect(buildLaunchIntroCtaHref("none", "x")).toBeNull();
  });

  it("이벤트 고르기 = 공개 · 시작됨 · 안 끝남", () => {
    const now = NOW.getTime();
    expect(isLaunchIntroEventPickable({ status: "published" }, now)).toEqual({ ok: true });
    expect(isLaunchIntroEventPickable({ status: "draft" }, now)).toEqual({ ok: false, reason: "not_published" });
    expect(isLaunchIntroEventPickable({ status: "published", startsAt: "2026-12-01T00:00:00Z" }, now)).toEqual({
      ok: false,
      reason: "not_started",
    });
    expect(isLaunchIntroEventPickable({ status: "published", endsAt: "2026-11-01T00:00:00Z" }, now)).toEqual({
      ok: false,
      reason: "ended",
    });
  });

  it("그림에서 고르기 = 가장자리에서 가장 많은 색(투명 제외)", () => {
    const w = 6;
    const h = 6;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        const [r, g, b, a] = edge ? (x === 0 ? [0, 0, 0, 0] : [232, 50, 42, 255]) : [0, 0, 255, 255];
        data.set([r, g, b, a], i);
      }
    }
    expect(dominantBorderColor(data, w, h, 1)).toBe("#E8322A");
    expect(dominantBorderColor(new Uint8ClampedArray(16), 2, 2)).toBeNull();
  });
});

describe("화면 구조", () => {
  it("탭 [인트로 목록 | 고급] · 예전 소재 묶음 칸은 없어졌다 · 기간은 PHT 도우미", () => {
    const page = src("components/admin/launch-intro/LaunchIntroAdminPage.tsx");
    expect(page).toContain('"admin_launch_intro_v3_tab_list"');
    expect(page).toContain('"admin_launch_intro_v3_tab_advanced"');
    expect(page).toContain('t("admin_launch_intro_v3_advanced_note")');
    expect(existsSync(path.join(ROOT, "components/admin/launch-intro/LaunchIntroPoolAdminSection.tsx"))).toBe(false);
    const editor = src("components/admin/launch-intro/LaunchIntroCreativeEditor.tsx");
    expect(editor).toContain("manilaLocalToIso(startLocal)");
    expect(editor).toContain("INTRO_POOL_SLOT");
    expect(editor).not.toMatch(/window\.confirm/);
  });
});
