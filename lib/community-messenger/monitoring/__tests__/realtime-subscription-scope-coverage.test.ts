import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  REALTIME_SUBSCRIPTION_OTHER_KIND,
  realtimeSubscriptionKindForScope,
} from "../realtime-subscription-rollup-key";

/**
 * D1 누락 자동 검사 — 저장소 전체에서 실시간 구독(`subscribeWithRetry({...})`, 수신 전화 holder
 * `acquireIncomingCallRealtimeSubscription({...})`)의 scope 를 찾아, 집계 표에 없으면(= `other`) 실패한다.
 * 2026-11-08~09: 표에서 2개가 빠져 운영에서 `other` 로 집계된 일을 다시 막는다.
 */
const root = path.resolve(__dirname, "../../../..");
const SOURCE_DIRS = ["app", "components", "contexts", "hooks", "lib", "services", "repositories", "types"];
const CALLS = ["subscribeWithRetry({", "acquireIncomingCallRealtimeSubscription({"];

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
}

const files: string[] = [];
for (const d of SOURCE_DIRS) walk(path.join(root, d), files);
const sources = new Map(files.map((f) => [f, readFileSync(f, "utf8")]));

function resolveConstant(name: string): string | null {
  const re = new RegExp(`const\\s+${name}\\s*(?::\\s*[^=]+)?=\\s*["'\`]([^"'\`$]+)["'\`]`);
  for (const src of sources.values()) {
    const m = src.match(re);
    if (m) return m[1];
  }
  return null;
}

type Found = { file: string; raw: string; scope: string | null };

function collectScopes(): Found[] {
  const found: Found[] = [];
  for (const [file, src] of sources) {
    for (const call of CALLS) {
      let idx = src.indexOf(call);
      while (idx >= 0) {
        const block = src.slice(idx, idx + 2500);
        const m = block.match(/\bscope:\s*([^,\n}]+)/);
        const raw = m ? m[1].trim() : "";
        let scope: string | null = null;
        const lit = raw.match(/^["']([^"']+)["']$/);
        const tpl = raw.match(/^`([^`$]*)/);
        if (lit) scope = lit[1];
        else if (tpl) scope = tpl[1];
        else if (/^[A-Z][A-Z0-9_]*$/.test(raw)) scope = resolveConstant(raw);
        found.push({ file: path.relative(root, file), raw, scope });
        idx = src.indexOf(call, idx + call.length);
      }
    }
  }
  return found;
}

describe("실시간 구독 scope 집계 표 누락 검사 (D1)", () => {
  const found = collectScopes();

  it("구독 호출을 실제로 찾는다(검색이 비어 통과하는 것 방지)", () => {
    expect(found.length).toBeGreaterThanOrEqual(19);
    expect(found.some((f) => f.file.startsWith("hooks/"))).toBe(true);
  });

  it("모든 scope 를 해석할 수 있고, 집계 표에 있다(other 아님)", () => {
    const unresolved = found.filter((f) => f.scope == null).map((f) => `${f.file}: scope=${f.raw}`);
    expect(unresolved).toEqual([]);
    const unmapped = found
      .filter((f) => f.scope != null && realtimeSubscriptionKindForScope(f.scope) === REALTIME_SUBSCRIPTION_OTHER_KIND)
      .map((f) => `${f.file}: ${f.scope}`);
    expect(unmapped).toEqual([]);
  });
});
