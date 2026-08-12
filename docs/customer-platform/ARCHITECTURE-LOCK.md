# Architecture LOCK — LOCKED RECORD

**Status:** LOCKED  
**When:** 2026-08-06 (post AUDIT PASS)  
**Basis:** Slice 0 evidence · existing code paths · PLAN LOCKED scope (no new design)

```text
Architecture LOCK PASS
1. User Facts
2. Domain Contract
3. Navigation
4. CTA
5. Motion
6. Runtime Contract
→ Slice 1 Facts authorized
```

세부 SSOT: `01`–`05` 문서 (본 기록이 우선).

---

## 1. User Facts — LOCKED

| Fact | Reader | Writer | Member Projection | Admin Projection | Cache | Runtime Authority |
|------|--------|--------|-------------------|------------------|-------|-------------------|
| Profile | `profiles` read APIs / home projection | profile update / Admin edit member | `/mypage` summary + edit sheet | Admin detail header + EditMemberForm | session / home store | `profiles` row |
| Trust | profile hydrate → `temperature` | `applyTrustScoreDelta` · Admin `POST /api/admin/trust-score` | `/mypage/trust` + future home badge | Admin detail trust + history + adjust | session temperature must track DB | **`profiles.trust_score`** (+ `reputation_logs`) |
| Point | points APIs | charge/ledger | mypage points strip | Admin points section | client strip cache | points domain tables/APIs |
| Badge | badge authority (existing domain) | system/events | nav badges | admin ops badges | badge store | existing badge SSOT (no redesign) |
| Order | store-order APIs | checkout/ops | mypage store orders | Admin activity summary | list caches | order tables |
| Store | store owner APIs | owner writes | owner/rider menus | store linkage on member | owner hub | store domain |
| Community | philife/community reads | posts | community-activity links | TBD admin view later | feed caches | community domain |
| Notification | settings + inbox | settings update · Admin send | mypage notifications/inbox | send notification CTA | settings cache | notification domain |
| Policy Consent | CMS/legal pages | accept events | terms/privacy routes | CMS + consent audit | static/CMS | **CMS** (Slice 8) |
| Admin Audit | admin only | moderation APIs | — | moderation lists | — | moderation logs |

**Trust conflict resolution (Slice 1):** Admin detail MUST expose `trust_score`; Member UI MUST treat DB `trust_score` as SSOT (session `temperature` = projection, not competing authority).

---

## 2. Domain Contract — LOCKED

| Domain | Reader | Writer | Projection | Permission | Nav Root | Badge Auth | Notif Auth | Audit Scope |
|--------|--------|--------|------------|------------|----------|------------|------------|-------------|
| Member | `/mypage/**`, member APIs | profile/settings/orders self | Member Projection | authenticated user | BottomNav 내정보 | Member badge SSOT | Member notif | self |
| Owner | `/stores/owner/**` | store ops | Owner Projection | store owner | Owner shell | Store badge | Owner notif | store ops |
| Admin | `/admin/**` | adjust/moderate/CMS | Admin Facts Projection | admin roles | Admin shell | Admin ops | Admin send | full |
| Guest | public/marketing, login | signup/login only | Guest Projection | none | login entry | none | none | auth events |
| System | workers/RPC internal | jobs | n/a | service role | n/a | n/a | system | job logs |
| Service | service APIs | webhooks | n/a | service key | n/a | n/a | n/a | API audit |

---

## 3. Navigation — LOCKED

| Transition | Use | Do not use |
|------------|-----|------------|
| push | Section→Sub→Detail (settings, profile, lists) | destructive confirm |
| modal | logout · nickname change · leave confirm · Admin destructive confirm | primary navigation |
| sheet | profile edit (current mypage) until Slice 6 consolidates | replacing push detail trees |
| alert | OS/version only | account flows that have modal |
| replace | logout complete · leave complete · auth gate | in-section browsing |
| browser back / gesture back | must be equivalent on Web/PWA/native WebView | divergent stacks |

Scroll restore + double-tap My→top: Member BottomNav contract (Karrot-proven pattern).

---

## 4. CTA — LOCKED

| Kind | Use |
|------|-----|
| Primary | 프로필 저장/완료 · 주 진행 |
| Secondary | 모달 취소 · 대안 |
| Danger | 로그아웃 · 탈퇴 · Admin 정지/삭제 |
| Inline | 공지 보기 · 주소 변경 · 섹션 보조 링크 |
| Icon | gear · bell · share · back |
| Context | list chevron rows · ⋯ menus |

Logout = Danger (not Primary text on profile forever — MOVE in Slice 3/6).

---

## 5. Motion — LOCKED

| Motion | Contract |
|--------|----------|
| push | standard platform push (~300ms class); content slides |
| back | inverse of push; gesture = browser back |
| modal | fade+scale confirm; dim scrim |
| sheet | bottom present (profile edit) |
| toast | short non-blocking |
| loading | blocking spinner only when no skeleton |
| skeleton | mypage/admin first paint preferred |

Reduced Motion: shorten/disable non-essential (Accessibility · `04`).

---

## 6. Runtime Contract — LOCKED

| Event | Rule |
|-------|------|
| Cold Start | app-boot → session → Facts hydrate; no git at runtime |
| Resume | refresh badge/notif scoped; no full remount storm |
| Background | pause nonessential realtime |
| Offline | read-only / queued writes per domain; banner |
| Network Retry | backoff; idempotent writes where required |
| Logout | clear session + member caches; `replace` to login/guest |
| Account Switch | isolate Facts caches by user id |
| Permission Change | re-read device permission settings surfaces |
| Token Refresh | single-flight; fail → reauth |
| Deep Link | allowlisted routes; auth gate before Member/Owner/Admin |

---

## Exit

Architecture LOCK **PASS**. Next: **Slice 1 Facts** (Trust SSOT + Admin Projection field).
