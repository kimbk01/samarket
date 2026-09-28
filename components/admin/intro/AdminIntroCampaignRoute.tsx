"use client";

import { useEffect, useState } from "react";
import { AdminIntroLegacyReadOnly } from "@/components/admin/intro/AdminIntroLegacyReadOnly";
import { NewIntroEditor } from "@/components/admin/intro/NewIntroEditor";

export function AdminIntroCampaignRoute({ campaignId }: { campaignId: string }) {
  const [mode, setMode] = useState<"loading" | "v3" | "legacy" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (cancelled) return;
      if (res.ok) {
        setMode("v3");
        return;
      }
      if (json.error === "not_found") {
        setMode("missing");
        return;
      }
      setMode("legacy");
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (mode === "loading") {
    return <div className="sam-text-body text-sam-muted" data-intro-route-loading="1" />;
  }
  if (mode === "missing") {
    return <div className="sam-text-body text-sam-muted" data-intro-route-missing="1" />;
  }
  if (mode === "v3") return <NewIntroEditor campaignId={campaignId} />;
  return <AdminIntroLegacyReadOnly campaignId={campaignId} />;
}
