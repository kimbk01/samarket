"use client";

/** 수신 accept → CallClient paint 전 단일 연결 중 surface 계측 */

export function logCallConnectingSurfaceVisible(extra: Record<string, unknown> = {}): void {
  console.info("[call-connecting] surface_visible", { at: Date.now(), ...extra });
}

export function logCallConnectingSurfaceHidden(extra: Record<string, unknown> = {}): void {
  console.info("[call-connecting] surface_hidden", { at: Date.now(), ...extra });
}
