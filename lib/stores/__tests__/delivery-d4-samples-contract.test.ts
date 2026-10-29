/**
 * D-4 샘플 70곳 데이터 계약 + 반영 스크립트 기본 dry-run 정적 검사.
 * 데이터: scripts/delivery-d4/samples.json · 스크립트: scripts/delivery-d4/{apply-d4-samples,d4-samples-core,rollback-d4-samples}.ts
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

type Store = {
  key: string;
  store_name: string;
  slug: string;
  category: { id: string; slug: string };
  topic: { id: string; slug: string };
  item_type: string;
  sections: Array<{ name: string }>;
  images: { profile: string; cover: string };
  menus: Array<{ title: string; price: number; section: number; image: string }>;
  location: { lat: number; lng: number; city: string; landmark: string; source_url: string };
  delivery_radius_km: number;
  business_hours_json: { auto_business_hours?: { enabled?: boolean; timezone?: string } };
};

const data = JSON.parse(read("scripts/delivery-d4/samples.json")) as { stores: Store[] };
const stores = data.stores;

describe("D-4 samples.json 계약", () => {
  it("70곳 · 2차 업종 35개 × 2곳", () => {
    expect(stores).toHaveLength(70);
    const byTopic = new Map<string, number>();
    for (const s of stores) byTopic.set(s.topic.id, (byTopic.get(s.topic.id) ?? 0) + 1);
    expect(byTopic.size).toBe(35);
    for (const n of byTopic.values()) expect(n).toBe(2);
  });

  it("key·slug·매장명 유일, slug 는 기존 sample-xxxxxxxx 형식", () => {
    expect(new Set(stores.map((s) => s.key)).size).toBe(70);
    expect(new Set(stores.map((s) => s.slug)).size).toBe(70);
    expect(new Set(stores.map((s) => s.store_name)).size).toBe(70);
    for (const s of stores) expect(s.slug).toMatch(/^sample-[0-9a-f]{8}$/);
  });

  it("매장마다 메뉴 6개·섹션 2개 이상·가격 0 이상 정수·섹션 참조 유효", () => {
    for (const s of stores) {
      expect(s.menus, s.key).toHaveLength(6);
      expect(s.sections.length, s.key).toBeGreaterThanOrEqual(2);
      for (const m of s.menus) {
        expect(Number.isInteger(m.price) && m.price >= 0, `${s.key} ${m.title}`).toBe(true);
        expect(s.sections[m.section], `${s.key} ${m.title}`).toBeTruthy();
        expect(m.title.trim().length).toBeGreaterThan(0);
      }
      for (let i = 0; i < s.sections.length; i += 1) {
        expect(s.menus.some((m) => m.section === i), `${s.key} 빈 섹션 ${i}`).toBe(true);
      }
    }
  });

  it("이미지 매핑 완전: 프로필 0·커버 1·메뉴 2~7 = <key>/<번호>.jpg", () => {
    for (const s of stores) {
      expect(s.images.profile).toBe(`${s.key}/0.jpg`);
      expect(s.images.cover).toBe(`${s.key}/1.jpg`);
      s.menus.forEach((m, i) => expect(m.image).toBe(`${s.key}/${i + 2}.jpg`));
    }
  });

  it("좌표는 Metro Manila 범위 + 근거 URL, 반경 5000, 영업시간 자동 설정", () => {
    for (const s of stores) {
      expect(s.location.lat).toBeGreaterThan(14.4);
      expect(s.location.lat).toBeLessThan(14.8);
      expect(s.location.lng).toBeGreaterThan(120.9);
      expect(s.location.lng).toBeLessThan(121.2);
      expect(s.location.source_url).toMatch(/^https:\/\//);
      expect(s.location.landmark.length).toBeGreaterThan(0);
      expect(s.delivery_radius_km).toBe(5000);
      expect(s.business_hours_json.auto_business_hours?.enabled).toBe(true);
      expect(s.business_hours_json.auto_business_hours?.timezone).toBe("Asia/Manila");
      expect(["menu", "product", "service"]).toContain(s.item_type);
    }
  });

  it("매니페스트에 560장 모두 기록", () => {
    const md = read("docs/audit/delivery-d4-image-manifest.md");
    for (const s of stores) {
      for (let i = 0; i < 8; i += 1) expect(md, `${s.key}/${i}.jpg`).toContain(`| ${s.key}/${i}.jpg |`);
    }
    const rows = md.split("\n").filter((l) => /\| (Unsplash|Pexels) License \|/.test(l));
    expect(rows).toHaveLength(560);
    expect(md).not.toContain("plus.unsplash.com");
  });
});

describe("D-4 반영 스크립트 정적 검사", () => {
  const core = read("scripts/delivery-d4/d4-samples-core.ts");
  const entry = read("scripts/delivery-d4/apply-d4-samples.ts");
  const rollback = read("scripts/delivery-d4/rollback-d4-samples.ts");

  it("기본 dry-run — --apply 플래그일 때만 쓰기", () => {
    expect(core).toContain('const apply = argv.includes("--apply");');
    expect(core).toMatch(/if \(!args\.apply \|\| pre\.problems\.length > 0\) \{[\s\S]*?return;\s*\}/);
    const firstWrite = Math.min(
      ...[".insert(", ".update(", ".delete(", ".upload(", ".remove("].map((t) => {
        const i = core.indexOf(t, core.indexOf("export async function runApplyD4"));
        return i < 0 ? Number.POSITIVE_INFINITY : i;
      })
    );
    const gate = core.indexOf("if (!args.apply || pre.problems.length > 0)");
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(firstWrite);
    expect(entry).toContain("void runApplyD4();");
    expect(rollback).toContain("if (!args.apply) {");
  });

  it("샘플 규칙: store_kind sample·오너 없음·판매권한 미변경·기존 업로드 파이프라인", () => {
    expect(core).toContain('store_kind: "sample"');
    expect(core).toContain("owner_user_id: null");
    expect(core).not.toMatch(/from\("store_sales_permissions"\)/);
    expect(core).toContain("processOwnerProductImageBuffer(");
    expect(core).toContain("uploadStoreProductWithHeroDerivative(");
    expect(core).toContain("storeProductListDerivativeOriginalPath(");
    expect(core).toContain("rebuildStoreDeliveryCoverageForStore(");
    expect(core).toContain("refreshDiscoveryScheduleProjectionForStoreId(");
    expect(core).toContain('"admin_delete_sample_store"');
    expect(rollback).toContain('"admin_delete_sample_store"');
    expect(rollback).toContain('r.store_kind === "sample"');
  });
});
