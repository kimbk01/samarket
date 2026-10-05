/**
 * robots.txt policy for operator-import. Disallowed paths are never collected.
 * AI-crawler-specific blocks are surfaced so the Owner can decide (they don't name our agent).
 */
import { fetchImportText, ImportFetchError } from "./http";

export type RobotsGroup = { agents: string[]; allow: string[]; disallow: string[]; crawlDelay: number | null };

export type RobotsPolicy = {
  status: "found" | "missing" | "error";
  groups: RobotsGroup[];
  /** True when well-known AI crawlers are told `Disallow: /`. */
  aiBotsBlocked: boolean;
  checkedAt: string;
};

const OUR_AGENT_TOKEN = "dibay-communityimport";
const AI_AGENTS = ["gptbot", "claudebot", "claude-web", "anthropic-ai", "ccbot", "google-extended", "perplexitybot"];

export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "disallow") current.disallow.push(value);
    else if (key === "allow") current.allow.push(value);
    else if (key === "crawl-delay") {
      const n = Number(value);
      current.crawlDelay = Number.isFinite(n) ? n : null;
    }
  }
  return groups;
}

function patternToRegex(p: string): RegExp {
  const anchored = p.endsWith("$");
  const body = (anchored ? p.slice(0, -1) : p)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

function groupFor(groups: RobotsGroup[], agentToken: string): RobotsGroup | null {
  const specific = groups.find((g) => g.agents.some((a) => a !== "*" && agentToken.includes(a)));
  return specific ?? groups.find((g) => g.agents.includes("*")) ?? null;
}

/** Longest-match semantics (RFC 9309): longer allow beats shorter disallow. */
export function isPathAllowed(groups: RobotsGroup[], pathAndQuery: string, agentToken = OUR_AGENT_TOKEN): boolean {
  const g = groupFor(groups, agentToken);
  if (!g) return true;
  let best: { len: number; allow: boolean } | null = null;
  for (const [list, allow] of [
    [g.disallow, false],
    [g.allow, true],
  ] as const) {
    for (const p of list) {
      if (!p) continue;
      if (patternToRegex(p).test(pathAndQuery)) {
        if (!best || p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow };
      }
    }
  }
  return best ? best.allow : true;
}

export function crawlDelaySeconds(groups: RobotsGroup[]): number | null {
  return groupFor(groups, OUR_AGENT_TOKEN)?.crawlDelay ?? null;
}

const cache = new Map<string, { at: number; policy: RobotsPolicy }>();
const TTL_MS = 10 * 60 * 1000;

export async function loadRobotsPolicy(origin: string): Promise<RobotsPolicy> {
  const key = origin.replace(/\/$/, "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.policy;
  let policy: RobotsPolicy;
  try {
    const r = await fetchImportText(`${key}/robots.txt`, { accept: "text/plain,*/*", timeoutMs: 10_000 });
    const groups = /<html|<!doctype/i.test(r.text.slice(0, 500)) ? [] : parseRobots(r.text);
    policy = {
      status: "found",
      groups,
      aiBotsBlocked: AI_AGENTS.some((a) => !isPathAllowed(groups, "/", a)),
      checkedAt: new Date().toISOString(),
    };
  } catch (e) {
    const missing = e instanceof ImportFetchError && e.code === "http_error" && (e.status === 404 || e.status === 410);
    policy = { status: missing ? "missing" : "error", groups: [], aiBotsBlocked: false, checkedAt: new Date().toISOString() };
  }
  cache.set(key, { at: Date.now(), policy });
  return policy;
}

/** Throws a clear error when robots.txt disallows the URL for our agent. */
export async function assertRobotsAllows(url: string): Promise<void> {
  const u = new URL(url);
  const policy = await loadRobotsPolicy(u.origin);
  if (!isPathAllowed(policy.groups, u.pathname + u.search)) {
    throw new Error(`robots_disallowed:${u.pathname}`);
  }
}
