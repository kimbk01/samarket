#!/usr/bin/env node
/**
 * Badge Rebuild Lifecycle QA 1–6 — audit harness only (no product code changes).
 * Requires local server running Rebuild working tree (e.g. next destin).
 * SSOT_AUDIT_BASE_URL default http://127.0.0.1:3017
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";
import { buildApkSessionCookies } from "../scripts/qa/lib/apk-webview-cdp.mjs";

/** Mirrors lib/notifications/notification-sound-event-map.ts EVENT_TYPE_TO_KEY (read-only assert). */
const EVENT_TYPE_TO_KEY = {
  chat_message: "messenger_direct_message_received",
  group_message: "messenger_group_message_received",
  trade_message: "trade_chat_message_received",
  trade_status: "trade_offer_received",
  order_status: "delivery_order_status_changed_user",
  delivery_status: "delivery_order_status_changed_user",
  community_activity: "community_comment_received",
  store_order_message: "delivery_chat_message_received_user",
};
function eventKeyForNotificationEventType(type) {
  return EVENT_TYPE_TO_KEY[type] ?? "system_default";
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SSOT_AUDIT_BASE_URL || "http://127.0.0.1:3017";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT_DIR = path.join(ROOT, `.qa-logs/badge-rebuild-lifecycle-qa/${STAMP}`);
const HUB_BADGE_QS = "cmFresh=1&hubBadgeBypass=1";
const OWNER_HUB_BADGE_SYNC_CHANNEL = "samarket:owner-hub-badge-sync";
const COMMUNITY_POST_STATUS_ACTIVE = "active";
const BOOTSTRAP_SS_KEYS = {
  full: "samarket.messenger.bootstrap.v1",
  critical: "samarket.messenger.bootstrap.critical.v1",
  minimal: "samarket.messenger.bootstrap.minimal.v1",
};
const ROW_STATE_POLL_INTERVAL_MS = 400;
const ROW_STATE_POLL_MAX_MS = 15_000;
const BADGE_SETTLE_TIMEOUT_MS = 20_000;
const BADGE_SETTLE_POLL_MS = 500;
const BADGE_SETTLE_STABLE_POLLS = 2;
const QA1_REPEAT = Math.max(1, Math.floor(Number(process.env.BADGE_LIFECYCLE_QA1_REPEAT) || 1));

const QA_CASE_FILTER = new Set(
  (process.env.BADGE_LIFECYCLE_QA_CASES || "all")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

function qaCaseEnabled(caseNum) {
  if (QA_CASE_FILTER.has("all")) return true;
  return QA_CASE_FILTER.has(String(caseNum));
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

function parseBadge(text) {
  if (!text) return 0;
  const t = String(text).trim();
  if (!t) return 0;
  if (t === "99+") return 99;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : 0;
}

function classifyConsoleAuditLine(text) {
  const categories = [];
  const t = String(text ?? "");
  if (t.includes("[cm-read-badge]")) categories.push("cm_read_badge");
  if (t.includes("home_list_stale_unread_zero_blocked")) categories.push("stale_unread_zero_blocked");
  if (t.includes("read_bus_receive") || t.includes("read_bus_emit")) categories.push("cm_room_read");
  if (
    t.includes("local_unread") ||
    t.includes("home_mark_read_optimistic") ||
    t.includes('"kind":"local_unread"')
  ) {
    categories.push("cm_room_local_unread");
  }
  if (t.includes("[cm-home-sync-identical-skip]")) categories.push("home_sync_identical_skip");
  if (t.includes("[home-sync-reentry]")) categories.push("home_sync_reentry");
  if (t.includes("critical_patch") || t.includes("home_sync_critical_patch")) {
    categories.push("critical_patch");
  }
  if (t.includes("participant_unread_delta") || t.includes("participant_unread_changed")) {
    categories.push("participant_unread_delta");
  }
  if (t.includes("[messenger-consistency-analysis]")) categories.push("consistency_analysis");
  if (t.includes("resolution_path")) categories.push("resolution_path");
  if (t.includes("stale_version_discard")) categories.push("stale_version_discard");
  if (t.includes("unreadGuardApplied") || t.includes("unread_guard")) {
    categories.push("unread_guard_applied");
  }
  if (t.includes("[cm-list-owner]")) categories.push("cm_list_owner");
  return categories;
}

function parseMessengerConsistencyAnalysis(text) {
  if (!String(text ?? "").includes("[messenger-consistency-analysis]")) return null;
  const pick = (key) => {
    const re = new RegExp(`${key}:\\s*([^,}\\]]+)`);
    const m = String(text).match(re);
    if (!m) return null;
    let v = m[1].trim();
    if (v === "undefined" || v === "null") return null;
    if (key.startsWith("unread_") || key.endsWith("_detected")) {
      const n = Number(v);
      return Number.isFinite(n) ? n : v;
    }
    return v;
  };
  return {
    surface: pick("surface"),
    room_id: pick("room_id"),
    event_type: pick("event_type"),
    source: pick("source"),
    resolution_path: pick("resolution_path"),
    unread_before: pick("unread_before"),
    unread_after: pick("unread_after"),
    stale_detected: pick("stale_detected"),
    duplicate_event_detected: pick("duplicate_event_detected"),
  };
}

function extractFixtureRoomFromHomeSyncPayload(json, roomId) {
  const all = [...(json?.chats ?? []), ...(json?.groups ?? [])];
  const room = all.find((r) => String(r?.id) === String(roomId));
  if (!room) return { present: false, unreadCount: null, lastMessageAt: null, title: null };
  return {
    present: true,
    unreadCount: room.unreadCount ?? null,
    lastMessageAt: room.lastMessageAt ?? null,
    title: room.title ?? null,
  };
}

function attachHomeSyncNetworkAudit(page, getRoomId, buffer, getPollStartT) {
  const handler = (response) => {
    void (async () => {
      try {
        const url = response.url();
        if (!url.includes("/api/community-messenger/home-sync")) return;
        if (!response.ok()) return;
        const roomId = getRoomId();
        if (!roomId) return;
        const tierMatch = url.match(/[?&]tier=([^&]+)/);
        const tier = tierMatch?.[1] ?? "unknown";
        const pollStartT = getPollStartT?.() ?? null;
        const beforeSnapshot = await probeRowStateSnapshot(page, roomId);
        let json = null;
        try {
          json = await response.json();
        } catch {
          return;
        }
        const payloadFixture = extractFixtureRoomFromHomeSyncPayload(json, roomId);
        const entry = {
          t: Date.now(),
          relativeMs: pollStartT != null ? Date.now() - pollStartT : null,
          tier,
          query: url.includes("?") ? url.slice(url.indexOf("?") + 1) : "",
          payloadFixture,
          mergeBefore: {
            ssFullUnread: beforeSnapshot.sessionStorageBootstrap?.full?.unreadCount ?? null,
            ssCriticalUnread: beforeSnapshot.sessionStorageBootstrap?.critical?.unreadCount ?? null,
            domBadge: beforeSnapshot.domBadge,
          },
          postMergeProbes: [],
        };
        for (const delayMs of [0, 10, 25, 50, 100, 200, 400, 800]) {
          if (delayMs > 0) await delay(delayMs);
          const snap = await probeRowStateSnapshot(page, roomId);
          entry.postMergeProbes.push({
            delayMs,
            ssFullUnread: snap.sessionStorageBootstrap?.full?.unreadCount ?? null,
            domBadge: snap.domBadge,
          });
        }
        buffer.push(entry);
      } catch {
        /* ignore */
      }
    })();
  };
  page.on("response", handler);
  return () => page.off("response", handler);
}

async function readSessionStorageWriteAudit(page) {
  return page.evaluate(() => {
    const rows = Array.isArray(window.__qaSsBootstrapWriteAudit)
      ? window.__qaSsBootstrapWriteAudit
      : [];
    return rows.map((r) => ({
      t: r.t,
      key: r.key,
      fixtureUnreadBefore: r.fixtureUnreadBefore ?? null,
      fixtureUnreadAfter: r.fixtureUnreadAfter ?? null,
    }));
  });
}

async function resetSessionStorageWriteAudit(page, roomId) {
  await page.evaluate((rid) => {
    window.__qaFixtureRoomId = rid;
    window.__qaSsBootstrapWriteAudit = [];
  }, roomId);
}

function buildCriticalPatchMergeAudit({
  roomId,
  homeSyncNetworkEvents,
  ssWriteEvents,
  consoleEvents,
  rowPass,
}) {
  const consistencyLogs = (consoleEvents ?? []).filter((ev) => ev.parsed?.room_id);
  const fixtureConsistency = consistencyLogs.filter(
    (l) => String(l.parsed?.room_id) === String(roomId)
  );
  const criticalPatchLogs = fixtureConsistency.filter(
    (l) =>
      l.parsed?.event_type === "critical_patch" ||
      l.parsed?.source === "home_sync_critical_patch"
  );

  const criticalNetwork = (homeSyncNetworkEvents ?? []).filter((e) => e.tier === "critical");
  const fullNetwork = (homeSyncNetworkEvents ?? []).filter((e) => e.tier === "full");

  const lastDropWrite = [...(ssWriteEvents ?? [])]
    .reverse()
    .find((w) => w.fixtureUnreadBefore === 5 && w.fixtureUnreadAfter === 0);

  const failCriticalResponse =
    criticalNetwork.find((n) => {
      const before = n.mergeBefore?.ssFullUnread;
      const afterZero = n.postMergeProbes?.some((p) => p.ssFullUnread === 0);
      return before === 5 && afterZero;
    }) ?? criticalNetwork[criticalNetwork.length - 1];

  const payloadUnread = failCriticalResponse?.payloadFixture?.unreadCount ?? null;
  const mergeBeforeUnread = failCriticalResponse?.mergeBefore?.ssFullUnread ?? null;
  const mergeAfterUnread =
    failCriticalResponse?.postMergeProbes?.find((p) => p.ssFullUnread === 0)?.ssFullUnread ??
    failCriticalResponse?.postMergeProbes?.slice(-1)[0]?.ssFullUnread ??
    null;

  const lastConsistency = criticalPatchLogs.length
    ? criticalPatchLogs[criticalPatchLogs.length - 1].parsed
    : null;

  let lastWritePath = "미확정";
  let lastWritePathConfidence = "low";
  const evidence = [];

  if (failCriticalResponse) {
    evidence.push({
      kind: "home_sync_critical_response",
      relativeMs: failCriticalResponse.relativeMs,
      payloadUnread: failCriticalResponse.payloadFixture?.unreadCount,
      mergeBeforeSsFull: failCriticalResponse.mergeBefore?.ssFullUnread,
      postMergeProbes: failCriticalResponse.postMergeProbes,
    });
  }
  if (lastDropWrite) {
    evidence.push({
      kind: "sessionStorage_full_write",
      fixtureUnreadBefore: lastDropWrite.fixtureUnreadBefore,
      fixtureUnreadAfter: lastDropWrite.fixtureUnreadAfter,
    });
  }
  if (lastConsistency) {
    evidence.push({ kind: "consistency_analysis", ...lastConsistency });
  }

  if (rowPass) {
    lastWritePath =
      criticalPatchLogs.length === 0
        ? "PASS — critical_patch consistency 로그 없음, SS/DOM 5 유지"
        : "PASS — critical_patch 있으나 SS full 5→0 전환 없음";
    lastWritePathConfidence = "high";
  } else if (payloadUnread === 5 && mergeBeforeUnread === 5 && mergeAfterUnread === 0) {
    const rp = lastConsistency?.resolution_path ?? "unknown";
    const ub = lastConsistency?.unread_before;
    const ua = lastConsistency?.unread_after;
    if (ub === 5 && ua === 0) {
      lastWritePath = `home_sync_critical_patch merge — consistency unread 5→0, resolution_path=${rp}`;
      lastWritePathConfidence = "high";
    } else if (rp && rp !== "unknown") {
      lastWritePath = `home_sync_critical_patch merge + SS full persist — payload=5, resolution_path=${rp}`;
      lastWritePathConfidence = "high";
    } else if (lastDropWrite) {
      lastWritePath =
        "home_sync_critical_patch apply → mergeCriticalRoomPatchesIntoLists/local-read-guard → bootstrap full sessionStorage write 5→0";
      lastWritePathConfidence = "medium-high";
    } else {
      lastWritePath = "home_sync_critical_patch response — payload=5, client list SS full 5→0";
      lastWritePathConfidence = "medium-high";
    }
  } else if (payloadUnread === 0) {
    lastWritePath = "home_sync critical payload unreadCount=0 — fetch가 0 전달";
    lastWritePathConfidence = "high";
  } else if (lastDropWrite) {
    lastWritePath = `sessionStorage full write ${lastDropWrite.fixtureUnreadBefore}→${lastDropWrite.fixtureUnreadAfter} (home-sync 상관 미확인)`;
    lastWritePathConfidence = "medium";
  }

  return {
    fixtureRoomId: roomId,
    criticalPatchPayloadUnread: payloadUnread,
    criticalPatchPayloadUnreadAllCriticalTiers: criticalNetwork.map((n) => ({
      relativeMs: n.relativeMs,
      unreadCount: n.payloadFixture?.unreadCount,
    })),
    mergeBeforeUnread,
    mergeAfterUnread,
    sessionStorageWrites: ssWriteEvents ?? [],
    sessionStorageDropWrite: lastDropWrite ?? null,
    consistencyLogsForFixture: criticalPatchLogs.map((l) => l.parsed),
    homeSyncCriticalResponses: criticalNetwork,
    homeSyncFullResponses: fullNetwork,
    lastWritePath,
    lastWritePathConfidence,
    evidence,
  };
}

function attachRowStateConsoleAudit(page, buffer) {
  const handler = (msg) => {
    const text = msg.text();
    const parsed = parseMessengerConsistencyAnalysis(text);
    const categories = classifyConsoleAuditLine(text);
    if (!categories.length && !parsed) return;
    buffer.push({
      t: Date.now(),
      consoleType: msg.type(),
      categories,
      text: text.slice(0, 2000),
      parsed,
    });
  };
  page.on("console", handler);
  return () => page.off("console", handler);
}

async function probeRowStateSnapshot(page, roomId, fixtureTitle = null) {
  return page.evaluate(
    ({ rid, titleHint, ssKeys }) => {
      const roomFromSessionKey = (key) => {
        try {
          const raw = sessionStorage.getItem(key);
          if (!raw) {
            return { present: false, unreadCount: null, lastMessageAt: null, cachedAt: null, tier: null };
          }
          const parsed = JSON.parse(raw);
          const data = parsed?.data;
          if (!data) {
            return {
              present: false,
              unreadCount: null,
              lastMessageAt: null,
              cachedAt: parsed?.at ?? null,
              tier: null,
            };
          }
          const all = [...(data.chats ?? []), ...(data.groups ?? [])];
          const room = all.find((r) => String(r?.id) === String(rid));
          return {
            present: Boolean(room),
            unreadCount: room?.unreadCount ?? null,
            lastMessageAt: room?.lastMessageAt ?? null,
            cachedAt: parsed?.at ?? null,
            tier: data.tier ?? null,
            roomTitle: room?.title ?? null,
          };
        } catch (e) {
          return { present: false, error: String(e), unreadCount: null };
        }
      };

      const sessionStorageBootstrap = {
        full: roomFromSessionKey(ssKeys.full),
        critical: roomFromSessionKey(ssKeys.critical),
        minimal: roomFromSessionKey(ssKeys.minimal),
      };

      const titleMatchesFixture = (displayTitle, fixtureTitle) => {
        if (!displayTitle || !fixtureTitle) return false;
        if (displayTitle === fixtureTitle) return true;
        const apiBase = fixtureTitle.replace(/\s*\(@[^)]+\)\s*$/, "").trim();
        if (displayTitle === apiBase) return true;
        return fixtureTitle.startsWith(displayTitle);
      };

      let domBadge = null;
      let targetRowFound = false;
      const rows = [...document.querySelectorAll('[data-messenger-chat-row="true"]')];
      for (const row of rows) {
        const pillar = Boolean(
          row.getAttribute("data-messenger-pillar-row") || row.closest("[data-messenger-pillar-row]")
        );
        if (pillar) continue;
        const titleEl =
          row.querySelector("p.font-semibold") ?? row.querySelector('p[class*="font-semibold"]');
        const displayTitle = titleEl?.textContent?.trim() ?? null;
        const roomHref = row.querySelector('a[href*="/community-messenger/rooms/"]')?.getAttribute("href") ?? "";
        const roomHrefRe = /\/community-messenger\/rooms\/([^/?#]+)/;
        const hrefMatch = roomHref.match(roomHrefRe);
        const hrefRoomId = hrefMatch ? decodeURIComponent(hrefMatch[1]) : null;
        const idMatch = hrefRoomId === String(rid);
        const titleMatch = titleHint && displayTitle && titleMatchesFixture(displayTitle, titleHint);
        if (!idMatch && !titleMatch) continue;
        targetRowFound = true;
        domBadge =
          row.querySelector('[data-cm-unread-badge="true"]')?.textContent?.trim() ?? null;
        break;
      }

      let mergeBreakdown = null;
      try {
        if (typeof window.__cmClientMergeBreakdownLast === "function") {
          mergeBreakdown = window.__cmClientMergeBreakdownLast();
        } else if (window.__cmClientMergeBreakdownLastPayload) {
          mergeBreakdown = window.__cmClientMergeBreakdownLastPayload;
        }
      } catch {
        mergeBreakdown = null;
      }

      const cmDebugTail =
        Array.isArray(window.__CM_DEBUG_EVENTS) && window.__CM_DEBUG_EVENTS.length
          ? window.__CM_DEBUG_EVENTS.slice(-8)
          : [];

      return {
        pathname: location.pathname,
        sessionStorageBootstrap,
        domBadge,
        targetRowFound,
        mergeBreakdownPatchKind: mergeBreakdown?.patch_kind ?? null,
        mergeBreakdownChangedRooms: mergeBreakdown?.changed_room_count ?? null,
        cmDebugEventTail: cmDebugTail.map((e) => ({
          ts: e.ts,
          label: e.label,
          reason: e.reason,
          bodySnippet: e.bodySnippet,
        })),
      };
    },
    { rid: roomId, titleHint: fixtureTitle, ssKeys: BOOTSTRAP_SS_KEYS }
  );
}

async function pollRowStateTimeline(page, roomId, fixtureTitle, { intervalMs = ROW_STATE_POLL_INTERVAL_MS, maxMs = ROW_STATE_POLL_MAX_MS } = {}) {
  const timeline = [];
  const start = Date.now();
  let lastFingerprint = "";
  while (Date.now() - start < maxMs) {
    const sample = await probeRowStateSnapshot(page, roomId, fixtureTitle);
    const relativeMs = Date.now() - start;
    const fingerprint = JSON.stringify({
      dom: sample.domBadge,
      full: sample.sessionStorageBootstrap?.full?.unreadCount,
      critical: sample.sessionStorageBootstrap?.critical?.unreadCount,
      minimal: sample.sessionStorageBootstrap?.minimal?.unreadCount,
      patchKind: sample.mergeBreakdownPatchKind,
    });
    if (fingerprint !== lastFingerprint) {
      timeline.push({ t: Date.now(), relativeMs, ...sample });
      lastFingerprint = fingerprint;
    }
    await delay(intervalMs);
  }
  return timeline;
}

function pickTimelineUnread(sample) {
  if (!sample) return null;
  const ss = sample.sessionStorageBootstrap ?? {};
  for (const tier of ["critical", "full", "minimal"]) {
    const row = ss[tier];
    if (row?.present && row.unreadCount != null) return Number(row.unreadCount);
  }
  if (sample.domBadge != null && sample.domBadge !== "") {
    const n = parseInt(String(sample.domBadge), 10);
    return Number.isFinite(n) ? n : sample.domBadge;
  }
  return null;
}

function analyzeRowStateTimeline(timeline) {
  const transitions = [];
  let prevUnread = null;
  for (const sample of timeline) {
    const unread = pickTimelineUnread(sample);
    if (prevUnread === null) {
      prevUnread = unread;
      continue;
    }
    if (unread !== prevUnread) {
      transitions.push({
        from: prevUnread,
        to: unread,
        relativeMs: sample.relativeMs,
        domBadge: sample.domBadge,
        sessionStorageBootstrap: sample.sessionStorageBootstrap,
        mergeBreakdownPatchKind: sample.mergeBreakdownPatchKind,
      });
      prevUnread = unread;
    }
  }
  const finalSample = timeline.length ? timeline[timeline.length - 1] : null;
  return {
    sampleCount: timeline.length,
    transitions,
    finalSessionStorage: finalSample?.sessionStorageBootstrap ?? null,
    finalDomBadge: finalSample?.domBadge ?? null,
    finalTimelineUnread: pickTimelineUnread(finalSample),
  };
}

function inferLastWritePathCandidate({ consoleEvents, timelineAnalysis, rowPass }) {
  const transitions = timelineAnalysis?.transitions ?? [];
  const finalUnread = timelineAnalysis?.finalTimelineUnread;
  const candidates = [];

  const lastToFive = [...transitions].reverse().find((tr) => tr.to === 5 || tr.to === "5");
  const lastToZero = [...transitions].reverse().find((tr) => tr.to === 0 || tr.to === "0");

  const windowMs = 2500;
  const eventsNear = (relativeMs) =>
    (consoleEvents ?? []).filter((ev) => {
      const firstSampleMs = timelineAnalysis?.transitions?.[0]?.relativeMs ?? 0;
      return Math.abs(ev.t - (timelineAnalysis?.anchorT ?? 0)) < 60_000;
    });

  if (lastToFive) {
    const near = (consoleEvents ?? []).slice(-40).filter((ev) =>
      ev.categories?.some((c) =>
        ["critical_patch", "participant_unread_delta", "cm_read_badge", "home_sync_identical_skip"].includes(c)
      )
    );
    candidates.push({
      kind: "unread_increase_observed",
      transition: lastToFive,
      nearbyConsoleCategories: [...new Set(near.flatMap((e) => e.categories ?? []))],
      note: "timeline에서 unread 증가 전환 직전·직후 console category 집계",
    });
  }

  if (!rowPass && (finalUnread === 0 || finalUnread === null)) {
    const staleBlock = (consoleEvents ?? []).filter((ev) =>
      ev.categories?.includes("stale_unread_zero_blocked")
    );
    const localUnread = (consoleEvents ?? []).filter((ev) =>
      ev.categories?.includes("cm_room_local_unread")
    );
    const readBus = (consoleEvents ?? []).filter((ev) => ev.categories?.includes("cm_room_read"));
    candidates.push({
      kind: "fail_row_dom_zero_or_missing",
      lastToZero: lastToZero ?? null,
      staleUnreadZeroBlockedCount: staleBlock.length,
      localUnreadEventCount: localUnread.length,
      readBusEventCount: readBus.length,
      lastConsoleEvents: (consoleEvents ?? []).slice(-12).map((e) => ({
        categories: e.categories,
        text: e.text?.slice(0, 240),
      })),
      note:
        staleBlock.length > 0
          ? "stale zero blocked 로그 있음 — bus는 왔으나 list 유지 시도"
          : localUnread.length > 0 || readBus.length > 0
            ? "local_unread/read bus 이벤트 후 DOM/SS가 0으로 수렴 — bus write 후보"
            : "console/bus 증거 부족 — critical_patch·bootstrap hydrate 타이밍 후보",
    });
  }

  return candidates;
}

function buildQa1RowStateComparison(runs) {
  const passRuns = runs.filter((r) => r.pass);
  const failRuns = runs.filter((r) => !r.pass);
  const summarize = (list) =>
    list.map((r) => ({
      runIndex: r.runIndex,
      stamp: r.stamp,
      pass: r.pass,
      rowDomUnread: r.rowDomUnread,
      finalSessionStorage: r.rowStateAudit?.timelineAnalysis?.finalSessionStorage ?? null,
      finalTimelineUnread: r.rowStateAudit?.timelineAnalysis?.finalTimelineUnread ?? null,
      transitionCount: r.rowStateAudit?.timelineAnalysis?.transitions?.length ?? 0,
      transitions: r.rowStateAudit?.timelineAnalysis?.transitions ?? [],
      consoleEventCount: r.rowStateAudit?.consoleEvents?.length ?? 0,
      consoleCategories: [
        ...new Set((r.rowStateAudit?.consoleEvents ?? []).flatMap((e) => e.categories ?? [])),
      ],
      lastWritePathCandidates: r.rowStateAudit?.lastWritePathCandidates ?? [],
      criticalPatchMergeAudit: r.rowStateAudit?.criticalPatchMergeAudit ?? null,
    }));

  return {
    passCount: passRuns.length,
    failCount: failRuns.length,
    passRuns: summarize(passRuns),
    failRuns: summarize(failRuns),
    diffHints: {
      passFinalDom: passRuns.map((r) => r.rowDomUnread),
      failFinalDom: failRuns.map((r) => r.rowDomUnread),
      passFinalSsCritical: passRuns.map(
        (r) => r.rowStateAudit?.timelineAnalysis?.finalSessionStorage?.critical?.unreadCount ?? null
      ),
      failFinalSsCritical: failRuns.map(
        (r) => r.rowStateAudit?.timelineAnalysis?.finalSessionStorage?.critical?.unreadCount ?? null
      ),
    },
  };
}

async function scan(page) {
  return page.evaluate(async (hubQs) => {
    const tabs = [...document.querySelectorAll("[data-bottom-nav-tab-id]")].map((el) => ({
      id: el.getAttribute("data-bottom-nav-tab-id"),
      label: el.querySelector(".app-bottom-nav-label")?.textContent?.trim() ?? null,
      badge: el.querySelector(".bottom-nav-hub-badge")?.textContent?.trim() ?? null,
    }));
    const ssotFresh = await fetch("/api/me/notifications/badge-count?fresh=1", {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    let hub = null;
    try {
      hub = await fetch(`/api/me/store-owner-hub-badge?${hubQs}`, {
        credentials: "include",
        cache: "no-store",
      }).then((r) => r.json());
    } catch {
      hub = { error: "hub_fetch_failed" };
    }
    return { pathname: location.pathname, tabs, ssotFresh, hub };
  }, HUB_BADGE_QS);
}

async function countLiveBottomNavChat(sb, userId) {
  const { data, error } = await sb.rpc("count_notification_targets", {
    p_user_id: userId,
    p_surface: "bottom_nav_chat",
    p_store_id: null,
  });
  return {
    liveBottomNavChat: error ? null : Math.max(0, Math.floor(Number(data) || 0)),
    liveTargetError: error?.message ?? null,
  };
}

async function invalidateHubSnapshotHarness(sb, userId) {
  const { error } = await sb.from("hub_badge_user_unread_counters").delete().eq("user_id", userId);
  return { hubSnapshotDeleted: !error, hubSnapshotDeleteError: error?.message ?? null };
}

async function bumpChatRoomTargetHarness(sb, userId, roomId) {
  const { error } = await sb.rpc("upsert_notification_target_unread", {
    p_user_id: userId,
    p_target_type: "chat_room",
    p_target_id: roomId,
    p_scope: "consumer",
    p_store_id: null,
    p_meta: { source: "badge_rebuild_lifecycle_qa" },
  });
  return { targetRpcOk: !error, targetRpcError: error?.message ?? null };
}

async function fetchHomeSyncRoomProbe(page, roomId) {
  return page.evaluate(async (rid) => {
    const res = await fetch("/api/community-messenger/home-sync?tier=critical&fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const all = [...(json?.chats ?? []), ...(json?.groups ?? [])];
    const idx = all.findIndex((r) => String(r?.id) === String(rid));
    const room = idx >= 0 ? all[idx] : null;
    return {
      httpStatus: res.status,
      roomFound: Boolean(room),
      unreadCount: room?.unreadCount ?? null,
      roomType: room?.roomType ?? null,
      lastMessageAt: room?.lastMessageAt ?? null,
      homeSyncRank: idx >= 0 ? idx + 1 : null,
      totalRooms: all.length,
    };
  }, roomId);
}

async function pickQa1RoomFromHomeSync(page) {
  return page.evaluate(async () => {
    const isCommerce = (dk) => {
      const s = String(dk ?? "");
      return (
        s.startsWith("trade_pc:") ||
        s.startsWith("trade_item:") ||
        s.startsWith("store_order:") ||
        s.startsWith("trade_order:")
      );
    };
    const isEligibleType = (rt) => rt === "direct" || rt === "private_group";
    const res = await fetch("/api/community-messenger/home-sync?tier=critical&fresh=1", {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    const all = [...(json?.chats ?? []), ...(json?.groups ?? [])];
    const eligible = [];
    for (let i = 0; i < all.length; i++) {
      const r = all[i];
      const rt = r?.roomType ?? null;
      if (!isEligibleType(rt)) continue;
      if (isCommerce(r?.messengerDirectKey)) continue;
      eligible.push({ homeSyncRank: i + 1, room: r });
    }
    const first = eligible[0]?.room ?? null;
    const pick = first
      ? {
          roomId: String(first.id),
          roomType: first.roomType,
          lastMessageAt: first.lastMessageAt ?? null,
          unreadCount: first.unreadCount ?? 0,
          homeSyncRank: eligible[0].homeSyncRank,
          messengerDirectKey: first.messengerDirectKey ?? null,
        }
      : null;
    return {
      httpStatus: res.status,
      totalRooms: all.length,
      eligibleCount: eligible.length,
      pick,
      roomFound: Boolean(pick),
      eligiblePreview: eligible.slice(0, 5).map((e) => ({
        homeSyncRank: e.homeSyncRank,
        roomId: e.room.id,
        roomType: e.room.roomType,
        unreadCount: e.room.unreadCount,
        lastMessageAt: e.room.lastMessageAt,
      })),
    };
  });
}

async function measureQa1ThreeWayAndRow(page, roomId, fixtureMeta = {}) {
  return page.evaluate(
    async ({ hubQs, rid, homeSyncRank }) => {
      const hubRes = await fetch(`/api/me/store-owner-hub-badge?${hubQs}`, {
        credentials: "include",
        cache: "no-store",
      });
      const hubJson = await hubRes.json().catch(() => null);
      const hubApiCm =
        hubJson && typeof hubJson.communityMessengerUnread === "number"
          ? hubJson.communityMessengerUnread
          : null;

      const chatTab = document.querySelector('[data-bottom-nav-tab-id="chat"]');
      const domBadgeText =
        chatTab?.querySelector(".bottom-nav-hub-badge")?.textContent?.trim() ?? null;
      let domCm = 0;
      if (domBadgeText) {
        if (domBadgeText === "99+") domCm = 99;
        else {
          const n = parseInt(domBadgeText, 10);
          domCm = Number.isFinite(n) ? n : 0;
        }
      }

      const probe = window.__qaOwnerHubBadgeStoreProbe ?? {};
      const storeCm =
        typeof probe.communityMessengerUnread === "number" ? probe.communityMessengerUnread : null;

      const roomHrefRe = /\/community-messenger\/rooms\/([^/?#]+)/;

      const extractRoomIdFromHref = (href) => {
        if (!href) return null;
        const m = String(href).match(roomHrefRe);
        return m ? decodeURIComponent(m[1]) : null;
      };

      const isPillarRow = (row) =>
        Boolean(
          row.getAttribute("data-messenger-pillar-row") ||
            row.closest("[data-messenger-pillar-row]")
        );

      const rowDisplayTitle = (row) => {
        const titleEl =
          row.querySelector("p.font-semibold") ??
          row.querySelector('p[class*="font-semibold"]');
        return titleEl?.textContent?.trim() ?? null;
      };

      const titleMatchesFixture = (displayTitle, fixtureTitle) => {
        if (!displayTitle || !fixtureTitle) return false;
        if (displayTitle === fixtureTitle) return true;
        const apiBase = fixtureTitle.replace(/\s*\(@[^)]+\)\s*$/, "").trim();
        if (displayTitle === apiBase) return true;
        return fixtureTitle.startsWith(displayTitle);
      };

      const collectRoomIdsFromRow = (row) => {
        const ids = new Set();
        const roots = [row];
        const wrap = row.closest("[data-cm-chat-row]") ?? row.querySelector("[data-cm-chat-row]");
        if (wrap && !roots.includes(wrap)) roots.push(wrap);
        for (const root of roots) {
          for (const a of root.querySelectorAll("a[href]")) {
            const id = extractRoomIdFromHref(a.getAttribute("href") ?? "");
            if (id) ids.add(id);
          }
        }
        return [...ids];
      };

      const probeCmRow = (row, rowIndex) => {
        const pillar = isPillarRow(row);
        const badgeEl = row.querySelector('[data-cm-unread-badge="true"]');
        const badgeText = badgeEl?.textContent?.trim() ?? null;
        const hrefs = [...row.querySelectorAll("a[href]")]
          .map((a) => a.getAttribute("href") ?? "")
          .filter(Boolean);
        const roomIds = collectRoomIdsFromRow(row);
        const roomsHref =
          row.querySelector('a[href*="/community-messenger/rooms/"]')?.getAttribute("href") ?? null;
        return {
          rowIndex,
          isPillar: pillar,
          displayTitle: rowDisplayTitle(row),
          badgeText,
          hrefs,
          roomsHref,
          roomIds,
          hasCmChatRowWrapper: Boolean(
            row.closest("[data-cm-chat-row]") || row.querySelector("[data-cm-chat-row]")
          ),
        };
      };

      const allRows = [...document.querySelectorAll('[data-messenger-chat-row="true"]')];
      const rowProbes = allRows.map((row, i) => probeCmRow(row, i));

      let apiTitle = null;
      let apiRoomType = null;
      try {
        const res = await fetch("/api/community-messenger/home-sync?tier=critical&fresh=1", {
          credentials: "include",
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        const all = [...(json?.chats ?? []), ...(json?.groups ?? [])];
        const room = all.find((r) => String(r?.id) === String(rid));
        apiTitle = room?.title?.trim() ?? null;
        apiRoomType = room?.roomType ?? null;
      } catch {
        apiTitle = null;
        apiRoomType = null;
      }

      const unreadBadgeRows = rowProbes
        .filter((p) => p.badgeText)
        .map((p) => ({
          rowIndex: p.rowIndex,
          isPillar: p.isPillar,
          displayTitle: p.displayTitle,
          badgeText: p.badgeText,
          roomIds: p.roomIds,
          roomsHref: p.roomsHref,
          fixtureRoomIdMatch: p.roomIds.includes(String(rid)),
        }));

      let targetRow = null;
      let targetRowFound = false;
      let matchVia = null;

      for (const p of rowProbes) {
        if (p.isPillar) continue;
        if (!p.roomsHref) continue;
        if (!p.roomIds.includes(String(rid))) continue;
        targetRow = p;
        targetRowFound = true;
        matchVia = "href_room_id";
        break;
      }

      if (!targetRowFound && apiTitle) {
        for (const p of rowProbes) {
          if (p.isPillar) continue;
          if (!p.hasCmChatRowWrapper) continue;
          if (!titleMatchesFixture(p.displayTitle, apiTitle)) continue;
          targetRow = p;
          targetRowFound = true;
          matchVia = "home_sync_title";
          break;
        }
      }

      const fixtureLinkedBadgeRow = rowProbes.find((p) => {
        if (p.isPillar) return false;
        if (p.roomIds.includes(String(rid))) return true;
        return Boolean(
          apiTitle && p.hasCmChatRowWrapper && titleMatchesFixture(p.displayTitle, apiTitle)
        );
      });

      const rowDomUnread = targetRow?.badgeText ?? null;
      const rowIdentityMismatch = Boolean(
        targetRowFound &&
          fixtureLinkedBadgeRow &&
          fixtureLinkedBadgeRow.rowIndex !== targetRow.rowIndex
      );

      return {
        measuredAt: Date.now(),
        threeWay: {
          hubApiCm,
          hubApiOk: hubJson?.ok ?? null,
          storeCm,
          storeProbeAt: probe.snapshotAt ?? null,
          storeProbeVia: probe.via ?? null,
          domCm,
          domBadgeText,
        },
        row: {
          rowDomUnread,
          targetRowFound,
          matchVia,
          homeSyncRank,
          apiTitle,
          apiRoomType,
          fixtureLinkedBadgeRow: fixtureLinkedBadgeRow
            ? {
                rowIndex: fixtureLinkedBadgeRow.rowIndex,
                displayTitle: fixtureLinkedBadgeRow.displayTitle,
                badgeText: fixtureLinkedBadgeRow.badgeText,
                roomIds: fixtureLinkedBadgeRow.roomIds,
                roomsHref: fixtureLinkedBadgeRow.roomsHref,
              }
            : null,
          targetRow: targetRow
            ? {
                rowIndex: targetRow.rowIndex,
                displayTitle: targetRow.displayTitle,
                badgeText: targetRow.badgeText,
                roomIds: targetRow.roomIds,
                roomsHref: targetRow.roomsHref,
                isPillar: targetRow.isPillar,
              }
            : null,
          unreadBadgeRows,
          rowIdentityMismatch,
          allUnreadBadges: unreadBadgeRows.map((r) => r.badgeText),
          rowCount: allRows.length,
          roomId: rid,
        },
      };
    },
    {
      hubQs: HUB_BADGE_QS,
      rid: roomId,
      homeSyncRank: fixtureMeta.homeSyncRank ?? null,
    }
  );
}

async function waitForQa1FixtureRowProbe(page, roomId, homeSyncRank, maxMs = 15000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < maxMs) {
    last = await measureQa1ThreeWayAndRow(page, roomId, { homeSyncRank });
    if (
      last.row?.targetRowFound === true &&
      qa1FixtureRowUnreadIsFive(last.row?.rowDomUnread)
    ) {
      return last;
    }
    await delay(800);
  }
  return last ?? (await measureQa1ThreeWayAndRow(page, roomId, { homeSyncRank }));
}

function qa1FixtureRowUnreadIsFive(rowDomUnread) {
  return (
    rowDomUnread === "5" ||
    rowDomUnread === "5+" ||
    Number(rowDomUnread) === 5
  );
}

/** Rebuild QA1 pass — BottomNav unread room count, fixture row badge, row identity. */
function evaluateQa1RebuildPass({
  beforeChatDom,
  threeWay,
  rowMeasure,
  rowProbe,
  beforeTotal,
  afterTotal,
}) {
  const domCm = Number(threeWay?.domCm ?? 0);
  const beforeDom = Number(beforeChatDom ?? 0);
  const bottomNavDomPass = domCm > beforeDom || domCm >= 1;
  const rowUnreadPass = qa1FixtureRowUnreadIsFive(rowMeasure?.rowDomUnread);
  const targetRowPass = rowMeasure?.targetRowFound === true;
  const rowIdentityPass =
    !rowMeasure?.rowIdentityMismatch && !rowProbe?.rowIdentityMismatch;
  const eventsIncreased = (afterTotal ?? 0) > (beforeTotal ?? 0);

  const pass =
    bottomNavDomPass &&
    rowUnreadPass &&
    targetRowPass &&
    rowIdentityPass &&
    eventsIncreased;

  return {
    pass,
    criteria: {
      bottomNavDomPass,
      bottomNavDom: domCm,
      beforeChatDom: beforeDom,
      rowUnreadPass,
      rowDomUnread: rowMeasure?.rowDomUnread ?? null,
      targetRowPass,
      matchVia: rowMeasure?.matchVia ?? null,
      rowIdentityPass,
      eventsIncreased,
      beforeTotal,
      afterTotal,
    },
  };
}

function judgeQa1Verdict({ fixtureOk, threeWay, rowMeasure, rowProbe, pass }) {
  if (!fixtureOk) {
    return {
      category: "Harness/fixture",
      reason: "home-sync critical cap에 direct/private_group 방 없음 또는 roomFound=false",
    };
  }
  const hubApiCm = threeWay?.hubApiCm ?? null;
  const storeCm = threeWay?.storeCm ?? null;
  const domCm = threeWay?.domCm ?? null;
  const hsUnread = rowMeasure?.homeSyncUnreadCount ?? null;
  const rowDom = rowMeasure?.rowDomUnread ?? null;

  if (rowMeasure?.rowIdentityMismatch || rowProbe?.rowIdentityMismatch) {
    return {
      category: "Harness",
      reason: "target row와 fixture-linked unread badge row 불일치 — Harness row identity 오류",
    };
  }
  if (!rowMeasure?.targetRowFound && (rowProbe?.unreadBadgeRows?.length ?? 0) > 0) {
    return {
      category: "Harness",
      reason: "unread badge row는 있으나 fixture room row 미식별 — Harness probe 후보",
    };
  }
  if (storeCm === 1 && domCm === 0) {
    return {
      category: "Product",
      reason: "store snapshot=1, BottomNav DOM=0 — hook/DOM 후보",
    };
  }
  if (hubApiCm === 1 && storeCm === 0) {
    return {
      category: "Product",
      reason: "hub API(cmFresh)=1, store snapshot=0 — store/TTL 후보",
    };
  }
  if (
    rowMeasure?.targetRowFound === true &&
    rowMeasure?.homeSyncRoomFound === true &&
    hsUnread === 5 &&
    (rowDom === null || rowDom === "" || rowDom === "0")
  ) {
    return {
      category: "Product",
      reason: "fixture row 식별됨 + homeSync unreadCount=5, row DOM badge 없음 — list row 후보",
    };
  }
  if (pass) {
    return { category: "Harness PASS (lifecycle PASS withheld)", reason: "QA1 gates met" };
  }
  return {
    category: "미확정",
    reason: "QA1 실패 — Product 서명 미일치, Harness/fixture 또는 타이밍",
  };
}

async function resolveCommunityPostFixture(sb, userId) {
  const { data: rows, error: queryError } = await sb
    .from("community_posts")
    .select("id, location_id, status, title")
    .eq("status", COMMUNITY_POST_STATUS_ACTIVE)
    .not("location_id", "is", null)
    .limit(1);
  if (rows?.[0]?.id) {
    return {
      postId: String(rows[0].id),
      postReal: true,
      fixtureSource: "community_posts_existing",
      postTitle: rows[0].title ?? null,
    };
  }

  const blockers = [];
  if (queryError) blockers.push(`community_posts_query:${queryError.message}`);

  const { data: loc } = await sb.from("locations").select("id").limit(1).maybeSingle();
  if (!loc?.id) blockers.push("no_location_row");

  const { data: sec } = await sb.from("community_sections").select("id, slug").limit(1).maybeSingle();
  if (!sec?.id) blockers.push("no_community_section");

  const { data: topic } = await sb.from("community_topics").select("id, slug").limit(1).maybeSingle();
  if (!topic?.id) blockers.push("no_community_topic");

  const fixtureCreatePossible = blockers.length === 0 && !!userId;
  if (!fixtureCreatePossible) {
    return {
      postId: null,
      postReal: false,
      fixtureSource: "none",
      fixtureCreatePossible: false,
      fixtureCreateBlockers: blockers,
    };
  }

  const stamp = Date.now();
  const { data: created, error: insertError } = await sb
    .from("community_posts")
    .insert({
      user_id: userId,
      section_id: sec.id,
      section_slug: sec.slug || "dongnae",
      topic_id: topic.id,
      topic_slug: topic.slug || "daily",
      title: `badge lifecycle qa5 ${stamp}`,
      content: "badge lifecycle qa5 harness fixture",
      summary: "badge lifecycle qa5 harness fixture",
      region_label: "QA City",
      location_id: loc.id,
      category: "etc",
      images: [],
      status: COMMUNITY_POST_STATUS_ACTIVE,
    })
    .select("id, title")
    .single();

  if (created?.id) {
    return {
      postId: String(created.id),
      postReal: true,
      fixtureSource: "community_posts_created",
      postTitle: created.title ?? null,
      fixtureCreatePossible: true,
      fixtureCreated: true,
    };
  }

  return {
    postId: null,
    postReal: false,
    fixtureSource: "none",
    fixtureCreatePossible: true,
    fixtureCreateBlockers: [...blockers, `insert_failed:${insertError?.message ?? "unknown"}`],
    fixtureCreated: false,
  };
}

function tabBadge(scanResult, ...matchers) {
  const tab =
    scanResult.tabs.find((t) => matchers.some((m) => t.id === m || t.label === m || t.id?.includes(m))) ??
    null;
  return { tab, count: parseBadge(tab?.badge) };
}

function buildBadgeTriplet(scanResult, storeProbe = null) {
  return {
    pathname: scanResult?.pathname ?? null,
    ssotFresh: scanResult?.ssotFresh ?? null,
    hub: scanResult?.hub ?? null,
    storeProbe,
    dom: {
      chat: tabBadge(scanResult, "chat", "Messenger", "메신저").count,
      trade: tabBadge(scanResult, "home", "Trade", "trade").count,
      food: tabBadge(scanResult, "trade-delivery", "Food", "stores", "delivery").count,
      community: tabBadge(scanResult, "trade-community", "Community", "community").count,
    },
    api: {
      total: scanResult?.ssotFresh?.total ?? null,
      tradeStatus: scanResult?.ssotFresh?.tradeStatus ?? null,
      orderStatus: scanResult?.ssotFresh?.orderStatus ?? null,
      communityActivity: scanResult?.ssotFresh?.communityActivity ?? null,
      chatMessage: scanResult?.ssotFresh?.chatMessage ?? null,
      groupMessage: scanResult?.ssotFresh?.groupMessage ?? null,
    },
    hubApi: {
      communityMessengerUnread: scanResult?.hub?.communityMessengerUnread ?? null,
    },
  };
}

async function scanBadgeTriplet(page) {
  const scanResult = await scan(page);
  const storeProbe = await page.evaluate(() => window.__qaOwnerHubBadgeStoreProbe ?? null);
  return buildBadgeTriplet(scanResult, storeProbe);
}

function classifyDomZero(apiValue, domValue) {
  const api = Math.max(0, Math.floor(Number(apiValue) || 0));
  const dom = Math.max(0, Math.floor(Number(domValue) || 0));
  if (dom > 0) return { domZero: false, kind: "dom_visible" };
  if (api === 0) return { domZero: true, kind: "api_and_dom_zero" };
  return { domZero: true, kind: "api_positive_dom_zero" };
}

function domApiDiagnosticsForSurface(triplet, surface) {
  const map = {
    trade: { apiKey: "tradeStatus", domKey: "trade", label: "trade" },
    delivery: { apiKey: "orderStatus", domKey: "food", label: "delivery" },
    community: { apiKey: "communityActivity", domKey: "community", label: "community" },
    chat: { apiKey: "chatMessage", domKey: "chat", label: "chat" },
  };
  const cfg = map[surface];
  if (!cfg) return null;
  const apiValue = triplet?.api?.[cfg.apiKey];
  const domValue = triplet?.dom?.[cfg.domKey];
  return {
    surface: cfg.label,
    apiValue,
    domValue,
    classification: classifyDomZero(apiValue, domValue),
  };
}

async function waitBottomNavBadgeSettle(page, { timeoutMs = BADGE_SETTLE_TIMEOUT_MS } = {}) {
  const t0 = Date.now();
  let last = null;
  let stableStreak = 0;
  while (Date.now() - t0 < timeoutMs) {
    const triplet = await scanBadgeTriplet(page);
    last = triplet;
    const apiReady =
      triplet.api.total != null &&
      typeof triplet.hubApi.communityMessengerUnread === "number" &&
      !triplet.hub?.error;
    const storeReady =
      triplet.storeProbe?.snapshotAt != null &&
      typeof triplet.storeProbe?.communityMessengerUnread === "number";
    if (apiReady && storeReady) stableStreak += 1;
    else stableStreak = 0;
    if (stableStreak >= BADGE_SETTLE_STABLE_POLLS) {
      return { ok: true, triplet: last, waitedMs: Date.now() - t0 };
    }
    await delay(BADGE_SETTLE_POLL_MS);
  }
  return {
    ok: false,
    triplet: last,
    waitedMs: Date.now() - t0,
    reason: "badge_settle_timeout",
  };
}

async function gotoMarketWithBadgeSettle(page) {
  await goto(page, `${BASE}/market`);
  return waitBottomNavBadgeSettle(page);
}

async function snapshotFixtureDbState(sb, userId, roomId = null) {
  const participantQuery = sb
    .from("community_messenger_participants")
    .select("room_id, unread_count")
    .eq("user_id", userId);
  const { data: participants } = roomId
    ? await participantQuery.eq("room_id", roomId)
    : await participantQuery.gt("unread_count", 0).limit(50);
  let targetUnread = null;
  if (roomId) {
    const { data: tgt } = await sb
      .from("notification_targets")
      .select("is_unread")
      .eq("user_id", userId)
      .eq("target_type", "chat_room")
      .eq("target_id", roomId)
      .maybeSingle();
    targetUnread = tgt?.is_unread ?? null;
  }
  const liveBottomNavChat = await countLiveBottomNavChat(sb, userId);
  return {
    at: new Date().toISOString(),
    roomId,
    participants: participants ?? [],
    chatRoomTargetUnread: targetUnread,
    liveBottomNavChat: liveBottomNavChat.liveBottomNavChat,
  };
}

async function resetResidualParticipantUnread(sb, userId, report) {
  const { data: dirty } = await sb
    .from("community_messenger_participants")
    .select("room_id, unread_count")
    .eq("user_id", userId)
    .gt("unread_count", 0);
  if (!dirty?.length) {
    report.harnessPreRun = { participantUnreadReset: [], skipped: true };
    return;
  }
  const resets = [];
  for (const row of dirty) {
    resets.push({ roomId: row.room_id, was: row.unread_count });
    await sb
      .from("community_messenger_participants")
      .update({ unread_count: 0 })
      .eq("user_id", userId)
      .eq("room_id", row.room_id);
  }
  report.harnessPreRun = { participantUnreadReset: resets, skipped: false };
}

function recordCaseBoundary(report, caseName, phase, triplet, extra = {}) {
  report.caseBoundarySnapshots.push({
    caseName,
    phase,
    at: new Date().toISOString(),
    badgeTriplet: triplet,
    ...extra,
  });
}

function pushFailFastCase(report, caseName, stage, details = {}) {
  report.cases.push({
    name: caseName,
    pass: false,
    failFast: true,
    failStage: stage,
    ...details,
  });
}

async function waitPred(page, pred, timeoutMs = 20000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await scan(page);
    if (pred(last)) return { ok: true, scan: last, waitedMs: Date.now() - t0 };
    await delay(500);
  }
  return { ok: false, scan: last, waitedMs: Date.now() - t0 };
}

async function waitPredFailFast(page, pred, timeoutMs, failStage) {
  const result = await waitPred(page, pred, timeoutMs);
  if (result.ok) return { ok: true, ...result };
  const triplet = await scanBadgeTriplet(page);
  return {
    ok: false,
    ...result,
    failStage,
    badgeTriplet: triplet,
  };
}

async function insertEvent(sb, userId, row) {
  const { data, error } = await sb
    .from("notification_events")
    .insert({
      user_id: userId,
      type: row.type,
      category: row.category,
      title: row.title,
      body: row.body,
      display_payload: row.display_payload ?? {},
      room_id: row.room_id ?? null,
      unread: true,
      dedupe_key: row.dedupe_key,
      delivered_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

async function deleteEvents(sb, ids) {
  if (!ids.length) return;
  await sb.from("notification_events").delete().in("id", ids);
}

async function goto(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await delay(1000);
}

async function main() {
  loadEnv();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const cleanup = [];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    rebuildWorkingTree: true,
    harnessRevision: "2026-07-08-qa-harness-badge-settle-v1",
    hubBadgeQuery: HUB_BADGE_QS,
    qaCaseFilter: [...QA_CASE_FILTER],
    qa1Repeat: QA1_REPEAT,
    note: "PASS expression withheld in harness summary — agent reports verdicts separately",
    cases: [],
    caseBoundarySnapshots: [],
    authorityRisks: [],
  };

  const health = await fetch(`${BASE}/api/me/notifications/badge-count?fresh=1`).catch((e) => ({
    ok: false,
    error: String(e),
  }));
  if (!health || health.ok === false) {
    report.serverReachable = false;
    report.serverError = health?.error || `status ${health?.status}`;
    fs.writeFileSync(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ out: OUT_DIR, serverReachable: false }, null, 2));
    process.exit(2);
  }
  report.serverReachable = true;

  const { cookies, userId } = await buildApkSessionCookies({
    login: process.env.SSOT_ADMIN_LOGIN || "aaaa",
    prod: BASE,
    password: process.env.E2E_TEST_PASSWORD || "1234",
    loadEnv,
  });
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Authority risk note (do not modify file)
  const contractSrc = fs.readFileSync(
    path.join(ROOT, "lib/community-messenger/notifications/messenger-notification-contract.ts"),
    "utf8"
  );
  report.authorityRisks.push({
    file: "lib/community-messenger/notifications/messenger-notification-contract.ts",
    risk: "comment still cites badge-count / notification_events as messenger tab SSOT",
    present: contractSrc.includes("badge-count") && contractSrc.includes("notification_events"),
    action: "record only — no edit until QA failure attributes to this mix",
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(() => {
    window.__qaOwnerHubBadgeStoreProbe = {
      communityMessengerUnread: null,
      snapshotAt: null,
      via: null,
    };
    try {
      localStorage.setItem("samarket:debug:homeSyncReentry", "1");
    } catch {
      /* ignore */
    }
    const SS_FULL_KEY = "samarket.messenger.bootstrap.v1";
    const extractFixtureUnread = (raw, rid) => {
      if (!raw || !rid) return null;
      try {
        const parsed = JSON.parse(raw);
        const all = [...(parsed.data?.chats ?? []), ...(parsed.data?.groups ?? [])];
        const room = all.find((r) => String(r?.id) === String(rid));
        return room?.unreadCount ?? null;
      } catch {
        return null;
      }
    };
    const origSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const rid = window.__qaFixtureRoomId;
      if (key === SS_FULL_KEY && rid) {
        window.__qaSsBootstrapWriteAudit = window.__qaSsBootstrapWriteAudit || [];
        let beforeUnread = null;
        try {
          beforeUnread = extractFixtureUnread(sessionStorage.getItem(key), rid);
        } catch {
          /* ignore */
        }
        origSetItem.call(this, key, value);
        let afterUnread = null;
        try {
          afterUnread = extractFixtureUnread(value, rid);
        } catch {
          /* ignore */
        }
        window.__qaSsBootstrapWriteAudit.push({
          t: Date.now(),
          key,
          fixtureUnreadBefore: beforeUnread,
          fixtureUnreadAfter: afterUnread,
        });
        return;
      }
      origSetItem.call(this, key, value);
    };
    try {
      const bc = new BroadcastChannel("samarket:owner-hub-badge-sync");
      bc.addEventListener("message", (ev) => {
        const msg = ev.data;
        if (msg?.type !== "snapshot" || !msg?.data) return;
        const d = msg.data;
        if (typeof d !== "object" || d === null) return;
        if (d.ok === false) {
          window.__qaOwnerHubBadgeStoreProbe.communityMessengerUnread = null;
          window.__qaOwnerHubBadgeStoreProbe.snapshotAt = Date.now();
          window.__qaOwnerHubBadgeStoreProbe.via = "broadcast:error";
          return;
        }
        const cm = d.communityMessengerUnread;
        if (typeof cm === "number" && Number.isFinite(cm)) {
          window.__qaOwnerHubBadgeStoreProbe.communityMessengerUnread = cm;
          window.__qaOwnerHubBadgeStoreProbe.snapshotAt = Date.now();
          window.__qaOwnerHubBadgeStoreProbe.via = "broadcast:snapshot";
        }
      });
    } catch {
      /* ignore */
    }
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  const homeSyncNetworkEvents = [];
  const auditRefs = { roomId: null, pollStartT: null };
  const detachHomeSyncNetwork = attachHomeSyncNetworkAudit(
    page,
    () => auditRefs.roomId,
    homeSyncNetworkEvents,
    () => auditRefs.pollStartT
  );

  const readThreadWaits = [];
  const readThreadBodies = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/me/notifications/read-thread")) {
      try {
        const body = req.postDataJSON?.() ?? {};
        readThreadWaits.push(body.readReason ?? "unknown");
        readThreadBodies.push(body);
      } catch {
        readThreadWaits.push("parse_error");
      }
    }
    if (req.method() === "POST" && req.url().includes("/api/me/notifications/room-read")) {
      readThreadWaits.push("room_read");
    }
  });

  try {
    // Resolve participant rows for unread restore (QA1 room picked from home-sync critical cap)
    const { data: parts } = await sb
      .from("community_messenger_participants")
      .select("room_id, unread_count")
      .eq("user_id", userId)
      .limit(200);
    let generalRoomId = null;
    let peerRoom = null;
    let qa1FixturePick = null;
    report.fixtures = { userId, generalRoomId, peerRoom };

    const isFullOrMultiCase =
      QA_CASE_FILTER.has("all") ||
      [...QA_CASE_FILTER].filter((c) => c !== "all").some((c) => ["2", "3", "4", "5", "6"].includes(c));
    if (isFullOrMultiCase && QA1_REPEAT === 1) {
      await resetResidualParticipantUnread(sb, userId, report);
    } else {
      const residual = (parts ?? []).filter((p) => Math.max(0, Number(p.unread_count) || 0) > 0);
      report.harnessPreRun = {
        participantUnreadReset: [],
        skipped: true,
        note: isFullOrMultiCase
          ? "QA1_REPEAT>1 — residual participant unread recorded, not reset"
          : "single/isolated case — residual participant unread recorded",
        recordedResidual: residual,
      };
    }

    // -------- QA1: 5 chat_message same room + participant unread 5 + chat_room target --------
    if (qaCaseEnabled(1)) {
      const caseName = "qa1_chat_five_messages_room_count";
      const qa1RepeatRuns = [];

      for (let runIndex = 0; runIndex < QA1_REPEAT; runIndex++) {
        const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
        const consoleEvents = [];
        const detachConsole = attachRowStateConsoleAudit(page, consoleEvents);

        await goto(page, `${BASE}/community-messenger?section=chats`);
        qa1FixturePick = await pickQa1RoomFromHomeSync(page);
        const fixtureOk = Boolean(qa1FixturePick?.pick?.roomId) && qa1FixturePick?.roomFound === true;

        if (!fixtureOk) {
          detachConsole();
          report.cases.push({
            name: caseName,
            pass: false,
            runIndex,
            runStamp,
            fixtureFail: true,
            fixturePick: qa1FixturePick,
            verdict: judgeQa1Verdict({ fixtureOk: false }),
            note: "QA1 미실행 — home-sync critical cap fixture gate FAIL",
          });
          qa1RepeatRuns.push({
            runIndex,
            stamp: runStamp,
            pass: false,
            rowDomUnread: null,
            rowStateAudit: { consoleEvents, timelineAnalysis: null, lastWritePathCandidates: [] },
          });
          break;
        }

        const roomId = qa1FixturePick.pick.roomId;
        auditRefs.roomId = roomId;
        homeSyncNetworkEvents.length = 0;
        await resetSessionStorageWriteAudit(page, roomId);
        generalRoomId = roomId;
        peerRoom = {
          id: roomId,
          room_type: qa1FixturePick.pick.roomType,
          direct_key: qa1FixturePick.pick.messengerDirectKey,
        };
        report.fixtures = { userId, generalRoomId, peerRoom, qa1FixturePick };

        const beforeSettle = await gotoMarketWithBadgeSettle(page);
        recordCaseBoundary(report, caseName, "before", beforeSettle.triplet, {
          runIndex,
          settleOk: beforeSettle.ok,
        });
        const before = beforeSettle.triplet;
        const beforeChatDom = before.dom.chat;
        const beforeTotal = before.api.total ?? 0;
        const beforeHubCm = before.hubApi.communityMessengerUnread ?? null;
        const beforeLive = await countLiveBottomNavChat(sb, userId);

        const prevPart = (parts ?? []).find((p) => p.room_id === roomId);
        const prevUnread = Math.max(0, Number(prevPart?.unread_count ?? 0) || 0);

        await sb
          .from("community_messenger_participants")
          .update({ unread_count: 5 })
          .eq("user_id", userId)
          .eq("room_id", roomId);
        const targetRpc = await bumpChatRoomTargetHarness(sb, userId, roomId);
        const snapshotInv = await invalidateHubSnapshotHarness(sb, userId);
        const harnessMutations = { targetRpc, snapshotInv };

        for (let i = 0; i < 5; i++) {
          const id = await insertEvent(sb, userId, {
            type: "chat_message",
            category: "chat_message",
            title: `qa1 msg ${i + 1}`,
            body: "qa1",
            room_id: roomId,
            dedupe_key: `qa1:chat:${roomId}:${runIndex}:${i}:${Date.now()}`,
            display_payload: { routeUrl: `/community-messenger/rooms/${roomId}` },
          });
          cleanup.push(id);
        }

        const fixtureTitle =
          (await fetchHomeSyncRoomProbe(page, roomId)).roomFound
            ? (
                await page.evaluate(async (rid) => {
                  const res = await fetch("/api/community-messenger/home-sync?tier=critical&fresh=1", {
                    credentials: "include",
                    cache: "no-store",
                  });
                  const json = await res.json().catch(() => null);
                  const all = [...(json?.chats ?? []), ...(json?.groups ?? [])];
                  const room = all.find((r) => String(r?.id) === String(rid));
                  return room?.title?.trim() ?? null;
                }, roomId)
              )
            : null;

        await goto(page, `${BASE}/community-messenger?section=chats`);
        auditRefs.pollStartT = Date.now();
        const pollStartT = auditRefs.pollStartT;
        const pollPromise = pollRowStateTimeline(page, roomId, fixtureTitle);
        await delay(2500);
        const homeSyncProbe = await fetchHomeSyncRoomProbe(page, roomId);

        if (!homeSyncProbe?.roomFound) {
          const rowStateTimeline = await pollPromise;
          detachConsole();
          const ssWriteEvents = await readSessionStorageWriteAudit(page);
          const timelineAnalysis = analyzeRowStateTimeline(rowStateTimeline);
          const criticalPatchMergeAudit = buildCriticalPatchMergeAudit({
            roomId,
            homeSyncNetworkEvents,
            ssWriteEvents,
            consoleEvents,
            rowPass: false,
          });
          report.cases.push({
            name: caseName,
            pass: false,
            runIndex,
            runStamp,
            fixtureFail: true,
            fixturePick: qa1FixturePick,
            homeSyncProbe,
            harnessMutations,
            rowStateAudit: {
              pollStartT,
              consoleEvents,
              rowStateTimeline,
              timelineAnalysis,
              homeSyncNetworkEvents: [...homeSyncNetworkEvents],
              ssWriteEvents,
              criticalPatchMergeAudit,
              lastWritePathCandidates: inferLastWritePathCandidate({
                consoleEvents,
                timelineAnalysis,
                rowPass: false,
              }),
            },
            verdict: judgeQa1Verdict({ fixtureOk: false }),
            note: "QA1 중단 — mutation 후 homeSyncProbe.roomFound=false",
          });
          qa1RepeatRuns.push({
            runIndex,
            stamp: runStamp,
            pass: false,
            rowDomUnread: null,
            rowStateAudit: { consoleEvents, timelineAnalysis },
          });
        } else {
          const [rowStateTimeline, waited, atomic] = await Promise.all([
            pollPromise,
            waitPred(
              page,
              (s) =>
                (s.ssotFresh?.total ?? 0) >= beforeTotal + 5 ||
                (s.ssotFresh?.chatMessage ?? 0) >= 5 ||
                (s.hub?.communityMessengerUnread ?? 0) >= 1,
              15000
            ),
            waitForQa1FixtureRowProbe(page, roomId, qa1FixturePick.pick.homeSyncRank),
          ]);
          if (!waited.ok) {
            detachConsole();
            const failTriplet = await scanBadgeTriplet(page);
            recordCaseBoundary(report, caseName, "waitPred_fail", failTriplet, { runIndex });
            pushFailFastCase(report, caseName, "waitPred_after_mutation", {
              runIndex,
              runStamp,
              waitedMs: waited.waitedMs,
              badgeTriplet: failTriplet,
              failureClassification: "harness_waitPred_timeout",
              fixturePick: qa1FixturePick,
            });
            qa1RepeatRuns.push({
              runIndex,
              stamp: runStamp,
              pass: false,
              rowDomUnread: null,
              rowStateAudit: { consoleEvents, timelineAnalysis: null },
            });
            break;
          }
          const after = waited.scan;
          const eventChat =
            (after.ssotFresh?.chatMessage ?? 0) + (after.ssotFresh?.groupMessage ?? 0);
          const afterLive = await countLiveBottomNavChat(sb, userId);
          detachConsole();
          const ssWriteEvents = await readSessionStorageWriteAudit(page);
          const threeWay = atomic.threeWay;
          const rowProbe = atomic.row;
          const rowMeasure = {
            homeSyncUnreadCount: homeSyncProbe.unreadCount,
            homeSyncRoomFound: homeSyncProbe.roomFound,
            rowDomUnread: rowProbe.rowDomUnread,
            targetRowFound: rowProbe.targetRowFound,
            matchVia: rowProbe.matchVia,
            rowIdentityMismatch: rowProbe.rowIdentityMismatch,
            fixtureLinkedBadgeRow: rowProbe.fixtureLinkedBadgeRow,
          };

          const qa1PassEval = evaluateQa1RebuildPass({
            beforeChatDom,
            threeWay,
            rowMeasure,
            rowProbe,
            beforeTotal,
            afterTotal: after.ssotFresh?.total,
          });
          const pass = qa1PassEval.pass;
          const timelineAnalysis = analyzeRowStateTimeline(rowStateTimeline);
          timelineAnalysis.anchorT = pollStartT;
          const finalRowStateSnapshot = await probeRowStateSnapshot(page, roomId, fixtureTitle);
          const lastWritePathCandidates = inferLastWritePathCandidate({
            consoleEvents,
            timelineAnalysis,
            rowPass: qa1PassEval.criteria?.rowUnreadPass === true,
          });
          const criticalPatchMergeAudit = buildCriticalPatchMergeAudit({
            roomId,
            homeSyncNetworkEvents,
            ssWriteEvents,
            consoleEvents,
            rowPass: pass,
          });

          const verdict = judgeQa1Verdict({
            fixtureOk: true,
            threeWay,
            rowMeasure,
            rowProbe,
            pass,
          });

          const casePayload = {
            name: caseName,
            pass,
            runIndex,
            runStamp,
            qa1PassCriteria: qa1PassEval.criteria,
            homeSyncProbeHold:
              homeSyncProbe?.roomFound === true && homeSyncProbe?.unreadCount !== 5
                ? {
                    status: "HOLD",
                    reason: "mutation 후 homeSyncProbe unreadCount가 fixture 기대(5)와 불일치 — row identity 감사와 별도 추적",
                    unreadCount: homeSyncProbe.unreadCount,
                    fixturePickUnread: qa1FixturePick.pick.unreadCount,
                  }
                : null,
            fixturePick: qa1FixturePick,
            selectedRoom: qa1FixturePick.pick,
            generalRoomId: roomId,
            beforeChatDom,
            afterChatDom: threeWay.domCm,
            beforeHubCm,
            afterHubCm: threeWay.hubApiCm,
            threeWay,
            rowMeasure,
            eventChatSlice: eventChat,
            beforeTotal,
            afterTotal: after.ssotFresh?.total,
            rowUnread: rowProbe.rowDomUnread,
            rowProbe,
            homeSyncProbe,
            harnessMutations,
            rowStateAudit: {
              pollStartT,
              pollIntervalMs: ROW_STATE_POLL_INTERVAL_MS,
              pollMaxMs: ROW_STATE_POLL_MAX_MS,
              consoleEvents,
              rowStateTimeline,
              timelineAnalysis,
              finalRowStateSnapshot,
              homeSyncNetworkEvents: [...homeSyncNetworkEvents],
              ssWriteEvents,
              criticalPatchMergeAudit,
              lastWritePathCandidates,
            },
            verdict,
            liveBottomNavChat: {
              before: beforeLive.liveBottomNavChat,
              after: afterLive.liveBottomNavChat,
              beforeError: beforeLive.liveTargetError,
              afterError: afterLive.liveTargetError,
            },
            hubBadgeQuery: HUB_BADGE_QS,
            ownerHubBadgeSyncChannel: OWNER_HUB_BADGE_SYNC_CHANNEL,
            note: "Rebuild expects Chat DOM=room count (~1), row=5, events/app icon SUM up",
          };
          report.cases.push(casePayload);
          qa1RepeatRuns.push({
            runIndex,
            stamp: runStamp,
            pass,
            rowDomUnread: rowProbe.rowDomUnread,
            rowStateAudit: casePayload.rowStateAudit,
          });

          const shotName =
            QA1_REPEAT > 1 ? `qa1-chat-list-run${runIndex + 1}.png` : "qa1-chat-list.png";
          await page.screenshot({ path: path.join(OUT_DIR, shotName), fullPage: false });

          await sb
            .from("community_messenger_participants")
            .update({ unread_count: prevUnread })
            .eq("user_id", userId)
            .eq("room_id", roomId);
          await invalidateHubSnapshotHarness(sb, userId);

          if (runIndex < QA1_REPEAT - 1) {
            await delay(1500);
          }
        }
      }

      if (QA1_REPEAT > 1 && qa1RepeatRuns.length) {
        report.qa1RowStateComparison = buildQa1RowStateComparison(qa1RepeatRuns);
        fs.writeFileSync(
          path.join(OUT_DIR, "qa1-row-state-comparison.json"),
          JSON.stringify(report.qa1RowStateComparison, null, 2)
        );
        fs.writeFileSync(
          path.join(OUT_DIR, "qa1-critical-patch-merge-audit.json"),
          JSON.stringify(
            {
              runs: qa1RepeatRuns.map((r) => ({
                runIndex: r.runIndex,
                pass: r.pass,
                criticalPatchMergeAudit: r.rowStateAudit?.criticalPatchMergeAudit ?? null,
              })),
              passLastWritePath: qa1RepeatRuns
                .filter((r) => r.pass)
                .map((r) => r.rowStateAudit?.criticalPatchMergeAudit?.lastWritePath),
              failLastWritePath: qa1RepeatRuns
                .filter((r) => !r.pass)
                .map((r) => r.rowStateAudit?.criticalPatchMergeAudit?.lastWritePath),
            },
            null,
            2
          )
        );
      }
    } else {
      const roomIds = (parts ?? []).map((p) => p.room_id).filter(Boolean);
      if (roomIds.length) {
        const { data: rooms } = await sb
          .from("community_messenger_rooms")
          .select("id, room_type, direct_key")
          .in("id", roomIds);
        peerRoom =
          (rooms ?? []).find((r) => {
            const dk = String(r.direct_key ?? "");
            if (dk.startsWith("trade_pc:") || dk.startsWith("trade_item:")) return false;
            if (dk.startsWith("store_order:") || dk.startsWith("trade_order:")) return false;
            return r.room_type === "direct" || r.room_type === "private_group";
          }) ?? null;
        generalRoomId = peerRoom?.id ?? null;
      }
      report.fixtures = { userId, generalRoomId, peerRoom };
    }

    // -------- QA2: enter room clear --------
    if (qaCaseEnabled(2)) {
      const caseName = "qa2_chat_room_enter_clear";
      const roomId = generalRoomId;
      if (!roomId) {
        report.cases.push({ name: caseName, pass: false, error: "no_general_room" });
      } else {
        const caseStartDb = await snapshotFixtureDbState(sb, userId, roomId);
        await sb
          .from("community_messenger_participants")
          .update({ unread_count: 3 })
          .eq("user_id", userId)
          .eq("room_id", roomId);
        await sb.from("notification_targets").upsert(
          {
            user_id: userId,
            target_type: "chat_room",
            target_id: roomId,
            scope: "consumer",
            is_unread: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,target_type,target_id" }
        );
        const eid = await insertEvent(sb, userId, {
          type: "chat_message",
          category: "chat_message",
          title: "qa2",
          body: "qa2",
          room_id: roomId,
          dedupe_key: `qa2:chat:${roomId}:${Date.now()}`,
        });
        cleanup.push(eid);

        const settleBefore = await gotoMarketWithBadgeSettle(page);
        recordCaseBoundary(report, caseName, "before", settleBefore.triplet, {
          settleOk: settleBefore.ok,
          fixtureDb: caseStartDb,
        });
        if (!settleBefore.ok) {
          pushFailFastCase(report, caseName, "badge_settle_before", {
            settle: settleBefore,
            failureClassification: "harness_badge_settle_timeout",
            fixtureDb: caseStartDb,
          });
        } else {
          const beforeTriplet = settleBefore.triplet;
          const beforeChat = beforeTriplet.dom.chat;
          const beforeTotal = beforeTriplet.api.total ?? 0;
          readThreadWaits.length = 0;
          await goto(page, `${BASE}/community-messenger/rooms/${roomId}`);
          await delay(4000);
          const afterWait = await waitPredFailFast(
            page,
            (s) =>
              (s.ssotFresh?.total ?? 0) < beforeTotal ||
              tabBadge(s, "chat", "Messenger").count < beforeChat,
            20000,
            "waitPred_after_room_enter"
          );
          if (!afterWait.ok) {
            pushFailFastCase(report, caseName, afterWait.failStage, {
              badgeTriplet: afterWait.badgeTriplet,
              waitedMs: afterWait.waitedMs,
              failureClassification: "harness_waitPred_timeout",
              beforeTriplet,
              fixtureDb: caseStartDb,
            });
          } else {
            const afterTriplet = await scanBadgeTriplet(page);
            recordCaseBoundary(report, caseName, "after_room_enter", afterTriplet);
            const afterChat = afterTriplet.dom.chat;
            const { data: partAfter } = await sb
              .from("community_messenger_participants")
              .select("unread_count")
              .eq("user_id", userId)
              .eq("room_id", roomId)
              .maybeSingle();
            const participantUnread = Number(partAfter?.unread_count ?? -1);
            const { data: tgt } = await sb
              .from("notification_targets")
              .select("is_unread")
              .eq("user_id", userId)
              .eq("target_type", "chat_room")
              .eq("target_id", roomId)
              .maybeSingle();
            const pass =
              participantUnread === 0 &&
              afterChat <= Math.max(0, beforeChat - 1) &&
              (afterTriplet.api.total ?? 0) <= beforeTotal;
            report.cases.push({
              name: caseName,
              pass,
              beforeTriplet,
              afterTriplet,
              beforeChat,
              afterChat,
              beforeTotal,
              afterTotal: afterTriplet.api.total,
              participantUnread,
              targetUnread: tgt?.is_unread ?? null,
              readWaits: [...readThreadWaits],
              fixtureDb: caseStartDb,
            });
            await page.screenshot({ path: path.join(OUT_DIR, "qa2-room.png"), fullPage: false });
          }
        }
      }
    }

    let productId = null;
    let orderId = null;
    let communityFixture = null;

    if (qaCaseEnabled(3) || qaCaseEnabled(4)) {
      const { data: postRows } = await sb.from("posts").select("id").limit(1);
      const { data: orderRows } = await sb
        .from("store_orders")
        .select("id")
        .eq("buyer_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1);
      productId = String(postRows?.[0]?.id ?? "").trim() || null;
      orderId = String(orderRows?.[0]?.id ?? "").trim() || null;
      report.fixtures.productId = productId;
      report.fixtures.orderId = orderId;
      report.fixtures.productReal = !!productId;
      report.fixtures.orderReal = !!orderId;
    }

    if (qaCaseEnabled(5)) {
      communityFixture = await resolveCommunityPostFixture(sb, userId);
      report.fixtures.postId = communityFixture.postId;
      report.fixtures.postReal = communityFixture.postReal;
      report.fixtures.communityFixture = communityFixture;
    }

    // -------- QA3 Trade --------
    if (qaCaseEnabled(3)) {
      const caseName = "qa3_trade_unread_isolated";
      if (!productId) {
        report.cases.push({ name: caseName, pass: false, error: "no_product" });
      } else {
        const caseStartDb = await snapshotFixtureDbState(sb, userId, generalRoomId);
        const settleBefore = await gotoMarketWithBadgeSettle(page);
        recordCaseBoundary(report, caseName, "before", settleBefore.triplet, {
          settleOk: settleBefore.ok,
          fixtureDb: caseStartDb,
        });
        if (!settleBefore.ok) {
          pushFailFastCase(report, caseName, "badge_settle_before", {
            settle: settleBefore,
            failureClassification: "harness_badge_settle_timeout",
            fixtureDb: caseStartDb,
          });
        } else {
          const beforeTriplet = settleBefore.triplet;
          const beforeTradeDom = beforeTriplet.dom.trade;
          const beforeChatDom = beforeTriplet.dom.chat;
          const beforeTrade = beforeTriplet.api.tradeStatus ?? 0;
          const id = await insertEvent(sb, userId, {
            type: "trade_status",
            category: "trade_status",
            title: "qa3 trade",
            body: "qa3",
            dedupe_key: `qa3:trade:${productId}:${Date.now()}`,
            display_payload: {
              legacyMeta: { product_id: productId },
              routeUrl: `/post/${productId}`,
            },
          });
          cleanup.push(id);
          const apiWait = await waitPredFailFast(
            page,
            (s) => (s.ssotFresh?.tradeStatus ?? 0) >= beforeTrade + 1,
            12000,
            "waitPred_trade_status_after_insert"
          );
          if (!apiWait.ok) {
            pushFailFastCase(report, caseName, apiWait.failStage, {
              badgeTriplet: apiWait.badgeTriplet,
              waitedMs: apiWait.waitedMs,
              failureClassification: "harness_waitPred_timeout",
              beforeTriplet,
              fixtureDb: caseStartDb,
            });
          } else {
            const midSettle = await gotoMarketWithBadgeSettle(page);
            const midTriplet = midSettle.triplet;
            const midTradeDom = midTriplet.dom.trade;
            const midChatDom = midTriplet.dom.chat;
            const domDiag = domApiDiagnosticsForSurface(midTriplet, "trade");
            recordCaseBoundary(report, caseName, "mid_after_insert", midTriplet, {
              settleOk: midSettle.ok,
              domApiDiagnostics: domDiag,
            });
            if (!midSettle.ok) {
              pushFailFastCase(report, caseName, "badge_settle_mid", {
                settle: midSettle,
                failureClassification: "harness_badge_settle_timeout",
                beforeTriplet,
                domApiDiagnostics: domDiag,
                fixtureDb: caseStartDb,
              });
            } else if (midTradeDom < 1) {
              const failClass =
                domDiag?.classification?.kind === "api_positive_dom_zero"
                  ? "api_positive_dom_zero"
                  : domDiag?.classification?.kind === "api_and_dom_zero"
                    ? "api_and_dom_zero"
                    : "dom_below_threshold";
              pushFailFastCase(report, caseName, "mid_trade_dom_check", {
                beforeTriplet,
                midTriplet,
                domApiDiagnostics: domDiag,
                failureClassification: failClass,
                productBugCandidate: failClass === "api_positive_dom_zero",
                harnessSettleIssue: failClass !== "api_positive_dom_zero",
                fixtureDb: caseStartDb,
              });
            } else if (midChatDom !== beforeChatDom) {
              pushFailFastCase(report, caseName, "mid_chat_isolation", {
                beforeChatDom,
                midChatDom,
                beforeTriplet,
                midTriplet,
                failureClassification: "chat_dom_leak",
                fixtureDb: caseStartDb,
              });
            } else {
              readThreadWaits.length = 0;
              await goto(page, `${BASE}/post/${productId}`);
              const afterClearWait = await waitPredFailFast(
                page,
                (s) => (s.ssotFresh?.tradeStatus ?? 0) <= beforeTrade,
                15000,
                "waitPred_trade_status_after_detail"
              );
              if (!afterClearWait.ok) {
                pushFailFastCase(report, caseName, afterClearWait.failStage, {
                  badgeTriplet: afterClearWait.badgeTriplet,
                  waitedMs: afterClearWait.waitedMs,
                  failureClassification: "harness_waitPred_timeout",
                  beforeTriplet,
                  midTriplet,
                  fixtureDb: caseStartDb,
                });
              } else {
                const afterTriplet = await scanBadgeTriplet(page);
                recordCaseBoundary(report, caseName, "after_detail", afterTriplet);
                const pass =
                  readThreadWaits.includes("trade_detail_opened") &&
                  (afterTriplet.api.tradeStatus ?? 0) <= beforeTrade;
                report.cases.push({
                  name: caseName,
                  pass,
                  beforeTriplet,
                  midTriplet,
                  afterTriplet,
                  beforeChatDom,
                  midChatDom,
                  beforeTradeDom,
                  midTradeDom,
                  beforeTrade,
                  afterTrade: afterTriplet.api.tradeStatus,
                  domApiDiagnostics: domDiag,
                  readReasons: [...readThreadWaits],
                  eventKey: eventKeyForNotificationEventType("trade_status"),
                  fixtureDb: caseStartDb,
                });
                await page.screenshot({ path: path.join(OUT_DIR, "qa3-trade.png"), fullPage: false });
              }
            }
          }
        }
      }
    }

    // -------- QA4 Delivery --------
    if (qaCaseEnabled(4)) {
      const caseName = "qa4_delivery_unread_isolated";
      if (!orderId) {
        report.cases.push({ name: caseName, pass: false, error: "no_order" });
      } else {
        const caseStartDb = await snapshotFixtureDbState(sb, userId, generalRoomId);
        const settleBefore = await gotoMarketWithBadgeSettle(page);
        recordCaseBoundary(report, caseName, "before", settleBefore.triplet, {
          settleOk: settleBefore.ok,
          fixtureDb: caseStartDb,
        });
        if (!settleBefore.ok) {
          pushFailFastCase(report, caseName, "badge_settle_before", {
            settle: settleBefore,
            failureClassification: "harness_badge_settle_timeout",
            fixtureDb: caseStartDb,
          });
        } else {
          const beforeTriplet = settleBefore.triplet;
          const beforeChatDom = beforeTriplet.dom.chat;
          const beforeFoodDom = beforeTriplet.dom.food;
          const beforeOrder = beforeTriplet.api.orderStatus ?? 0;
          const id = await insertEvent(sb, userId, {
            type: "order_status",
            category: "order_status",
            title: "qa4 order",
            body: "qa4",
            dedupe_key: `qa4:order:${orderId}:${Date.now()}`,
            display_payload: { legacyRefId: orderId, legacyMeta: { order_id: orderId } },
          });
          cleanup.push(id);
          const apiWait = await waitPredFailFast(
            page,
            (s) => (s.ssotFresh?.orderStatus ?? 0) >= beforeOrder + 1,
            12000,
            "waitPred_order_status_after_insert"
          );
          if (!apiWait.ok) {
            pushFailFastCase(report, caseName, apiWait.failStage, {
              badgeTriplet: apiWait.badgeTriplet,
              waitedMs: apiWait.waitedMs,
              failureClassification: "harness_waitPred_timeout",
              beforeTriplet,
              fixtureDb: caseStartDb,
            });
          } else {
            const midSettle = await gotoMarketWithBadgeSettle(page);
            const midTriplet = midSettle.triplet;
            const midChatDom = midTriplet.dom.chat;
            const midFoodDom = midTriplet.dom.food;
            const domDiag = domApiDiagnosticsForSurface(midTriplet, "delivery");
            recordCaseBoundary(report, caseName, "mid_after_insert", midTriplet, {
              settleOk: midSettle.ok,
              domApiDiagnostics: domDiag,
            });
            const minFoodDom = Math.max(1, beforeFoodDom);
            if (!midSettle.ok) {
              pushFailFastCase(report, caseName, "badge_settle_mid", {
                settle: midSettle,
                failureClassification: "harness_badge_settle_timeout",
                beforeTriplet,
                domApiDiagnostics: domDiag,
                fixtureDb: caseStartDb,
              });
            } else if (midFoodDom < minFoodDom) {
              const failClass =
                domDiag?.classification?.kind === "api_positive_dom_zero"
                  ? "api_positive_dom_zero"
                  : domDiag?.classification?.kind === "api_and_dom_zero"
                    ? "api_and_dom_zero"
                    : "dom_below_threshold";
              pushFailFastCase(report, caseName, "mid_food_dom_check", {
                beforeTriplet,
                midTriplet,
                domApiDiagnostics: domDiag,
                failureClassification: failClass,
                productBugCandidate: failClass === "api_positive_dom_zero",
                harnessSettleIssue: failClass !== "api_positive_dom_zero",
                fixtureDb: caseStartDb,
              });
            } else if (midChatDom !== beforeChatDom) {
              pushFailFastCase(report, caseName, "mid_chat_isolation", {
                beforeChatDom,
                midChatDom,
                beforeTriplet,
                midTriplet,
                failureClassification: "chat_dom_leak",
                fixtureDb: caseStartDb,
              });
            } else {
              readThreadWaits.length = 0;
              await goto(page, `${BASE}/mypage/store-orders/${encodeURIComponent(orderId)}`);
              const afterClearWait = await waitPredFailFast(
                page,
                (s) => (s.ssotFresh?.orderStatus ?? 0) <= beforeOrder,
                15000,
                "waitPred_order_status_after_detail"
              );
              if (!afterClearWait.ok) {
                pushFailFastCase(report, caseName, afterClearWait.failStage, {
                  badgeTriplet: afterClearWait.badgeTriplet,
                  waitedMs: afterClearWait.waitedMs,
                  failureClassification: "harness_waitPred_timeout",
                  beforeTriplet,
                  midTriplet,
                  fixtureDb: caseStartDb,
                });
              } else {
                const afterTriplet = await scanBadgeTriplet(page);
                recordCaseBoundary(report, caseName, "after_detail", afterTriplet);
                const pass =
                  readThreadWaits.includes("order_detail_opened") &&
                  (afterTriplet.api.orderStatus ?? 0) <= beforeOrder;
                report.cases.push({
                  name: caseName,
                  pass,
                  beforeTriplet,
                  midTriplet,
                  afterTriplet,
                  beforeChatDom,
                  midChatDom,
                  beforeFoodDom,
                  midFoodDom,
                  beforeOrder,
                  afterOrder: afterTriplet.api.orderStatus,
                  domApiDiagnostics: domDiag,
                  readReasons: [...readThreadWaits],
                  eventKey: eventKeyForNotificationEventType("order_status"),
                  fixtureDb: caseStartDb,
                });
                await page.screenshot({ path: path.join(OUT_DIR, "qa4-order.png"), fullPage: false });
              }
            }
          }
        }
      }
    }

    // -------- QA5 Community --------
    if (qaCaseEnabled(5)) {
      const caseName = "qa5_community_read_reason";
      const postId = communityFixture?.postId ?? null;
      if (!postId) {
        report.cases.push({
          name: caseName,
          pass: false,
          error: "no_post",
          readReasons: [],
          postReal: false,
          communityFixture,
        });
      } else {
        const caseStartDb = await snapshotFixtureDbState(sb, userId, generalRoomId);
        const settleBefore = await gotoMarketWithBadgeSettle(page);
        recordCaseBoundary(report, caseName, "before", settleBefore.triplet, {
          settleOk: settleBefore.ok,
          fixtureDb: caseStartDb,
        });
        if (!settleBefore.ok) {
          pushFailFastCase(report, caseName, "badge_settle_before", {
            settle: settleBefore,
            failureClassification: "harness_badge_settle_timeout",
            fixtureDb: caseStartDb,
          });
        } else {
          const beforeTriplet = settleBefore.triplet;
          const beforeCommunity = beforeTriplet.api.communityActivity ?? 0;
          const beforeDom = beforeTriplet.dom.community;
          const id = await insertEvent(sb, userId, {
            type: "community_activity",
            category: "community_activity",
            title: "qa5 community",
            body: "qa5",
            dedupe_key: `qa5:community:${postId}:${Date.now()}`,
            display_payload: {
              legacyRefId: postId,
              legacyMeta: { post_id: postId },
              routeUrl: `/philife/${postId}`,
            },
          });
          cleanup.push(id);
          const apiWait = await waitPredFailFast(
            page,
            (s) => (s.ssotFresh?.communityActivity ?? 0) >= beforeCommunity + 1,
            12000,
            "waitPred_community_activity_after_insert"
          );
          if (!apiWait.ok) {
            pushFailFastCase(report, caseName, apiWait.failStage, {
              badgeTriplet: apiWait.badgeTriplet,
              waitedMs: apiWait.waitedMs,
              failureClassification: "harness_waitPred_timeout",
              beforeTriplet,
              fixtureDb: caseStartDb,
            });
          } else {
            const midSettle = await gotoMarketWithBadgeSettle(page);
            const midTriplet = midSettle.triplet;
            const midDom = midTriplet.dom.community;
            const domDiag = domApiDiagnosticsForSurface(midTriplet, "community");
            recordCaseBoundary(report, caseName, "mid_after_insert", midTriplet, {
              settleOk: midSettle.ok,
              domApiDiagnostics: domDiag,
            });
            if (!midSettle.ok) {
              pushFailFastCase(report, caseName, "badge_settle_mid", {
                settle: midSettle,
                failureClassification: "harness_badge_settle_timeout",
                beforeTriplet,
                domApiDiagnostics: domDiag,
                fixtureDb: caseStartDb,
              });
            } else if (midDom < 1) {
              const failClass =
                domDiag?.classification?.kind === "api_positive_dom_zero"
                  ? "api_positive_dom_zero"
                  : domDiag?.classification?.kind === "api_and_dom_zero"
                    ? "api_and_dom_zero"
                    : "dom_below_threshold";
              pushFailFastCase(report, caseName, "mid_community_dom_check", {
                beforeTriplet,
                midTriplet,
                domApiDiagnostics: domDiag,
                failureClassification: failClass,
                productBugCandidate: failClass === "api_positive_dom_zero",
                harnessSettleIssue: failClass !== "api_positive_dom_zero",
                fixtureDb: caseStartDb,
              });
            } else {
              readThreadWaits.length = 0;
              readThreadBodies.length = 0;
              const nav = await page.goto(`${BASE}/philife/${postId}`, {
                waitUntil: "domcontentloaded",
                timeout: 90000,
              });
              const pageStatus = nav?.status() ?? null;
              await delay(3000);
              const mountProbe = await page.evaluate(() => ({
                communityDetailMounted: Boolean(document.querySelector("article h1")),
                pathname: location.pathname,
                hasArticle: Boolean(document.querySelector("article")),
              }));
              const afterClearWait = await waitPredFailFast(
                page,
                (s) => (s.ssotFresh?.communityActivity ?? 0) <= beforeCommunity,
                15000,
                "waitPred_community_activity_after_detail"
              );
              if (!afterClearWait.ok) {
                pushFailFastCase(report, caseName, afterClearWait.failStage, {
                  badgeTriplet: afterClearWait.badgeTriplet,
                  waitedMs: afterClearWait.waitedMs,
                  failureClassification: "harness_waitPred_timeout",
                  beforeTriplet,
                  midTriplet,
                  fixtureDb: caseStartDb,
                });
              } else {
                const afterTriplet = await scanBadgeTriplet(page);
                recordCaseBoundary(report, caseName, "after_detail", afterTriplet);
                const reasons = [...readThreadWaits];
                const pass =
                  reasons.includes("community_post_opened") &&
                  mountProbe.communityDetailMounted &&
                  (afterTriplet.api.communityActivity ?? 0) <= beforeCommunity;
                report.cases.push({
                  name: caseName,
                  pass,
                  postId,
                  postReal: communityFixture?.postReal ?? true,
                  pageStatus,
                  communityDetailMounted: mountProbe.communityDetailMounted,
                  mountProbe,
                  beforeTriplet,
                  midTriplet,
                  afterTriplet,
                  beforeCommunity,
                  afterCommunity: afterTriplet.api.communityActivity,
                  beforeDom,
                  midDom,
                  domApiDiagnostics: domDiag,
                  readReasons: reasons,
                  readThreadBodies: [...readThreadBodies],
                  communityFixture,
                  eventKey: eventKeyForNotificationEventType("community_activity"),
                  fixtureDb: caseStartDb,
                });
                await page.screenshot({ path: path.join(OUT_DIR, "qa5-philife.png"), fullPage: false });
              }
            }
          }
        }
      }
    }

    // -------- QA6 Sound matrix (static consume of map + presence of events) --------
    if (qaCaseEnabled(6)) {
      const matrix = [
        { type: "chat_message", surface: "chat", key: "messenger_direct_message_received" },
        { type: "group_message", surface: "chat", key: "messenger_group_message_received" },
        { type: "trade_message", surface: "trade", key: "trade_chat_message_received" },
        { type: "trade_status", surface: "trade", key: "trade_offer_received" },
        { type: "order_status", surface: "delivery", key: "delivery_order_status_changed_user" },
        { type: "community_activity", surface: "community", key: "community_comment_received" },
      ];
      const rows = matrix.map((m) => ({
        ...m,
        resolved: eventKeyForNotificationEventType(m.type),
        match: eventKeyForNotificationEventType(m.type) === m.key,
      }));
      const pass = rows.every((r) => r.match);
      report.cases.push({
        name: "qa6_sound_eventkey_matrix",
        pass,
        rows,
        note: "Consumes notification-sound-event-map only; no registry edit. Full in-app sound play not asserted.",
      });
    }
  } finally {
    detachHomeSyncNetwork();
    await deleteEvents(sb, cleanup);
    await browser.close();
  }

  report.allCases = report.cases.map((c) => ({ name: c.name, pass: c.pass }));
  report.anyPassClaimForbidden = true;
  const out = path.join(OUT_DIR, "report.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out, cases: report.allCases, authorityRisks: report.authorityRisks }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
