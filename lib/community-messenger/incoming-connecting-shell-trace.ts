"use client";

/** P2-A — incoming connecting shell 계측 (prod logcat) */

export function logIncomingConnectingShellVisible(extra: Record<string, unknown> = {}): void {
  console.info("[p2-a] incoming_shell_visible", { at: Date.now(), ...extra });
}

export function logIncomingConnectingShellHidden(extra: Record<string, unknown> = {}): void {
  console.info("[p2-a] incoming_shell_hidden", { at: Date.now(), ...extra });
}

export function logIncomingConnectingShellFailed(extra: Record<string, unknown> = {}): void {
  console.info("[p2-a] incoming_shell_failed", { at: Date.now(), ...extra });
}
