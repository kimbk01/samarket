#!/usr/bin/env node
/**
 * Android device notification settings dump — Notification P0.5 lock/heads-up QA.
 * Usage (from other QA scripts):
 *   import { dumpDeviceNotificationSettings, dibayNotificationChannelLines } from "./notification-device-settings-dump.mjs";
 */
import { spawnSync } from "node:child_process";

const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const PKG = "com.dibay.app";

export function adbOut(serial, ...args) {
  return spawnSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8" }).stdout ?? "";
}

export function grepLines(text, pattern) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
  return text.split("\n").filter((l) => re.test(l));
}

/** `dumpsys notification --noredact` 중 dibay 관련 라인 */
export function dibayNotificationChannelLines(serial) {
  const text = adbOut(serial, "shell", "dumpsys", "notification", "--noredact");
  return grepLines(text, /com\.dibay\.app|dibay_messages/i);
}

export function parseMessagesChannelImportance(lines) {
  const joined = lines.join("\n");
  const v2 = /dibay_messages_v2[\s\S]{0,400}?importance=(\d+)/i.exec(joined);
  const legacy = /dibay_messages[^_\w][\s\S]{0,400}?importance=(\d+)/i.exec(joined);
  const m = v2 ?? legacy ?? /NotificationChannel\{[^}]*dibay_messages[^}]*importance=(\d+)/i.exec(joined);
  return m ? Number(m[1]) : null;
}

export function dumpDeviceNotificationSettings(serial, logFn = console.log) {
  const prefix = `[device-notif-dump:${serial || "default"}]`;
  const sections = [];

  const notif = adbOut(serial, "shell", "dumpsys", "notification", "--noredact");
  const dibayLines = grepLines(notif, /com\.dibay\.app|dibay_messages/i);
  sections.push({ name: "dumpsys_notification_dibay", lines: dibayLines.slice(0, 80) });

  const pkg = adbOut(serial, "shell", "dumpsys", "package", PKG);
  const postPerm = grepLines(pkg, /POST_NOTIFICATIONS|runtime permissions/i);
  sections.push({ name: "dumpsys_package_post_notifications", lines: postPerm.slice(0, 40) });

  const assistant = adbOut(serial, "shell", "cmd", "notification", "get_approved_assistant");
  sections.push({ name: "notification_assistant", lines: assistant.trim().split("\n").filter(Boolean) });

  const appops = adbOut(serial, "shell", "cmd", "appops", "get", PKG, "POST_NOTIFICATION");
  sections.push({ name: "appops_post_notification", lines: appops.trim().split("\n").filter(Boolean) });

  const zen = adbOut(serial, "shell", "settings", "get", "global", "zen_mode");
  const zenVal = zen.trim();
  sections.push({
    name: "dnd_zen_mode",
    lines: [`zen_mode=${zenVal}`, zenVal === "0" ? "dnd=OFF" : "dnd=ON_OR_PARTIAL"],
  });

  const power = adbOut(serial, "shell", "dumpsys", "power");
  const screenOn = /Display Power: state=ON|mHoldingDisplaySuspendBlocker=true/.test(power);
  sections.push({
    name: "screen_power",
    lines: [screenOn ? "screen=ON" : "screen=OFF", ...grepLines(power, /Display Power|Wakefulness/i).slice(0, 6)],
  });

  const channelImportance = parseMessagesChannelImportance(dibayLines);
  sections.push({
    name: "dibay_messages_channel",
    lines: [
      `parsedImportance=${channelImportance ?? "unknown"}`,
      channelImportance != null && channelImportance >= 4 ? "importance=HIGH_OR_ABOVE" : "importance=BELOW_HIGH_OR_UNKNOWN",
    ],
  });

  for (const section of sections) {
    logFn(`${prefix} === ${section.name} ===`);
    for (const line of section.lines) logFn(`${prefix} ${line}`);
  }

  return {
    dibayLines,
    channelImportance,
    dndZenMode: zenVal,
    screenOn,
    postNotificationsGranted: /allow/i.test(postPerm.join("\n")),
    sections,
  };
}

export function formatDeviceDumpForReport(dump) {
  return {
    channelImportance: dump.channelImportance,
    dndZenMode: dump.dndZenMode,
    screenOn: dump.screenOn,
    postNotificationsGranted: dump.postNotificationsGranted,
    dibaySample: dump.dibayLines.slice(-8),
  };
}
