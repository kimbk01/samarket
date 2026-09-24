/**
 * QA-only — Samsung MESSAGE KILLED SystemUI tap harness (hierarchy SSOT).
 *
 * ONE hierarchy path per runtime attempt:
 *   captureShadeHierarchy → same hierarchyPath → resolveExactMessageRow → planContentTap
 *
 * Fail-closed: missing/invalid/ambiguous hierarchy never reaches TAP.
 * Product code is never imported or modified by this module.
 *
 * Forbidden search strings (never used as tap selectors): 알림, dibay, 디바이
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const FORBIDDEN_SUMMARY_SUBSTRING = "읽지 않은 알림";
export const EXPANDABLE_ROW_ID_SUFFIX = "expandableNotificationRow";
export const DEFAULT_DEVICE_HIERARCHY_PATH = "/sdcard/shade-message-killed.xml";

/** @typedef {{ status: number, stdout: string, stderr: string }} AdbResult */
/** @typedef {(args: string[]) => AdbResult} AdbRunner */

/**
 * @param {object} input
 * @param {AdbRunner} input.adb
 * @param {string} input.serial
 * @param {string} input.localHierarchyPath absolute local path — SINGLE SSOT for this attempt
 * @param {string} [input.deviceHierarchyPath]
 * @param {() => void} [input.sleep] inject for tests
 */
export function captureShadeHierarchy(input) {
  const {
    adb,
    serial,
    localHierarchyPath,
    deviceHierarchyPath = DEFAULT_DEVICE_HIERARCHY_PATH,
    sleep = (ms) => {
      spawnSync("sleep", [String(ms / 1000)]);
    },
  } = input;

  if (!localHierarchyPath || !path.isAbsolute(localHierarchyPath)) {
    return failCapture({
      stage: "local_path",
      reason: "localHierarchyPath must be absolute",
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath || "",
    });
  }

  const expand = adb(["-s", serial, "shell", "cmd", "statusbar", "expand-notifications"]);
  if (expand.status !== 0) {
    return failCapture({
      stage: "expand_notifications",
      reason: "expand-notifications failed",
      exitCode: expand.status,
      stdout: expand.stdout,
      stderr: expand.stderr,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
    });
  }
  sleep(1200);

  const dump = adb(["-s", serial, "shell", "uiautomator", "dump", deviceHierarchyPath]);
  if (dump.status !== 0) {
    return failCapture({
      stage: "uiautomator_dump",
      reason: "uiautomator dump failed",
      exitCode: dump.status,
      stdout: dump.stdout,
      stderr: dump.stderr,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
    });
  }

  const pull = adb(["-s", serial, "pull", deviceHierarchyPath, localHierarchyPath]);
  if (pull.status !== 0) {
    return failCapture({
      stage: "adb_pull",
      reason: "adb pull failed",
      exitCode: pull.status,
      stdout: pull.stdout,
      stderr: pull.stderr,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
    });
  }

  const exists = fs.existsSync(localHierarchyPath);
  const size = exists ? fs.statSync(localHierarchyPath).size : 0;
  if (!exists || size <= 0) {
    return failCapture({
      stage: "local_file",
      reason: exists ? "local hierarchy empty" : "local hierarchy missing after pull",
      exitCode: pull.status,
      stdout: pull.stdout,
      stderr: pull.stderr,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
      localExists: exists,
      localSize: size,
    });
  }

  let xml;
  try {
    xml = fs.readFileSync(localHierarchyPath, "utf8");
  } catch (e) {
    return failCapture({
      stage: "read",
      reason: String(e?.message || e),
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
      localExists: true,
      localSize: size,
    });
  }
  if (!String(xml).trim()) {
    return failCapture({
      stage: "nonempty",
      reason: "local hierarchy empty after read",
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
      localExists: true,
      localSize: size,
    });
  }

  const parse = parseHierarchyXml(xml);
  if (!parse.ok) {
    return failCapture({
      stage: "xml_parse",
      reason: parse.reason,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
      localExists: true,
      localSize: size,
    });
  }

  return {
    ok: true,
    hierarchyPath: localHierarchyPath,
    devicePath: deviceHierarchyPath,
    localExists: true,
    localSize: size,
    xml,
    diagnostics: {
      stage: "capture_ok",
      exitCode: 0,
      stdout: pull.stdout,
      stderr: pull.stderr,
      devicePath: deviceHierarchyPath,
      localPath: localHierarchyPath,
      localExists: true,
      localSize: size,
    },
  };
}

function failCapture(partial) {
  return {
    ok: false,
    hierarchyPath: null,
    tapAllowed: false,
    diagnostics: {
      exitCode: partial.exitCode ?? -1,
      stdout: partial.stdout ?? "",
      stderr: partial.stderr ?? "",
      devicePath: partial.devicePath ?? "",
      localPath: partial.localPath ?? "",
      localExists: partial.localExists ?? fs.existsSync(partial.localPath || ""),
      localSize:
        partial.localSize ??
        (partial.localPath && fs.existsSync(partial.localPath) ? fs.statSync(partial.localPath).size : 0),
      stage: partial.stage,
      reason: partial.reason,
    },
  };
}

/**
 * Load hierarchy from an already-captured path (same-runtime SSOT).
 * Does not capture from device. Used by resolver/tap after captureShadeHierarchy.
 */
export function loadCapturedHierarchy(hierarchyPath) {
  if (!hierarchyPath || !path.isAbsolute(hierarchyPath)) {
    return {
      ok: false,
      tapAllowed: false,
      reason: "hierarchyPath must be absolute",
      diagnostics: {
        stage: "load_path",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath || "",
        localExists: false,
        localSize: 0,
      },
    };
  }
  if (!fs.existsSync(hierarchyPath)) {
    return {
      ok: false,
      tapAllowed: false,
      reason: "hierarchy file missing",
      diagnostics: {
        stage: "load_exists",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath,
        localExists: false,
        localSize: 0,
      },
    };
  }
  const size = fs.statSync(hierarchyPath).size;
  if (size <= 0) {
    return {
      ok: false,
      tapAllowed: false,
      reason: "hierarchy file empty",
      diagnostics: {
        stage: "load_nonempty",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath,
        localExists: true,
        localSize: size,
      },
    };
  }
  let xml;
  try {
    xml = fs.readFileSync(hierarchyPath, "utf8");
  } catch (e) {
    return {
      ok: false,
      tapAllowed: false,
      reason: String(e?.message || e),
      diagnostics: {
        stage: "load_read",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath,
        localExists: true,
        localSize: size,
      },
    };
  }
  if (!String(xml).trim()) {
    return {
      ok: false,
      tapAllowed: false,
      reason: "hierarchy content empty",
      diagnostics: {
        stage: "load_nonempty",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath,
        localExists: true,
        localSize: size,
      },
    };
  }
  const parse = parseHierarchyXml(xml);
  if (!parse.ok) {
    return {
      ok: false,
      tapAllowed: false,
      reason: parse.reason,
      diagnostics: {
        stage: "xml_parse",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: hierarchyPath,
        localExists: true,
        localSize: size,
      },
    };
  }
  return {
    ok: true,
    hierarchyPath,
    xml,
    nodes: parse.nodes,
    diagnostics: {
      stage: "load_ok",
      exitCode: 0,
      stdout: "",
      stderr: "",
      devicePath: "",
      localPath: hierarchyPath,
      localExists: true,
      localSize: size,
    },
  };
}

/**
 * Resolve exact MESSAGE child from a captured hierarchy path (or xml string for tests).
 * @param {object} input
 * @param {string} [input.hierarchyPath]
 * @param {string} [input.xml] test-only direct XML (must not be used with a different live path SSOT)
 * @param {string} input.exactMarker
 * @param {string} [input.expectedTitle]
 */
export function resolveExactMessageRow(input) {
  const { hierarchyPath, xml: xmlDirect, exactMarker, expectedTitle } = input;
  if (!exactMarker || typeof exactMarker !== "string") {
    return failResolve("exact_marker_required", { hierarchyPath: hierarchyPath || "" });
  }

  let loaded;
  if (xmlDirect != null) {
    if (!String(xmlDirect).trim()) {
      return failResolve("xml_empty", { hierarchyPath: hierarchyPath || "" });
    }
    const parse = parseHierarchyXml(xmlDirect);
    if (!parse.ok) return failResolve(parse.reason, { hierarchyPath: hierarchyPath || "" });
    loaded = { ok: true, hierarchyPath: hierarchyPath || null, xml: xmlDirect, nodes: parse.nodes };
  } else {
    loaded = loadCapturedHierarchy(hierarchyPath);
    if (!loaded.ok) {
      return {
        ok: false,
        tapAllowed: false,
        reason: loaded.reason,
        diagnostics: loaded.diagnostics,
        exactMarkerCount: 0,
      };
    }
  }

  const markers = loaded.nodes.filter((n) => n.text === exactMarker);
  if (markers.length === 0) {
    return failResolve("exact_marker_count_0", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 0,
    });
  }
  if (markers.length > 1) {
    return failResolve("exact_marker_count_gt_1", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: markers.length,
    });
  }

  const markerNode = markers[0];
  const row = findOwningExpandableRow(markerNode, loaded.nodes);
  if (!row) {
    return failResolve("no_expandableNotificationRow", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
    });
  }

  const rowTexts = collectDescendantTexts(row, loaded.nodes);
  if (rowTexts.some((t) => t.includes(FORBIDDEN_SUMMARY_SUBSTRING))) {
    return failResolve("summary_row_excluded", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
      row: describeNode(row),
      rowTexts,
    });
  }

  const title = findTitleInRow(row, loaded.nodes);
  if (expectedTitle != null && expectedTitle !== "" && title !== expectedTitle) {
    return failResolve("title_mismatch", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
      row: describeNode(row),
      title,
      expectedTitle,
      rowTexts,
    });
  }

  const rowBounds = parseBounds(row.bounds);
  const markerBounds = parseBounds(markerNode.bounds);
  if (!rowBounds || !markerBounds) {
    return failResolve("invalid_bounds", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
      row: describeNode(row),
    });
  }
  if (!boundsContain(rowBounds, markerBounds)) {
    return failResolve("marker_outside_row", {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
      row: describeNode(row),
    });
  }

  const expandBounds = findExpandStripBounds(row, loaded.nodes);
  const tap = planSafeContentTap({ rowBounds, markerBounds, expandBounds });
  if (!tap.ok) {
    return failResolve(tap.reason, {
      hierarchyPath: loaded.hierarchyPath || "",
      exactMarkerCount: 1,
      marker: describeNode(markerNode),
      row: describeNode(row),
      title,
      rowTexts,
    });
  }

  return {
    ok: true,
    tapAllowed: true,
    hierarchyPath: loaded.hierarchyPath,
    exactMarkerCount: 1,
    summaryExcluded: true,
    marker: describeNode(markerNode),
    row: {
      ...describeNode(row),
      title: title || null,
      texts: rowTexts,
    },
    tapCoordinates: tap.coordinates,
    tapInsideRow: true,
    diagnostics: {
      stage: "resolve_ok",
      exitCode: 0,
      stdout: "",
      stderr: "",
      devicePath: "",
      localPath: loaded.hierarchyPath || "",
      localExists: Boolean(loaded.hierarchyPath),
      localSize: loaded.hierarchyPath && fs.existsSync(loaded.hierarchyPath) ? fs.statSync(loaded.hierarchyPath).size : 0,
    },
  };
}

/**
 * Execute ONE content tap only when resolveExactMessageRow already passed.
 * Inject adb for tests — default never auto-runs without caller.
 */
export function executeContentTapIfAllowed(input) {
  const { resolveResult, adb, serial } = input;
  if (!resolveResult?.ok || resolveResult.tapAllowed !== true) {
    return {
      ok: false,
      tapped: false,
      reason: "tap_blocked_fail_closed",
      diagnostics: resolveResult?.diagnostics || {
        stage: "tap_blocked",
        exitCode: -1,
        stdout: "",
        stderr: "",
        devicePath: "",
        localPath: "",
        localExists: false,
        localSize: 0,
      },
    };
  }
  const { x, y } = resolveResult.tapCoordinates || {};
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return {
      ok: false,
      tapped: false,
      reason: "tap_coordinates_invalid",
      diagnostics: resolveResult.diagnostics,
    };
  }
  const r = adb(["-s", serial, "shell", "input", "tap", String(x), String(y)]);
  if (r.status !== 0) {
    return {
      ok: false,
      tapped: false,
      reason: "adb_input_tap_failed",
      diagnostics: {
        stage: "adb_input_tap",
        exitCode: r.status,
        stdout: r.stdout,
        stderr: r.stderr,
        devicePath: "",
        localPath: resolveResult.hierarchyPath || "",
        localExists: Boolean(resolveResult.hierarchyPath && fs.existsSync(resolveResult.hierarchyPath)),
        localSize: 0,
      },
    };
  }
  return {
    ok: true,
    tapped: true,
    tapCoordinates: { x, y },
    diagnostics: {
      stage: "tap_ok",
      exitCode: 0,
      stdout: r.stdout,
      stderr: r.stderr,
      devicePath: "",
      localPath: resolveResult.hierarchyPath || "",
      localExists: Boolean(resolveResult.hierarchyPath),
      localSize: 0,
    },
  };
}

/**
 * Full same-runtime chain for a future authorized MESSAGE KILLED attempt.
 * Captures once → resolves from that same hierarchyPath → taps only if gates pass.
 */
export function captureResolveAndTapMessageChild(input) {
  const capture = captureShadeHierarchy(input);
  if (!capture.ok) {
    return {
      ok: false,
      capture,
      resolve: null,
      tap: { ok: false, tapped: false, reason: "tap_unreachable_capture_failed" },
    };
  }
  const resolve = resolveExactMessageRow({
    hierarchyPath: capture.hierarchyPath,
    exactMarker: input.exactMarker,
    expectedTitle: input.expectedTitle,
  });
  if (!resolve.ok || !resolve.tapAllowed) {
    return {
      ok: false,
      capture,
      resolve,
      tap: { ok: false, tapped: false, reason: "tap_unreachable_resolve_failed" },
    };
  }
  if (input.executeTap !== true) {
    return {
      ok: true,
      capture,
      resolve,
      tap: { ok: false, tapped: false, reason: "tap_not_executed_executeTap_false" },
    };
  }
  const tap = executeContentTapIfAllowed({
    resolveResult: resolve,
    adb: input.adb,
    serial: input.serial,
  });
  return { ok: tap.ok, capture, resolve, tap };
}

function failResolve(reason, extra = {}) {
  return {
    ok: false,
    tapAllowed: false,
    reason,
    exactMarkerCount: extra.exactMarkerCount ?? 0,
    marker: extra.marker || null,
    row: extra.row || null,
    title: extra.title,
    expectedTitle: extra.expectedTitle,
    rowTexts: extra.rowTexts,
    diagnostics: {
      stage: "resolve_fail",
      reason,
      exitCode: -1,
      stdout: "",
      stderr: "",
      devicePath: "",
      localPath: extra.hierarchyPath || "",
      localExists: Boolean(extra.hierarchyPath && fs.existsSync(extra.hierarchyPath)),
      localSize:
        extra.hierarchyPath && fs.existsSync(extra.hierarchyPath) ? fs.statSync(extra.hierarchyPath).size : 0,
    },
  };
}

export function parseBounds(bounds) {
  const m = String(bounds || "").match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!m) return null;
  return {
    x1: Number(m[1]),
    y1: Number(m[2]),
    x2: Number(m[3]),
    y2: Number(m[4]),
  };
}

export function boundsContain(outer, inner) {
  return (
    inner.x1 >= outer.x1 &&
    inner.y1 >= outer.y1 &&
    inner.x2 <= outer.x2 &&
    inner.y2 <= outer.y2
  );
}

export function pointInside(bounds, x, y) {
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2;
}

function planSafeContentTap({ rowBounds, markerBounds, expandBounds }) {
  let x = Math.floor((markerBounds.x1 + markerBounds.x2) / 2);
  let y = Math.floor((markerBounds.y1 + markerBounds.y2) / 2);
  if (expandBounds && x >= expandBounds.x1) {
    x = Math.max(rowBounds.x1 + 40, expandBounds.x1 - 40);
  }
  if (!pointInside(rowBounds, x, y)) {
    return { ok: false, reason: "tap_outside_row" };
  }
  if (expandBounds && pointInside(expandBounds, x, y)) {
    return { ok: false, reason: "tap_hits_expand_control" };
  }
  return { ok: true, coordinates: { x, y } };
}

function describeNode(n) {
  return {
    resourceId: n.resourceId || "",
    className: n.className || "",
    text: n.text || "",
    contentDesc: n.contentDesc || "",
    clickable: n.clickable,
    bounds: n.bounds || "",
  };
}

/**
 * Flatten uiautomator hierarchy into nodes with parentIndex for ancestor walks.
 * Dependency-free stack parser for `<node ...>` dumps (no Product XML stack).
 */
export function parseHierarchyXml(xml) {
  try {
    if (!xml || !String(xml).includes("<hierarchy") || !String(xml).includes("<node")) {
      return { ok: false, reason: "invalid_xml_no_hierarchy" };
    }
    const nodes = [];
    const stack = [];
    const re = /<node\b([^>]*)\/?>|<\/node>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const token = m[0];
      if (token.startsWith("</")) {
        stack.pop();
        continue;
      }
      const attrs = m[1] || "";
      const selfClosing = token.endsWith("/>");
      const parentIndex = stack.length ? stack[stack.length - 1] : -1;
      const idx = nodes.length;
      nodes.push({
        index: idx,
        parentIndex,
        resourceId: attr(attrs, "resource-id"),
        className: attr(attrs, "class"),
        text: attr(attrs, "text"),
        contentDesc: attr(attrs, "content-desc"),
        clickable: attr(attrs, "clickable") || "false",
        enabled: attr(attrs, "enabled") || "true",
        bounds: attr(attrs, "bounds"),
        packageName: attr(attrs, "package"),
      });
      if (!selfClosing) stack.push(idx);
    }
    if (nodes.length === 0) return { ok: false, reason: "invalid_xml_no_nodes" };
    return { ok: true, nodes };
  } catch (e) {
    return { ok: false, reason: `invalid_xml:${String(e?.message || e)}` };
  }
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
  return m ? m[1] : "";
}

function findOwningExpandableRow(markerNode, nodes) {
  let cur = markerNode;
  while (cur) {
    if (String(cur.resourceId || "").endsWith(EXPANDABLE_ROW_ID_SUFFIX)) return cur;
    if (cur.parentIndex < 0) break;
    cur = nodes[cur.parentIndex];
  }
  return null;
}

function collectDescendantTexts(row, nodes) {
  const out = [];
  for (const n of nodes) {
    if (!isDescendantOrSelf(n, row, nodes)) continue;
    if (n.text) out.push(n.text);
  }
  return out;
}

function isDescendantOrSelf(n, ancestor, nodes) {
  let cur = n;
  while (cur) {
    if (cur.index === ancestor.index) return true;
    if (cur.parentIndex < 0) return false;
    cur = nodes[cur.parentIndex];
  }
  return false;
}

function findTitleInRow(row, nodes) {
  for (const n of nodes) {
    if (!isDescendantOrSelf(n, row, nodes)) continue;
    if (String(n.resourceId || "").endsWith("id/title") && n.text) return n.text;
  }
  return "";
}

function findExpandStripBounds(row, nodes) {
  for (const n of nodes) {
    if (!isDescendantOrSelf(n, row, nodes)) continue;
    const rid = String(n.resourceId || "");
    if (rid.endsWith("expand_button") || rid.endsWith("expand_button_touch_container")) {
      return parseBounds(n.bounds);
    }
  }
  return null;
}

/** Build a minimal SystemUI-like hierarchy XML for offline tests. */
export function buildTestHierarchyXml(rows) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const children = (row.nodes || [])
        .map(
          (n, i) =>
            `<node index="${i}" text="${escapeXml(n.text || "")}" resource-id="${escapeXml(n.resourceId || "")}" class="${escapeXml(n.className || "android.widget.TextView")}" content-desc="" clickable="${n.clickable || "false"}" enabled="true" bounds="${escapeXml(n.bounds || "")}" />`,
        )
        .join("");
      return `<node index="${rowIndex}" text="" resource-id="com.android.systemui:id/expandableNotificationRow" class="android.widget.FrameLayout" content-desc="" clickable="${row.clickable || "true"}" enabled="true" bounds="${escapeXml(row.bounds)}" >${children}</node>`;
    })
    .join("");
  return `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="com.android.systemui:id/notification_stack_scroller" class="android.view.ViewGroup" content-desc="" clickable="false" enabled="true" bounds="[0,0][1080,2340]">${rowXml}</node></hierarchy>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
