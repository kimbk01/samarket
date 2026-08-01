/**
 * iOS CallKit caller identity contract.
 * - Source wiring: VoIPPushRegistry / CallKitProvider must use IncomingCallCallerIdentity.
 * - Algorithm mirror of IncomingCallCallerIdentity.swift (keep in sync).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function mustContain(rel, needle, label) {
  if (!read(rel).includes(needle)) failures.push(`${label}: missing ${JSON.stringify(needle)} in ${rel}`);
}

function mustNotContain(rel, needle, label) {
  if (read(rel).includes(needle)) failures.push(`${label}: forbidden ${JSON.stringify(needle)} in ${rel}`);
}

function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

// --- JS mirror of IncomingCallCallerIdentity.swift ---
const FALLBACK = "수신 통화";

function collapseWhitespace(s) {
  return s.replace(/\s+/g, " ");
}

function isCallKindLabel(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  const spaced = collapseWhitespace(trimmed).toLowerCase();
  const compact = spaced.replace(/ /g, "");
  if (spaced === "video call" || spaced === "voice call") return true;
  if (compact === "영상통화" || compact === "음성통화") return true;
  if (spaced === "영상 통화" || spaced === "음성 통화") return true;
  return false;
}

function stringValue(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return t ? t : null;
}

function extractCallerNameFromBody(body) {
  const trimmed = stringValue(body);
  if (!trimmed) return null;
  const suffix = "님의 전화";
  if (!trimmed.endsWith(suffix)) return null;
  const name = trimmed.slice(0, -suffix.length).trim();
  return name || null;
}

function resolveDisplayName(data) {
  for (const key of ["callerName", "caller_name", "displayName", "display_name"]) {
    const raw = stringValue(data[key]);
    if (raw && !isCallKindLabel(raw)) return raw;
  }
  const fromBody = extractCallerNameFromBody(data.body);
  if (fromBody && !isCallKindLabel(fromBody)) return fromBody;
  const title = stringValue(data.title);
  if (title && !isCallKindLabel(title)) return title;
  return FALLBACK;
}

function resolveRemoteHandle(data, displayName) {
  for (const key of [
    "callerId",
    "caller_id",
    "callerUserId",
    "caller_user_id",
    "userId",
    "user_id",
  ]) {
    const id = stringValue(data[key]);
    if (id && !isCallKindLabel(id)) return id;
  }
  return displayName;
}

function resolveHasVideo(data) {
  const kind = stringValue(data.kind) ?? stringValue(data.call_kind) ?? stringValue(data.callKind) ?? "";
  return kind.toLowerCase() === "video";
}

function resolve(data) {
  const displayName = resolveDisplayName(data);
  return {
    displayName,
    remoteHandle: resolveRemoteHandle(data, displayName),
    hasVideo: resolveHasVideo(data),
  };
}

// --- Source wiring ---
const identityRel = "ios/App/App/Push/IncomingCallCallerIdentity.swift";
const voipRel = "ios/App/App/Push/VoIPPushRegistry.swift";
const callkitRel = "ios/App/App/Push/CallKitProvider.swift";
const pbxRel = "ios/App/App.xcodeproj/project.pbxproj";

mustContain(identityRel, "struct IncomingCallCallerIdentity", "identity-struct");
mustContain(identityRel, "static func resolve(from", "identity-resolve");
mustContain(identityRel, "callerName", "identity-callerName");
mustContain(identityRel, "caller_name", "identity-caller_name");
mustContain(identityRel, "isCallKindLabel", "identity-kind-ban");
mustContain(identityRel, "님의 전화", "identity-body");
mustContain(identityRel, 'kind.lowercased() == "video"', "identity-hasVideo");

mustContain(voipRel, "IncomingCallCallerIdentity.resolve(from: data)", "voip-uses-resolver");
mustContain(voipRel, "callerDisplayName: identity.displayName", "voip-display");
mustContain(voipRel, "remoteHandle: identity.remoteHandle", "voip-handle");
mustContain(voipRel, "hasVideo: identity.hasVideo", "voip-hasVideo");
mustNotContain(voipRel, 'let caller = (data["title"] as? String)', "voip-no-title-caller");
mustNotContain(voipRel, "handle: caller", "voip-no-legacy-handle");

mustContain(callkitRel, "callerDisplayName: String", "callkit-param-display");
mustContain(callkitRel, "remoteHandle: String", "callkit-param-handle");
mustContain(callkitRel, "update.localizedCallerName = resolvedDisplayName", "callkit-localized");
mustContain(callkitRel, "CXHandle(type: .generic, value: resolvedRemoteHandle)", "callkit-remote");
mustContain(callkitRel, "callerName: resolvedDisplayName", "callkit-runtime-name");
mustNotContain(callkitRel, "update.localizedCallerName = handle", "callkit-no-handle-as-name");
mustContain(callkitRel, "func reportIncomingCall", "callkit-report-kept");
mustContain(callkitRel, "reportNewIncomingCall", "callkit-new-incoming-kept");
mustContain(callkitRel, "markTerminalSuppressed", "callkit-terminal-kept");
mustContain(callkitRel, "terminal_suppress_after_incoming", "callkit-late-incoming-kept");

mustContain(pbxRel, "IncomingCallCallerIdentity.swift", "pbx-file");

// Android / server must not be in this verify scope — ensure we only touch iOS paths above.

// --- Algorithm cases ---
const cases = [
  {
    name: "callerName beats title",
    data: { title: "영상 통화", callerName: "Alice", kind: "voice" },
    expect: { displayName: "Alice", remoteHandle: "Alice", hasVideo: false },
  },
  {
    name: "caller_name snake",
    data: { title: "음성 통화", caller_name: "Bob", kind: "audio" },
    expect: { displayName: "Bob", remoteHandle: "Bob", hasVideo: false },
  },
  {
    name: "displayName",
    data: { title: "영상 통화", displayName: "Carol", kind: "video" },
    expect: { displayName: "Carol", remoteHandle: "Carol", hasVideo: true },
  },
  {
    name: "display_name",
    data: { title: "음성 통화", display_name: "Dave", kind: "voice" },
    expect: { displayName: "Dave", remoteHandle: "Dave", hasVideo: false },
  },
  {
    name: "title video kind rejected",
    data: { title: "영상 통화", kind: "video" },
    expect: { displayName: FALLBACK, remoteHandle: FALLBACK, hasVideo: true },
  },
  {
    name: "title voice kind rejected",
    data: { title: "음성 통화", kind: "voice" },
    expect: { displayName: FALLBACK, remoteHandle: FALLBACK, hasVideo: false },
  },
  {
    name: "title Video call rejected",
    data: { title: "Video call", kind: "video" },
    expect: { displayName: FALLBACK, remoteHandle: FALLBACK, hasVideo: true },
  },
  {
    name: "title Voice call rejected",
    data: { title: "Voice call", kind: "voice" },
    expect: { displayName: FALLBACK, remoteHandle: FALLBACK, hasVideo: false },
  },
  {
    name: "body extract",
    data: { title: "영상 통화", body: "홍길동님의 전화", kind: "video" },
    expect: { displayName: "홍길동", remoteHandle: "홍길동", hasVideo: true },
  },
  {
    name: "body extract spaced",
    data: { title: "음성 통화", body: "홍길동 님의 전화", kind: "voice" },
    expect: { displayName: "홍길동", remoteHandle: "홍길동", hasVideo: false },
  },
  {
    name: "fallback when empty",
    data: { kind: "voice" },
    expect: { displayName: FALLBACK, remoteHandle: FALLBACK, hasVideo: false },
  },
  {
    name: "callerId remoteHandle",
    data: { title: "영상 통화", callerName: "Eve", callerId: "user-eve", kind: "video" },
    expect: { displayName: "Eve", remoteHandle: "user-eve", hasVideo: true },
  },
  {
    name: "caller_id remoteHandle",
    data: { caller_name: "Frank", caller_id: "uid-frank", kind: "voice" },
    expect: { displayName: "Frank", remoteHandle: "uid-frank", hasVideo: false },
  },
  {
    name: "kind video hasVideo true",
    data: { callerName: "Gina", kind: "video" },
    expect: { displayName: "Gina", remoteHandle: "Gina", hasVideo: true },
  },
  {
    name: "kind voice hasVideo false",
    data: { callerName: "Hank", kind: "voice" },
    expect: { displayName: "Hank", remoteHandle: "Hank", hasVideo: false },
  },
  {
    name: "callerName preferred over body",
    data: {
      title: "영상 통화",
      callerName: "Ivy",
      body: "Other님의 전화",
      kind: "video",
    },
    expect: { displayName: "Ivy", remoteHandle: "Ivy", hasVideo: true },
  },
  {
    name: "compact kind label rejected as name",
    data: { callerName: "영상통화", body: "실명님의 전화", kind: "video" },
    expect: { displayName: "실명", remoteHandle: "실명", hasVideo: true },
  },
];

for (const c of cases) {
  const got = resolve(c.data);
  assert(got.displayName === c.expect.displayName, `${c.name}: displayName got=${got.displayName} want=${c.expect.displayName}`);
  assert(got.remoteHandle === c.expect.remoteHandle, `${c.name}: remoteHandle got=${got.remoteHandle} want=${c.expect.remoteHandle}`);
  assert(got.hasVideo === c.expect.hasVideo, `${c.name}: hasVideo got=${got.hasVideo} want=${c.expect.hasVideo}`);
  assert(!isCallKindLabel(got.displayName) || got.displayName === FALLBACK, `${c.name}: displayName must not be kind label`);
  assert(!isCallKindLabel(got.remoteHandle) || got.remoteHandle === FALLBACK || got.remoteHandle === got.displayName, `${c.name}: remoteHandle kind check`);
}

// Kind labels must never win as displayName when only title present
for (const title of ["영상 통화", "음성 통화", "영상통화", "음성통화", "Video call", "Voice call", "Video Call", "Voice Call"]) {
  const got = resolve({ title, kind: "video" });
  assert(got.displayName === FALLBACK, `title-only ${title} → fallback`);
}

if (failures.length) {
  console.error("verify:ios-callkit-caller-identity-contract FAIL");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify:ios-callkit-caller-identity-contract PASS");
