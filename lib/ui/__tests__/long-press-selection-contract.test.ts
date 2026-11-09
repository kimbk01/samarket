/**
 * 길게 누르기 계약 (Owner 2026-11-09 「다른 버튼에는 동일 문제가 없는지」 → 「권장안대로 구현」 → 「A~D 진행」).
 *
 * - iOS 시스템 메뉴: 링크·이미지·아이콘 `-webkit-touch-callout: none`, 회원 본문 링크만 기본 메뉴.
 * - 화면 글자: body 선택 안 됨, 입력·편집기·회원 글(`data-user-content`)·번호류(`data-copyable`)·관리자만 허용.
 * - 허용 표시는 버튼·링크 안에 두지 않는다 — 두면 그 버튼을 길게 누를 때 글자가 선택된다(4f795cd1d 결함).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");
const css = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const compact = css.replace(/\s+/g, " ");

describe("globals.css long-press rules", () => {
  it("blocks the iOS callout on links, images and icons", () => {
    expect(compact).toContain("a, img, svg { -webkit-touch-callout: none; }");
    expect(compact).toMatch(/\[data-user-content\] a \{ -webkit-touch-callout: default;/);
  });

  it("makes body text non-selectable and re-allows only the whitelist", () => {
    expect(compact).toContain("body { -webkit-user-select: none; user-select: none; }");
    for (const sel of [
      "input,",
      "textarea,",
      "select,",
      '[contenteditable]:not([contenteditable="false"]),',
      "[data-user-content],",
      "[data-copyable],",
      "[data-admin] {",
    ]) {
      expect(compact).toContain(sel);
    }
    expect(compact).toContain('body:has([data-admin-console="v2"]) { -webkit-user-select: text; user-select: text; }');
  });

  it("keeps buttons, tabs and menu items non-selectable", () => {
    expect(compact).toMatch(
      /button, \[role="button"\], \[role="tab"\], \[role="menuitem"\], summary \{ -webkit-user-select: none; user-select: none; \}/,
    );
  });

  it("keeps the rules in @layer base so utilities can still override", () => {
    const baseStart = css.indexOf("@layer base {");
    expect(baseStart).toBeGreaterThanOrEqual(0);
    expect(css.indexOf("body {\n    -webkit-user-select: none;")).toBeGreaterThan(baseStart);
  });
});

function listTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) listTsx(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const OPEN = /<(button|Link|a)(\s|>|$)/g;
const CLOSE = /<\/(button|Link|a)>/g;
const MARK = /data-(copyable|user-content)=/;

describe("selection whitelist markers", () => {
  it("never sit on or inside a button/link (long-press would select the button text)", () => {
    const offenders: string[] = [];
    for (const file of [...listTsx(path.join(ROOT, "components")), ...listTsx(path.join(ROOT, "app"))]) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (!MARK.test(line)) return;
        const rel = `${path.relative(ROOT, file)}:${i + 1}`;
        if (/<(button|Link|a)(\s|>|$)/.test(line)) {
          offenders.push(`${rel} (on the element itself)`);
          return;
        }
        let closed = 0;
        for (let j = i - 1; j >= Math.max(0, i - 80); j -= 1) {
          closed += (lines[j].match(CLOSE) ?? []).length;
          const opened = (lines[j].match(OPEN) ?? []).length;
          if (opened > closed) {
            offenders.push(`${rel} (inside element opened at line ${j + 1})`);
            return;
          }
          closed -= opened;
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
