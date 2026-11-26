/**
 * 감사 2026-11-26 D4 — `/favicon.ico` 는 파일 규칙(`app/favicon.ico`) 한 곳에서만 선언한다.
 * `metadata.icons` 에 같은 주소(쿼리만 다름)를 또 두면 WebView 가 같은 파일을 이동마다 두 번 받는다.
 */
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("루트 아이콘 선언", () => {
  it("favicon 은 파일 규칙만 · metadata.icons 에는 favicon 주소가 없다", () => {
    expect(existsSync("app/favicon.ico")).toBe(true);
    const layout = readFileSync("app/layout.tsx", "utf8");
    const icons = layout
      .slice(layout.indexOf("icons: {"), layout.indexOf("appleWebApp:"))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(icons).not.toContain("DIBAY_FAVICON_PATH");
    expect(icons).not.toContain("favicon");
    expect(icons).toContain("DIBAY_APP_ICON_512_PATH");
    expect(icons).toContain("DIBAY_APP_ICON_180_PATH");
  });
});
