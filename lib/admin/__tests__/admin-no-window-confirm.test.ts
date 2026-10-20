/**
 * 설계 v4 §7 — 관리자 확인 팝업은 AdminActionConfirmDialog 만 쓴다. `window.confirm`·`window.prompt` / 전역 `confirm(`·`prompt(` 금지.
 * 대상: components/admin/**, app/admin/** (테스트 제외). `askConfirm(`·`onConfirm(`·`x.confirm(` 같은
 * 식별자·메서드 호출은 허용(앞 글자가 식별자 문자이거나 `.` 인 경우 = 전역 호출이 아님).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SCAN_DIRS = ["components/admin", "app/admin"];

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** `window.confirm(` · `globalThis.confirm(` · 전역 `confirm(` 호출. */
const GLOBAL_CONFIRM = /(?:\b(?:window|globalThis|self)\s*\.\s*(?:confirm|prompt)\s*\(|(?<![\w$.])(?:confirm|prompt)\s*\()/;

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function hasGlobalConfirmCall(src: string): boolean {
  return GLOBAL_CONFIRM.test(stripComments(src));
}

describe("admin: window.confirm 금지 (AdminActionConfirmDialog 사용)", () => {
  it("detector", () => {
    expect(hasGlobalConfirmCall(`if (!window.confirm(msg)) return;`)).toBe(true);
    expect(hasGlobalConfirmCall(`const ok = confirm("x");`)).toBe(true);
    expect(hasGlobalConfirmCall(`globalThis.confirm("x")`)).toBe(true);
    expect(hasGlobalConfirmCall(`await askConfirm({ title })`)).toBe(false);
    expect(hasGlobalConfirmCall(`onConfirm(reason)`)).toBe(false);
    expect(hasGlobalConfirmCall(`dialog.confirm(x)`)).toBe(false);
    expect(hasGlobalConfirmCall(`const { confirm: askConfirm } = useAdminConfirmDialog();`)).toBe(false);
    expect(hasGlobalConfirmCall(`// window.confirm(x) 금지`)).toBe(false);
    expect(hasGlobalConfirmCall(`const name = window.prompt("이름", "");`)).toBe(true);
    expect(hasGlobalConfirmCall(`const name = await askInput({ title })`)).toBe(false);
  });

  it("components/admin · app/admin 에 전역 confirm 호출이 없다", () => {
    const offenders: string[] = [];
    for (const dir of SCAN_DIRS) {
      for (const file of listSourceFiles(path.join(ROOT, dir))) {
        if (hasGlobalConfirmCall(readFileSync(file, "utf8"))) {
          offenders.push(path.relative(ROOT, file).split(path.sep).join("/"));
        }
      }
    }
    expect(offenders.sort()).toEqual([]);
  });
});
