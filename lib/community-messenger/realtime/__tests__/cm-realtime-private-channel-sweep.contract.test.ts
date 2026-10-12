import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { communityMessengerCallInviteChannelName } from "@/lib/community-messenger/call-invite-realtime-broadcast";
import { communityMessengerReadAckChannelName } from "@/lib/community-messenger/realtime/cm-read-ack-channel";
import { communityMessengerRoomBumpChannelName } from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { communityMessengerHomeListChannelName } from "@/lib/community-messenger/realtime/home-list-room-insert-contract";
import { storeOrderRowRealtimeChannelName } from "@/hooks/useSupabaseStoreOrderRowRealtime";
import { tradePostListingBroadcastChannelName } from "@/lib/trade/trade-post-listing-broadcast-channel";

/**
 * D-10 — Production Realtime 은 Public OFF(private-only). public 으로 join 하는 채널은 `PrivateOnly` 로 100% 거절된다.
 * 파일별 허용 목록이 아니라 **저장소 전체**를 훑어서:
 *  1) 모든 `.channel(` 호출이 비공개 옵션을 넘기는지
 *  2) 모든 `subscribeWithRetry({ ... })` 가 `channelOptions` 를 넘기는지
 *  3) 코드의 리터럴 토픽 접두가 최신 `internal.cm_realtime_can_read_topic` 정책에 있는지
 * (2026-10 사고: incoming-call·call-session·call-signal-hangup·order-row 가 public 으로 남아 거절됨)
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "hooks", "lib"];
const UUID = "9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8";

/** `.channel(` 를 직접 호출하지만 비공개 여부를 인자로 위임받는 내부 구현 */
const CHANNEL_CALL_ALLOWLIST = new Set([
  // args.channelOptions 가 있으면 그대로 사용 — 호출부 검사(2)로 강제한다
  "lib/community-messenger/realtime/subscribe-with-retry.ts",
]);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** 주석 제거(줄·블록) — 문자열 안의 `//` 는 보존하도록 단순 상태기계 */
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === "\\") {
        out += n ?? "";
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** `open` 위치의 괄호/중괄호와 짝이 맞는 구간 텍스트(문자열 내부 괄호 무시) */
function balancedSlice(src: string, openIndex: number): string {
  const open = src[openIndex];
  const close = open === "(" ? ")" : "}";
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      quote = c;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return src.slice(openIndex, i + 1);
    }
  }
  return src.slice(openIndex);
}

function latestReadTopicPolicySql(): { file: string; sql: string } {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) =>
      /create or replace function internal\.cm_realtime_can_read_topic/i.test(readFileSync(join(dir, f), "utf8"))
    );
  const file = files[files.length - 1];
  return { file, sql: readFileSync(join(dir, file), "utf8") };
}

function likePatterns(sql: string): string[] {
  return [...sql.matchAll(/p_topic like '([^']+)'/g)].map((m) => m[1]);
}

function policyCoversTopic(sql: string, topic: string): boolean {
  if (sql.includes(`p_topic = '${topic}'`) || sql.includes(`'${topic}'`)) return true;
  return likePatterns(sql).some((pattern) => {
    const re = new RegExp(
      `^${pattern
        .split("")
        .map((ch) => (ch === "%" ? ".*" : ch === "_" ? "." : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("")}$`
    );
    return re.test(topic);
  });
}

const files = SCAN_DIRS.flatMap((d) => listSourceFiles(join(ROOT, d)));

describe("Realtime private-channel sweep (D-10)", () => {
  it("every .channel( call passes private channel options", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      if (CHANNEL_CALL_ALLOWLIST.has(rel)) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/\.channel\(/g)) {
        const args = balancedSlice(src, (m.index ?? 0) + ".channel".length);
        if (!args.includes("messengerPrivateBroadcastChannelOptions(")) {
          offenders.push(`${rel}: .channel${args.slice(0, 80).replace(/\s+/g, " ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every subscribeWithRetry({...}) / acquireIncomingCallRealtimeSubscription({...}) passes channelOptions", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(/\b(subscribeWithRetry|acquireIncomingCallRealtimeSubscription)\(\s*\{/g)) {
        const objStart = src.indexOf("{", m.index ?? 0);
        const obj = balancedSlice(src, objStart);
        if (!/\bchannelOptions\s*:\s*messengerPrivateBroadcastChannelOptions\(/.test(obj)) {
          const name = /name:\s*([^,\n]+)/.exec(obj)?.[1] ?? "?";
          offenders.push(`${rel}: ${m[1]} name=${name.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every literal topic prefix in client code is authorized by the latest read-topic policy", () => {
    const { file: policyFile, sql } = latestReadTopicPolicySql();
    const missing: string[] = [];
    for (const file of files) {
      const rel = relative(ROOT, file);
      const src = stripComments(readFileSync(file, "utf8"));
      const literals = [...src.matchAll(/\.channel\(\s*(["'`])([^"'`]*)/g)].map((m) => m[2]);
      for (const m of src.matchAll(/\b(subscribeWithRetry|acquireIncomingCallRealtimeSubscription)\(\s*\{/g)) {
        const obj = balancedSlice(src, src.indexOf("{", m.index ?? 0));
        const name = /\bname:\s*([`"'])([^`"']*)/.exec(obj);
        if (name) literals.push(name[2]);
      }
      for (const lit of literals) {
        const prefix = lit.split("${")[0];
        if (!prefix || prefix.length < 4) continue;
        const interpolations = (lit.match(/\$\{/g) ?? []).length;
        const covered =
          interpolations === 0
            ? policyCoversTopic(sql, prefix)
            : policyCoversTopic(sql, `${prefix}${UUID}`) ||
              // 앞쪽 동적 세그먼트(예: `kasama-chat:${table}:` · `…-rt:${scope.kind}:`) — 정확한 토픽은 helper 테스트에서 고정
              (interpolations > 1 && likePatterns(sql).some((pattern) => pattern.startsWith(prefix)));
        if (!covered) missing.push(`${rel}: "${lit}" (policy ${policyFile})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("helper-generated messenger/call/order topics are authorized by the latest read-topic policy", () => {
    const { sql } = latestReadTopicPolicySql();
    const topics = [
      communityMessengerRoomBumpChannelName(UUID),
      communityMessengerReadAckChannelName(UUID),
      communityMessengerHomeListChannelName(UUID),
      communityMessengerCallInviteChannelName(UUID),
      tradePostListingBroadcastChannelName(UUID),
      `community-messenger-incoming-call:${UUID}`,
      `community-messenger-call-session:${UUID}`,
      `community-messenger-call-signal-hangup:${UUID}`,
      `kasama-chat:chat_messages:${UUID}`,
      `kasama-chat:product_chat_messages:${UUID}`,
      `kasama-chat:group_messages:${UUID}`,
      `store-order-deliveries-rt:store:${UUID}`,
      `store-order-deliveries-rt:order:${UUID}`,
      storeOrderRowRealtimeChannelName({ domain: "delivery-customer", orderId: UUID }),
      storeOrderRowRealtimeChannelName({ domain: "delivery-owner", orderId: UUID, storeId: UUID }),
      storeOrderRowRealtimeChannelName({ domain: "platform-admin", orderId: UUID }),
    ];
    expect(topics.filter((t) => !policyCoversTopic(sql, t))).toEqual([]);
  });

  it("policy sweep self-check: an unknown topic is NOT authorized (no allow-all)", () => {
    const { sql } = latestReadTopicPolicySql();
    expect(policyCoversTopic(sql, `some-unlisted-topic:${UUID}`)).toBe(false);
    expect(sql).toMatch(/else false/);
  });
});
