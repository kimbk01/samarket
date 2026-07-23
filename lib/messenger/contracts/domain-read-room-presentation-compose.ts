/**
 * Room presentation Read Surface — Domain Header before any Legacy chrome.
 * Owner store_order → legacy (out of canary scope) — Owner Header Factory still exists for surface prep.
 */
import { createClient } from "@supabase/supabase-js";
import {
  createGeneralDirectLiveBootstrapSource,
  createGroupLiveBootstrapSource,
  createTradeLiveBootstrapSource,
  createStoreOrderCustomerLiveBootstrapSource,
  createStoreOrderOwnerLiveBootstrapSource,
} from "@/lib/messenger/contracts/phase11b-live-domain-loaders";
import {
  assertDomainReadSurfaceWritersOff,
  killDomainReadBundle,
  type DomainReadBundle,
} from "@/lib/messenger/contracts/domain-read-surface-canary";
import { runGeneralDirectBootstrap } from "@/lib/messenger/general-direct/phase6-bootstrap";
import { runGroupBootstrap } from "@/lib/messenger/group/phase6-bootstrap";
import { runTradeBootstrap } from "@/lib/messenger/trade/phase6-bootstrap";
import { runStoreOrderBootstrap } from "@/lib/messenger/store-order/phase6-bootstrap";
import { buildGeneralDirectHeaderModel } from "@/lib/messenger/general-direct/header";
import { buildGroupHeaderModel } from "@/lib/messenger/group/header";
import { buildTradeHeaderModel } from "@/lib/messenger/trade/header";
import { buildStoreOrderCustomerHeaderModel } from "@/lib/messenger/store-order/customer-header";
import { resolveDomainReadRequestLanguage } from "@/lib/messenger/contracts/domain-read-request-language";
import {
  composeDomainRoomHeaderChrome,
  type DomainRoomHeaderChrome,
} from "@/lib/messenger/contracts/domain-room-header-chrome";
import { GENERAL_DIRECT_DOMAIN } from "@/lib/messenger/general-direct/types";
import { GROUP_DOMAIN } from "@/lib/messenger/group/domain";
import { TRADE_DOMAIN } from "@/lib/messenger/trade/domain";
import { STORE_ORDER_DOMAIN } from "@/lib/messenger/store-order/design-lock";

export type DomainReadRoomPresentationDto = Readonly<{
  authority: "domain_room_presentation_canary";
  viewerUserId: string;
  roomId: string;
  producedAt: string;
  chatDomain: "general_direct" | "group" | "trade" | "store_order";
  domainIdentityKey: string;
  bundle: DomainReadBundle;
  header:
    | {
        kind: "general_peer";
        title: string;
        avatarUrl: string | null;
        surface: "general_direct_1to1";
      }
    | {
        kind: "group";
        groupName: string;
        groupImageUrl: string | null;
        memberCount: number;
        forbidsGeneralDirectHeader: true;
      }
    | {
        kind: "trade";
        /** Room Header primary — viewer-relative counterparty */
        peerLabel: string;
        peerAvatarUrl: string | null;
        /** Product context (list primary + in-room dock / secondary chrome) */
        productTitle: string;
        productImageUrl: string | null;
        itemId: string;
        productChatId: string | null;
        forbidsGeneralDirectHeader: true;
      }
    | {
        kind: "buyer_store";
        storeName: string;
        storeImageUrl: string | null;
        orderId: string | null;
        orderStatusLabel: string | null;
        forbidsGeneralDirectHeader: true;
        forbidsTradeHeader: true;
      };
  /** Domain Header Factory chrome — UI must not reinfer General chrome */
  chrome: DomainRoomHeaderChrome;
  writers: {
    cache: false;
    realtime: false;
    badge: false;
    notification: false;
    atomic: false;
  };
}>;

export type DomainReadRoomComposeResult =
  | { ok: true; dto: DomainReadRoomPresentationDto }
  | { ok: false; trigger: string; surface: "legacy"; error?: string; bundle?: DomainReadBundle };

export async function composeDomainReadRoomPresentationDto(
  viewerUserId: string,
  roomIdRaw: string
): Promise<DomainReadRoomComposeResult> {
  try {
    assertDomainReadSurfaceWritersOff();
    const roomId = roomIdRaw.trim();
    if (!roomId) {
      return { ok: false, trigger: "room_id_missing", surface: "legacy" };
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!url || !key) {
      return { ok: false, trigger: "supabase_env_missing", surface: "legacy" };
    }

    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const generation = `room-pres-${Date.now()}`;

    const [gd, group, trade, soCust, soOwner] = await Promise.all([
      runGeneralDirectBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGeneralDirectLiveBootstrapSource(sb),
      }),
      runGroupBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createGroupLiveBootstrapSource(sb),
      }),
      runTradeBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        source: createTradeLiveBootstrapSource(sb),
      }),
      runStoreOrderBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        surfaceRole: "customer",
        source: createStoreOrderCustomerLiveBootstrapSource(sb),
      }),
      runStoreOrderBootstrap({
        viewerUserId,
        generation,
        snapshotKind: "full",
        surfaceRole: "owner",
        source: createStoreOrderOwnerLiveBootstrapSource(sb),
      }),
    ]);

    const gdHit = gd.rows.find((r) => r.roomId === roomId) ?? null;
    const gHit = group.rows.find((r) => r.roomId === roomId) ?? null;
    const trHit = trade.rows.find((r) => r.roomId === roomId) ?? null;
    const soCustHit = soCust.rows.find((r) => r.roomId === roomId) ?? null;
    const soOwnerHit = soOwner.rows.find((r) => r.roomId === roomId) ?? null;

    const hits = [
      gdHit ? "general_direct" : null,
      gHit ? "group" : null,
      trHit ? "trade" : null,
      soCustHit ? "store_order_customer" : null,
      soOwnerHit && !soCustHit ? "store_order_owner" : null,
    ].filter(Boolean);

    if (hits.length > 1) {
      return { ok: false, trigger: "domain_contamination", surface: "legacy" };
    }
    if (hits.length === 0) {
      return { ok: false, trigger: "room_not_in_domain_snapshot", surface: "legacy" };
    }
    if (hits[0] === "store_order_owner") {
      return {
        ok: false,
        trigger: "store_order_owner_out_of_scope",
        surface: "legacy",
        bundle: "store_order_customer",
      };
    }

    const producedAt = new Date().toISOString();
    const writers = {
      cache: false as const,
      realtime: false as const,
      badge: false as const,
      notification: false as const,
      atomic: false as const,
    };

    if (gdHit) {
      const header = buildGeneralDirectHeaderModel(gdHit);
      const chrome = composeDomainRoomHeaderChrome({ kind: "general_peer" });
      const dto: DomainReadRoomPresentationDto = {
        authority: "domain_room_presentation_canary",
        viewerUserId,
        roomId,
        producedAt,
        chatDomain: GENERAL_DIRECT_DOMAIN,
        domainIdentityKey: gdHit.domainIdentityKey,
        bundle: "inbox",
        header: {
          kind: "general_peer",
          title: header.title,
          avatarUrl: header.avatarUrl,
          surface: "general_direct_1to1",
        },
        chrome,
        writers,
      };
      return { ok: true, dto };
    }

    if (gHit) {
      const header = buildGroupHeaderModel(gHit);
      const chrome = composeDomainRoomHeaderChrome({
        kind: "group",
        memberCount: header.memberCount,
        groupSubtype: header.subtype,
      });
      const dto: DomainReadRoomPresentationDto = {
        authority: "domain_room_presentation_canary",
        viewerUserId,
        roomId,
        producedAt,
        chatDomain: GROUP_DOMAIN,
        domainIdentityKey: gHit.domainIdentityKey,
        bundle: "inbox",
        header: {
          kind: "group",
          groupName: header.groupName,
          groupImageUrl: header.groupImageUrl,
          memberCount: header.memberCount,
          forbidsGeneralDirectHeader: true,
        },
        chrome,
        writers,
      };
      return { ok: true, dto };
    }

    if (trHit) {
      const header = buildTradeHeaderModel(trHit, { viewerUserId });
      const chrome = composeDomainRoomHeaderChrome({
        kind: "trade",
        peerLabel: header.peerLabel,
        productTitle: header.productTitle,
      });
      const dto: DomainReadRoomPresentationDto = {
        authority: "domain_room_presentation_canary",
        viewerUserId,
        roomId,
        producedAt,
        chatDomain: TRADE_DOMAIN,
        domainIdentityKey: trHit.domainIdentityKey,
        bundle: "trade",
        header: {
          kind: "trade",
          peerLabel: header.peerLabel,
          peerAvatarUrl: header.peerAvatarUrl,
          productTitle: header.productTitle,
          productImageUrl: header.productImageUrl,
          itemId: header.itemId,
          productChatId: header.productChatId,
          forbidsGeneralDirectHeader: true,
        },
        chrome,
        writers,
      };
      return { ok: true, dto };
    }

    if (soCustHit) {
      const lang = await resolveDomainReadRequestLanguage();
      const header = buildStoreOrderCustomerHeaderModel(soCustHit, lang);
      if (header.kind !== "buyer_store") {
        killDomainReadBundle("store_order_customer", "header_kind_invalid");
        return {
          ok: false,
          trigger: "header_kind_invalid",
          surface: "legacy",
          bundle: "store_order_customer",
        };
      }
      const chrome = composeDomainRoomHeaderChrome({
        kind: "buyer_store",
        orderId: header.orderId,
        orderStatusLabel: header.orderStatusLabel,
      });
      const dto: DomainReadRoomPresentationDto = {
        authority: "domain_room_presentation_canary",
        viewerUserId,
        roomId,
        producedAt,
        chatDomain: STORE_ORDER_DOMAIN,
        domainIdentityKey: soCustHit.domainIdentityKey,
        bundle: "store_order_customer",
        header: {
          kind: "buyer_store",
          storeName: header.storeName,
          storeImageUrl: header.storeImageUrl,
          orderId: header.orderId,
          orderStatusLabel: header.orderStatusLabel,
          forbidsGeneralDirectHeader: true,
          forbidsTradeHeader: true,
        },
        chrome,
        writers,
      };
      return { ok: true, dto };
    }

    return { ok: false, trigger: "room_not_in_domain_snapshot", surface: "legacy" };
  } catch (e) {
    return {
      ok: false,
      trigger: "runtime_exception",
      surface: "legacy",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
