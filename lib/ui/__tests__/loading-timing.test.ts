import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOADING_SPINNER_APPEAR_DELAY_MS } from "@/lib/ui/loading-timing";

/** 대기 표시 지연은 CSS·TS 한 값 — loading-spinner 설계 §3-0 (메신저 방 진입 450ms 와 같음) */
describe("loading timing SSOT", () => {
  it("CSS --sam-spinner-appear-delay = LOADING_SPINNER_APPEAR_DELAY_MS", () => {
    const css = readFileSync(join(process.cwd(), "app/design-tokens.css"), "utf8");
    const m = /--sam-spinner-appear-delay:\s*(\d+)ms/.exec(css);
    expect(m?.[1]).toBe(String(LOADING_SPINNER_APPEAR_DELAY_MS));
  });
  it("메신저 방 진입 스피너 지연도 같은 상수를 쓴다", () => {
    const src = readFileSync(
      join(process.cwd(), "lib/community-messenger/room/messenger-page-snapshot-transition.ts"),
      "utf8"
    );
    expect(src).toContain("const ENTRY_SPINNER_DELAY_MS = LOADING_SPINNER_APPEAR_DELAY_MS;");
  });
});
