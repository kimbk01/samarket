import fs from "node:fs";
const path = "components/community/MeetingJoinButton.tsx";
let s = fs.readFileSync(path, "utf8");
const start = s.indexOf("  const joinLabel = isJoined");
const end = s.indexOf("  const btnClass = embedChrome");
if (start < 0 || end < 0) throw new Error("markers not found");
const replacement = `  const joinLabel = isJoined
    ? successSurface === "chat"
      ? t("community_meeting_join_chat_entry")
      : t("community_meeting_join_active")
    : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
      ? effectiveStatus === "pending"
        ? t("community_meeting_join_pending")
        : t("community_meeting_join_request")
      : meetingPasswordRequired
        ? t("community_meeting_join_with_password")
        : t("community_meeting_join_cta");

  const pendingSuffix =
    pendingCount > 0 ? \` · \${t("community_meeting_pending_approval", { count: pendingCount }).trim()}\` : "";
  const helperText = isClosed
    ? t("community_meeting_join_closed_hint")
    : effectiveStatus === "pending"
      ? t("community_meeting_join_approve_hint", { pending: pendingSuffix })
      : entryNorm === "approve" || entryNorm === "invite_only" || requiresApproval
        ? t("community_meeting_join_request_hint")
        : meetingPasswordRequired
          ? t("community_meeting_join_password_hint")
          : "";

`;
s = s.slice(0, start) + replacement + s.slice(end);
fs.writeFileSync(path, s);
console.log("ok");
