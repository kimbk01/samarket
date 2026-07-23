/**
 * Phase I — Domain header / composer dock contracts (not_wired).
 * DO NOT replace product header/dock components in this phase.
 */

import type { ChatDomain } from "@/lib/chat-domain/four-domain-freeze";

export type DomainRoomHeaderModel = {
  chatDomain: ChatDomain;
  roomId: string;
  title: string;
  subtitle?: string | null;
};

export type DomainRoomDockModel = {
  chatDomain: ChatDomain;
  roomId: string;
  composerEnabled: boolean;
};

export function buildDomainRoomHeaderModel(
  _input: DomainRoomHeaderModel,
): { status: "not_wired"; error: string } {
  return { status: "not_wired", error: "phase_i_domain_header_not_wired" };
}

export function buildDomainRoomDockModel(
  _input: DomainRoomDockModel,
): { status: "not_wired"; error: string } {
  return { status: "not_wired", error: "phase_i_domain_dock_not_wired" };
}
