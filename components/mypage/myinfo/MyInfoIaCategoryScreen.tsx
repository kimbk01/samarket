"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MyScreen } from "@/components/mypage/ds/MyScreen";
import { MyStateView } from "@/components/mypage/ds/MyStateView";
import { LogoutActionTrigger } from "@/components/my/settings/LogoutContent";
import { MyPageAdminMenuEntry } from "@/components/mypage/MyPageAdminMenuEntry";
import { MyInfoMenuSection } from "@/components/mypage/myinfo/MyInfoMenuSection";
import {
  MyInfoCustomerCenterRow,
  MyInfoHomeLinkRow,
  MyInfoStoreOwnerEntryRow,
  renderAccountItem,
  useCustomerCenterUnreadTotal,
} from "@/components/mypage/myinfo/MyInfoHomeMenuSections";
import { MypageRequiredInfoSummary } from "@/components/mypage/home/MypageRequiredInfoSummary";
import {
  MypageHomeValuesProvider,
  useMypageHomeValuesState,
} from "@/components/mypage/home/mypage-home-values-context";
import { useMypageHomeModel } from "@/hooks/use-mypage-home-model";
import { useClientMembershipState } from "@/hooks/use-client-membership-state";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { buildMypageAddressesHrefFromPath } from "@/lib/addresses/mypage-addresses-return-to";
import { buildMypageIaCategoryHref, type MypageIaCategory, type MypageIaGroup, type MypageIaRow } from "@/lib/mypage/mypage-ia";
import type { MypageOwnerStoreGateSeed } from "@/lib/my/load-mypage-owner-store-gate-seed";
import type { MypageAdminMenuSeed } from "@/lib/my/load-mypage-admin-menu-seed";
import { MYPAGE_HOME_MENU_FLOW_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

type Seeds = {
  ownerStoreGateSeed?: MypageOwnerStoreGateSeed | null;
  adminMenuSeed?: MypageAdminMenuSeed | null;
};

export const MYPAGE_PC_LOGIN_HREF = "/mypage/section/settings/pc-login";

/** PC QR 로그인 행 — 디바이 휴대폰 앱에서만 (PC·모바일 웹에서는 찍을 수 없으므로 숨김) */
function PcLoginIaRow({ first }: { first: boolean }) {
  const [isApp, setIsApp] = useState(false);
  useEffect(() => {
    setIsApp(isCapacitorNativePlatform());
  }, []);
  if (!isApp) return null;
  return (
    <MyInfoHomeLinkRow
      first={first}
      item={{ href: MYPAGE_PC_LOGIN_HREF, titleKey: "mypage_mnav_settings_pc_login", icon: "shield" }}
    />
  );
}

function IaRow({
  row,
  index,
  addressesHref,
  ccUnread,
  ownerStoreGateSeed,
}: {
  row: MypageIaRow;
  index: number;
  addressesHref: string;
  ccUnread: number;
} & Seeds) {
  const { safeT } = useI18n();
  const first = index === 0;
  if (!("kind" in row) || row.kind === undefined || row.kind === "link") {
    return <MyInfoHomeLinkRow first={first} item={row as Extract<MypageIaRow, { href: string }>} />;
  }
  switch (row.kind) {
    case "addresses":
    case "language-toggle":
      return renderAccountItem(row, index, addressesHref);
    case "store-owner-entry":
      return (
        <MyInfoStoreOwnerEntryRow
          first={first}
          ownerStoreGate={ownerStoreGateSeed?.ownerStoreGate}
          ownerStoreGateFirstId={ownerStoreGateSeed?.ownerStoreGateFirstId}
        />
      );
    case "customer-center":
      return <MyInfoCustomerCenterRow first={first} unread={ccUnread} />;
    case "logout":
      return (
        <LogoutActionTrigger
          variant="menu_row"
          surface="card"
          label={safeT("mypage_hub_logout")}
        />
      );
    case "admin":
      return null;
    case "pc-login":
      return <PcLoginIaRow first={first} />;
    default:
      return null;
  }
}

function IaGroup({
  group,
  addressesHref,
  ccUnread,
  ownerStoreGateSeed,
}: { group: MypageIaGroup; addressesHref: string; ccUnread: number } & Seeds) {
  const { safeT } = useI18n();
  const rows = group.rows.filter((r) => !("kind" in r) || r.kind !== "admin");
  return (
    <MyInfoMenuSection title={group.titleKey ? safeT(group.titleKey) : undefined}>
      {rows.map((row, index) => (
        <IaRow
          key={"href" in row ? row.href : `${row.kind}:${index}`}
          row={row}
          index={index}
          addressesHref={addressesHref}
          ccUnread={ccUnread}
          ownerStoreGateSeed={ownerStoreGateSeed}
        />
      ))}
    </MyInfoMenuSection>
  );
}

function AccountRequiredInfo() {
  const { projection, refresh, loadFailed } = useMypageHomeModel(true);
  return (
    <MypageRequiredInfoSummary
      projection={projection}
      onProfileRefresh={() => void refresh()}
      loadFailed={loadFailed}
      returnTo={buildMypageIaCategoryHref("account")}
    />
  );
}

function hasAdminRow(category: MypageIaCategory): boolean {
  return category.groups.some((g) => g.rows.some((r) => "kind" in r && r.kind === "admin"));
}

/**
 * L1 분류 화면 `/mypage/section/{분류}` — 분류 행만 1열로 (스크롤로 찾지 않음).
 * 뒤로 = 내정보 홈. 하단 탭 보임(L1). 행 값은 홈과 같은 요약 1회.
 */
export function MyInfoIaCategoryScreen({
  category,
  ownerStoreGateSeed = null,
  adminMenuSeed = null,
}: { category: MypageIaCategory } & Seeds) {
  const { safeT } = useI18n();
  const pathname = usePathname() ?? "";
  const membership = useClientMembershipState("mypage-ia-category");
  const sessionUser = getCurrentUser();
  const treatAsMember = Boolean(sessionUser?.id) || membership.status === "member";
  const values = useMypageHomeValuesState(treatAsMember);
  const ccUnread = useCustomerCenterUnreadTotal();
  const addressesHref = buildMypageAddressesHrefFromPath(pathname, "");
  const title = safeT(category.titleKey);

  if (!treatAsMember) {
    return (
      <MyScreen title={title} backHref="/mypage" template="hub">
        {/* 비로그인은 `MypageGuestGate`(내정보 layout)가 로그인 화면으로 보낸다 — 여기는 확인 중 표시만 */}
        <MyStateView kind="loading" template="list" rows={4} />
      </MyScreen>
    );
  }

  return (
    <MyScreen title={title} backHref="/mypage" template="hub">
      <MypageHomeValuesProvider value={values}>
        <div className={MYPAGE_HOME_MENU_FLOW_CLASS} data-mypage-ia-category={category.id}>
          {category.showRequiredInfo ? <AccountRequiredInfo /> : null}
          {category.groups.map((group, i) => (
            <IaGroup
              key={group.titleKey ?? `g${i}`}
              group={group}
              addressesHref={addressesHref}
              ccUnread={ccUnread}
              ownerStoreGateSeed={ownerStoreGateSeed}
            />
          ))}
          {hasAdminRow(category) ? <MyPageAdminMenuEntry homeCard serverSeed={adminMenuSeed} /> : null}
        </div>
      </MypageHomeValuesProvider>
    </MyScreen>
  );
}
