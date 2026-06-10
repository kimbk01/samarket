"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { ProfileRow } from "@/lib/profile/types";
import type { UserAddressDefaultsDTO } from "@/lib/addresses/user-address-types";
import { hasFormalMemberContactVerification } from "@/lib/auth/member-access";
import {
  refreshPermissionState,
  requestPermission,
  type BrowserPermissionState,
} from "@/lib/permissions/device-permission-manager";
import type { DevicePermissionKind } from "@/lib/permissions/device-permission-kind";
import { buildPhoneVerificationHref } from "@/lib/auth/client-access-flow";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  profile: ProfileRow;
};

type VerificationStatus = "done" | "pending" | "failed";

const DEVICE_KINDS: readonly DevicePermissionKind[] = ["location", "microphone", "camera"] as const;

function statusClass(status: VerificationStatus): string {
  if (status === "done") return "bg-[rgba(0,130,72,0.12)] text-[#008248]";
  if (status === "failed") return "bg-[rgba(220,38,38,0.12)] text-[#dc2626]";
  return "bg-[rgba(245,158,11,0.12)] text-[#b45309]";
}

function permissionToStatus(state: BrowserPermissionState): VerificationStatus {
  if (state === "granted") return "done";
  if (state === "denied") return "failed";
  return "pending";
}

function maskPhone(phone: string | null | undefined): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 4) return raw;
  const tail = digits.slice(-4);
  return raw.startsWith("+") ? `${raw.slice(0, 3)} **** ${tail}` : `****-${tail}`;
}

export function ProfileVerificationCenter({ profile }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [defaults, setDefaults] = useState<UserAddressDefaultsDTO | null>(null);
  const [permissionStates, setPermissionStates] = useState<Record<DevicePermissionKind, BrowserPermissionState>>({
    location: "unknown",
    microphone: "unknown",
    camera: "unknown",
    notification: "unknown",
  });
  const [busy, setBusy] = useState<string | null>(null);

  const phoneDone = hasFormalMemberContactVerification({
    phone_verified: profile.phone_verified || Boolean(profile.phone_verified_at),
    phone_verified_at: profile.phone_verified_at,
    provider: profile.provider ?? profile.auth_provider,
    auth_provider: profile.provider ?? profile.auth_provider,
    email: profile.email,
  });

  const defaultAddress = defaults?.master ?? defaults?.delivery ?? null;

  const loadPermissions = useCallback(async () => {
    const entries = await Promise.all(DEVICE_KINDS.map(async (kind) => [kind, await refreshPermissionState(kind)] as const));
    setPermissionStates((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/me/address-defaults", { credentials: "include", cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; defaults?: UserAddressDefaultsDTO }
          | null;
        if (!cancelled && res.ok && json?.ok && json.defaults) setDefaults(json.defaults);
      } catch {
        /* address status stays pending */
      }
    })();
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, [loadPermissions]);

  const phoneLine = useMemo(() => {
    const masked = maskPhone(profile.phone ?? profile.phone_number ?? null);
    if (!masked) return phoneDone ? t("profile_verification_phone_done") : t("profile_verification_phone_needed");
    return phoneDone ? `${t("profile_verification_phone_done")} · ${masked}` : t("profile_verification_phone_needed");
  }, [phoneDone, profile.phone, profile.phone_number, t]);

  const requestDevicePermission = useCallback(
    async (kind: DevicePermissionKind) => {
      setBusy(kind);
      try {
        await requestPermission(kind, { explicitRetry: true });
        const state = await refreshPermissionState(kind);
        setPermissionStates((prev) => ({ ...prev, [kind]: state }));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const rows = [
    {
      key: "phone",
      title: t("profile_verification_phone"),
      desc: phoneLine,
      status: phoneDone ? "done" : "pending",
      badge: phoneDone ? t("profile_verification_done") : t("profile_verification_needed"),
      onClick: () => router.push(buildPhoneVerificationHref()),
    },
    {
      key: "address",
      title: t("profile_verification_address"),
      desc: defaultAddress?.fullAddress || defaultAddress?.formattedAddress || t("profile_verification_address_needed"),
      status: defaultAddress ? "done" : "pending",
      badge: defaultAddress ? t("profile_verification_address_done") : t("profile_verification_address_needed_short"),
      onClick: () => router.push("/mypage/addresses"),
    },
    ...DEVICE_KINDS.map((kind) => {
      const state = permissionStates[kind];
      const status = permissionToStatus(state);
      const titleKey =
        kind === "location"
          ? "profile_verification_location"
          : kind === "microphone"
            ? "profile_verification_microphone"
            : "profile_verification_camera";
      const neededKey =
        kind === "location"
          ? "profile_verification_location_needed"
          : kind === "microphone"
            ? "profile_verification_microphone_needed"
            : "profile_verification_camera_needed";
      return {
        key: kind,
        title: t(titleKey as MessageKey),
        desc: status === "done" ? t("profile_verification_permission_allowed") : t(neededKey as MessageKey),
        status,
        badge: status === "done" ? t("profile_verification_allowed") : status === "failed" ? t("profile_verification_denied") : t("profile_verification_needed"),
        onClick: () => void requestDevicePermission(kind),
      };
    }),
  ] as const;

  return (
    <section className="rounded-[20px] border border-[#d9e5df] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="sam-text-section-title font-semibold text-[#1e3932]">{t("profile_verification_center_title")}</h2>
          <p className="mt-1 sam-text-body-secondary text-[#1e3932]/70">{t("profile_verification_center_desc")}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#006241]/10 text-[#006241]" aria-hidden>
          D
        </span>
      </div>
      <div className="mt-4 divide-y divide-[#d9e5df]">
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={row.onClick}
            disabled={busy === row.key}
            className="flex w-full items-center justify-between gap-3 py-3 text-left disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block sam-text-body font-semibold text-[#1e3932]">{row.title}</span>
              <span className="mt-0.5 block truncate sam-text-body-secondary text-[#1e3932]/65">{row.desc}</span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 sam-text-xxs font-semibold ${statusClass(row.status as VerificationStatus)}`}>
              {busy === row.key ? t("common_loading") : row.badge}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
