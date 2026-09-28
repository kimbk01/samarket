"use client";

import { useEffect, useState } from "react";
import { AdminIntroCmsEditorPage } from "@/components/admin/intro/AdminIntroCmsEditorPage";
import { IntroV3OpenNotice } from "@/components/admin/intro-v3/IntroV3OpenNotice";

/** Old /admin/intro/[id] entry. Does not patch the rejected editor; only avoids mounting it for V3 drafts. */
export function AdminIntroCampaignRoute({ campaignId }: { campaignId: string }) {
  const [mode, setMode] = useState<"loading" | "v3" | "legacy">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/intro-v3/campaigns/${encodeURIComponent(campaignId)}`, {
        credentials: "same-origin",
      });
      if (cancelled) return;
      setMode(res.ok ? "v3" : "legacy");
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (mode === "loading") return null;
  if (mode === "v3") return <IntroV3OpenNotice campaignId={campaignId} />;
  return <AdminIntroCmsEditorPage campaignId={campaignId} />;
}
