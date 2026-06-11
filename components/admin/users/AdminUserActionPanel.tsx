"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminUser } from "@/lib/types/admin-user";
import { useAdminMe } from "@/hooks/useAdminMe";

interface AdminUserActionPanelProps {
  user: AdminUser;
  onActionSuccess: () => void;
}

async function postModeration(
  userId: string,
  action: string,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, reason }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.message ?? data.error ?? "처리에 실패했습니다." };
  }
  return { ok: true };
}

async function postDelete(
  userId: string,
  mode: "soft" | "hard",
  reason: string,
  confirmNickname?: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/delete`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, reason, confirmNickname }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.message ?? data.error ?? "삭제에 실패했습니다." };
  }
  return { ok: true };
}

export function AdminUserActionPanel({ user, onActionSuccess }: AdminUserActionPanelProps) {
  const { t, safeT } = useI18n();
  const { isSuperAdmin } = useAdminMe();
  const [loading, setLoading] = useState<string | null>(null);

  const runModeration = async (action: "warn" | "suspend" | "ban" | "restore") => {
    const reason = window.prompt(
      safeT("admin_users_moderation_reason_prompt", {
        fallbackKo: "처리 사유를 입력해 주세요.",
        fallbackEn: "Enter a reason for this action.",
      })
    );
    if (!reason?.trim()) return;

    setLoading(action);
    const result = await postModeration(user.id, action, reason.trim());
    setLoading(null);
    if (result.ok) onActionSuccess();
    else alert(result.error ?? t("admin_users_action_failed"));
  };

  const runDelete = async (mode: "soft" | "hard") => {
    const reason = window.prompt(
      safeT("admin_users_delete_reason_prompt", {
        fallbackKo: "삭제 사유를 입력해 주세요.",
        fallbackEn: "Enter a reason for deletion.",
      })
    );
    if (!reason?.trim()) return;

    let confirmNickname: string | undefined;
    if (mode === "hard") {
      const typed = window.prompt(
        safeT("admin_users_delete_confirm_nickname_prompt", {
          fallbackKo: `확인을 위해 닉네임「${user.nickname}」을 입력해 주세요.`,
          fallbackEn: `Type nickname「${user.nickname}」 to confirm.`,
        })
      );
      if (!typed?.trim()) return;
      confirmNickname = typed.trim();
    }

    setLoading(mode === "hard" ? "hard_delete" : "soft_delete");
    const result = await postDelete(user.id, mode, reason.trim(), confirmNickname);
    setLoading(null);
    if (result.ok) onActionSuccess();
    else alert(result.error ?? t("admin_users_action_failed"));
  };

  const runPremium = async (isPremium: boolean) => {
    setLoading(isPremium ? "premium_on" : "premium_off");
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberType: isPremium ? "premium" : "normal" }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        alert(data.message ?? data.error ?? t("admin_users_action_failed"));
      } else {
        onActionSuccess();
      }
    } catch {
      alert(t("admin_users_request_failed"));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {user.moderationStatus !== "warned" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void runModeration("warn")}
            className="rounded-ui-rect border border-[#00704A]/25 bg-white px-3 py-2 text-[13px] font-semibold text-[#00704A] hover:bg-[#E8F3EE] disabled:opacity-50"
          >
            {loading === "warn" ? t("admin_users_action_processing") : t("admin_users_action_warn")}
          </button>
        )}
        {user.moderationStatus !== "suspended" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void runModeration("suspend")}
            className="rounded-ui-rect border border-[#00704A]/25 bg-white px-3 py-2 text-[13px] font-semibold text-[#00704A] hover:bg-[#E8F3EE] disabled:opacity-50"
          >
            {loading === "suspend" ? t("admin_users_action_processing") : t("admin_users_action_suspend")}
          </button>
        )}
        {user.moderationStatus !== "banned" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void runModeration("ban")}
            className="rounded-ui-rect border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {loading === "ban" ? t("admin_users_action_processing") : t("admin_users_action_ban")}
          </button>
        )}
        {user.moderationStatus !== "normal" && (
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void runModeration("restore")}
            className="rounded-ui-rect border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
          >
            {loading === "restore" ? t("admin_users_action_processing") : t("admin_users_action_restore")}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[#D4E9E2]/80 pt-3">
        {user.memberType !== "admin" && (
          <>
            {user.memberType === "premium" ? (
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => void runPremium(false)}
                className="rounded-ui-rect border border-[#00704A]/25 bg-white px-3 py-2 text-[13px] font-semibold text-[#1E3932] hover:bg-[#F2F0EB] disabled:opacity-50"
              >
                {loading === "premium_off" ? t("admin_users_action_processing") : t("admin_users_action_premium_off")}
              </button>
            ) : (
              <button
                type="button"
                disabled={loading !== null}
                onClick={() => void runPremium(true)}
                className="rounded-ui-rect border border-[#00704A]/25 bg-white px-3 py-2 text-[13px] font-semibold text-[#1E3932] hover:bg-[#F2F0EB] disabled:opacity-50"
              >
                {loading === "premium_on" ? t("admin_users_action_processing") : t("admin_users_action_premium_on")}
              </button>
            )}
          </>
        )}
      </div>

      {isSuperAdmin && user.memberType !== "admin" && (
        <div className="border-t border-[#D4E9E2]/80 pt-3">
          <p className="mb-2 text-[12px] font-semibold text-[#6F4E37]">
            {safeT("admin_users_promote_section_title", {
              fallbackKo: "관리자 권한",
              fallbackEn: "Admin access",
            })}
          </p>
          <button
            type="button"
            disabled={loading !== null}
            onClick={async () => {
              if (
                !window.confirm(
                  safeT("admin_users_promote_confirm", {
                    fallbackKo: "이 회원에게 운영자 권한을 부여할까요?",
                    fallbackEn: "Grant operator admin access to this member?",
                  })
                )
              ) {
                return;
              }
              setLoading("promote_admin");
              try {
                const res = await fetch("/api/admin/staff", {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId: user.id, role: "operator" }),
                });
                const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
                if (!res.ok || !data.ok) {
                  alert(data.message ?? data.error ?? t("admin_users_action_failed"));
                } else {
                  onActionSuccess();
                }
              } catch {
                alert(t("admin_users_request_failed"));
              } finally {
                setLoading(null);
              }
            }}
            className="rounded-ui-rect border border-[#00704A]/25 bg-[#E8F3EE] px-3 py-2 text-[13px] font-semibold text-[#00704A] hover:bg-[#D4E9E2] disabled:opacity-50"
          >
            {loading === "promote_admin"
              ? t("admin_users_action_processing")
              : safeT("admin_users_action_promote_admin", {
                  fallbackKo: "관리자로 승격",
                  fallbackEn: "Promote to admin",
                })}
          </button>
        </div>
      )}

      <div className="space-y-2 border-t border-[#D4E9E2]/80 pt-3">
        <p className="text-[12px] font-semibold text-[#6F4E37]">
          {safeT("admin_users_delete_section_title", {
            fallbackKo: "계정 삭제",
            fallbackEn: "Account deletion",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading !== null}
            onClick={() => void runDelete("soft")}
            className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === "soft_delete"
              ? t("admin_users_action_processing")
              : safeT("admin_users_action_soft_delete", {
                  fallbackKo: "소프트 삭제",
                  fallbackEn: "Soft delete",
                })}
          </button>
          {isSuperAdmin && (
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => void runDelete("hard")}
              className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50"
            >
              {loading === "hard_delete"
                ? t("admin_users_action_processing")
                : safeT("admin_users_action_hard_delete", {
                    fallbackKo: "하드 삭제(익명화)",
                    fallbackEn: "Hard delete (anonymize)",
                  })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
