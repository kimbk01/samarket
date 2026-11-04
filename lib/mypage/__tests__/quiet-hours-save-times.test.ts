/** 방해 금지 시각 저장 (2026-11-04 실기 R2 FAIL 정정) — 켤 때·시각 바꿀 때 시작·끝을 함께 저장한다. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "components/my/settings/NotificationsSettingsContent.tsx"), "utf8");

describe("방해 금지 시각 저장", () => {
  it("켤 때 화면에 보이는 시작·끝 시각을 함께 보낸다", () => {
    expect(src).toContain(
      'key === "quiet_hours_enabled" && next\n          ? { [key]: next, quiet_hours_start: domain.quiet_hours_start, quiet_hours_end: domain.quiet_hours_end }'
    );
  });
  it("시각 하나를 바꿔도 시작·끝을 함께 보낸다", () => {
    const fn = src.slice(src.indexOf("const saveQuietTime"));
    expect(fn.slice(0, 900)).toMatch(/quiet_hours_start: domain\.quiet_hours_start,\s*quiet_hours_end: domain\.quiet_hours_end,\s*\[key\]: value/);
  });
});
