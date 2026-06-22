"use client";

import type { CallEngineActionName } from "@/lib/community-messenger/call-engine/call-engine-types";

type ActionLockSet = Set<CallEngineActionName>;

const actionLocks = new Map<string, ActionLockSet>();
const joinLocks = new Set<string>();
const routeLocks = new Set<string>();
const ringtoneLocks = new Set<string>();
const terminalConsumedLocks = new Set<string>();
const surfaceLocks = new Map<string, string>();

function normalize(callId: string): string {
  return callId.trim();
}

function getActionSet(callId: string): ActionLockSet {
  const sid = normalize(callId);
  let set = actionLocks.get(sid);
  if (!set) {
    set = new Set<CallEngineActionName>();
    actionLocks.set(sid, set);
  }
  return set;
}

export function tryLockCallEngineActionOnce(callId: string, action: CallEngineActionName): boolean {
  const sid = normalize(callId);
  if (!sid || terminalConsumedLocks.has(sid)) return false;
  const set = getActionSet(sid);
  if (set.has(action)) return false;
  set.add(action);
  return true;
}

export function unlockCallEngineAction(callId: string, action: CallEngineActionName): void {
  const sid = normalize(callId);
  if (!sid) return;
  const set = actionLocks.get(sid);
  if (!set) return;
  set.delete(action);
  if (set.size === 0) actionLocks.delete(sid);
}

export function tryLockCallEngineJoinOnce(callId: string): boolean {
  const sid = normalize(callId);
  if (!sid || terminalConsumedLocks.has(sid) || joinLocks.has(sid)) return false;
  joinLocks.add(sid);
  return true;
}

export function tryLockCallEngineRouteOnce(callId: string): boolean {
  const sid = normalize(callId);
  if (!sid || terminalConsumedLocks.has(sid) || routeLocks.has(sid)) return false;
  routeLocks.add(sid);
  return true;
}

export function tryLockCallEngineRingtoneOwnerOnce(callId: string): boolean {
  const sid = normalize(callId);
  if (!sid || terminalConsumedLocks.has(sid) || ringtoneLocks.has(sid)) return false;
  ringtoneLocks.add(sid);
  return true;
}

export function tryLockCallEngineSurfaceOwner(callId: string, owner: string): boolean {
  const sid = normalize(callId);
  if (!sid || terminalConsumedLocks.has(sid)) return false;
  const existing = surfaceLocks.get(sid);
  if (existing && existing !== owner) return false;
  surfaceLocks.set(sid, owner);
  return true;
}

export function markCallEngineTerminalConsumed(callId: string): void {
  const sid = normalize(callId);
  if (!sid) return;
  terminalConsumedLocks.add(sid);
}

export function isCallEngineTerminalConsumed(callId: string): boolean {
  const sid = normalize(callId);
  if (!sid) return false;
  return terminalConsumedLocks.has(sid);
}

export function clearCallEngineLocks(callId: string): void {
  const sid = normalize(callId);
  if (!sid) return;
  actionLocks.delete(sid);
  joinLocks.delete(sid);
  routeLocks.delete(sid);
  ringtoneLocks.delete(sid);
  surfaceLocks.delete(sid);
}

export function resetCallEngineLocksForTests(): void {
  actionLocks.clear();
  joinLocks.clear();
  routeLocks.clear();
  ringtoneLocks.clear();
  terminalConsumedLocks.clear();
  surfaceLocks.clear();
}
