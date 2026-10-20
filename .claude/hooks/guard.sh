#!/usr/bin/env bash
# Owner 규정 강제 (PreToolUse) — 문서 규정 대신 실행 자체를 막는다.
#  1) 테스트 DB 사용 금지: dibay-test · dibay-reset-qa 프로젝트에 대한 Supabase 도구 호출 거부
#  2) CI·배포 반복 확인 금지: 예약 확인·CI 상태 폴링 도구 거부 (결과는 GitHub 알림으로만 받는다)
#     Production 반영 1회 확인(규정 8)은 Vercel 조회로 허용한다.
input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // ""')"

deny() {
  jq -n --arg r "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
  exit 0
}

case "$tool" in
  mcp__Supabase__*)
    project="$(printf '%s' "$input" | jq -r '.tool_input.project_id // ""')"
    case "$project" in
      tcwnueuzuxftyomttdyu|gczyogboohpixpurckkg)
        deny "Owner 규정: 테스트 DB(dibay-test·dibay-reset-qa) 사용 금지. 지시 없이 테스트 DB 를 조회·변경하지 않는다." ;;
    esac ;;
  mcp__claude-code-remote__send_later|ScheduleWakeup|mcp__github__actions_list)
    deny "Owner 규정: CI·배포 반복 확인 금지. 기다리지 말고 결과는 GitHub 알림으로만 받는다. 실패 알림이 올 때만 보고한다." ;;
  mcp__github__pull_request_read)
    method="$(printf '%s' "$input" | jq -r '.tool_input.method // ""')"
    case "$method" in
      get_check_runs|get_status)
        deny "Owner 규정: CI 반복 확인 금지. CI 결과는 GitHub 알림으로만 받는다." ;;
    esac ;;
esac
exit 0
