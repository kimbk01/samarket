# Apple App Store 1.2 — 콘텐츠 안전 P0/P1 수정 계획·승인 대기 항목

브랜치 `feat/apple-12-content-safety` 기준. 이 문서의 SQL·스토리지·약관·통화 항목은 **Owner 승인 전 실행하지 않는다.**
운영 DB 사실은 2026-11-05 읽기 전용 조회 결과다.

## 1. 승인 필요 DB 마이그레이션 (main 반영 전 적용)

`supabase/migrations/20271106100000_report_targets_store_review_and_feed_ad.sql`

- `store_reports.target_type` 허용값에 `review` 추가 (배달 리뷰 신고).
- `reports.target_type` 허용값에 `feed_ad` 추가 (광고 신고).
- 기존 행 변경·삭제 없음. 제약만 넓힌다.
- 미적용 상태로 웹 코드가 배포되면 리뷰·광고 신고 저장이 CHECK 위반으로 실패한다 → **마이그레이션 적용 후 main 반영** 순서를 지킨다.
- 롤백: 새 값 행이 없을 때 이전 CHECK 로 되돌린다(새 값 행이 생긴 뒤에는 롤백 전에 처리 방침 필요).

## 2. P0-2 채팅 첨부 공개 URL

### 확인된 사실

- 운영 `storage.buckets` 에 `post-images`(public=true)만 있고 `messenger-media` 버킷은 **없다**.
- 코드에는 비공개 전환(C-4)이 이미 구현돼 있다.
  - `lib/community-messenger/server/messenger-media-bucket.ts`: `messenger-media` 버킷이 존재하고 public=false 일 때만 신규 업로드를 그쪽으로 보낸다. 없으면 `post-images`(공개) 유지.
  - `app/api/community-messenger/rooms/[roomId]/messages/[messageId]/media/route.ts`: 참가자(또는 `chats` 권한 관리자 + 감사) 확인 후 10분 서명 URL 로 302.
  - `lib/community-messenger/media/messenger-media-ref.ts`: 메시지 metadata 에 bucket/path 기록, 링크는 조회 라우트 경유.
- 따라서 현재 운영에서 메신저 신규 첨부(이미지·파일·음성·동영상)는 **공개 버킷**에 올라가고 URL 만으로 열람 가능하다. 실제 외부 유출 여부는 확인하지 않았다(NOT_PROVEN — 유출로 단정하지 않는다).
- 레거시 거래 채팅(`/api/chat/...`, `lib/chats/chat-image-bundle.ts`)은 `post-images` 공개 URL 만 허용한다. C-4 전환 범위 밖이다.

### 전환 단계 (각 단계 Owner 승인)

1. **버킷 생성** — `supabase/manual-apply-messenger-media-private-bucket.sql` 적용.
   비공개 버킷 생성 + anon/authenticated 의 이 버킷 접근 RESTRICTIVE 차단. 기존 `post-images` 파일·정책 무변경.
   효과: 적용 후 최대 60초(음성 캐시) 내 신규 메신저 첨부가 비공개 버킷으로 간다. 기존 첨부 재생은 그대로(공개 URL 유지).
   롤백: env `MESSENGER_PRIVATE_MEDIA_BUCKET=off` → 신규 업로드가 다시 `post-images` 로. 이미 비공개에 올라간 파일은 조회 라우트로 계속 열람.
   실기기 확인: Android·iPhone 에서 이미지·음성·파일 전송 → 상대 수신·재생, 비참가자 계정으로 조회 라우트 403, 직접 public URL 404.
2. **레거시 거래 채팅 첨부** — 별도 설계 필요(클라이언트가 `post-images` 공개 URL 을 직접 보내는 구조). 이번 브랜치에서 변경하지 않음.
3. **기존 공개 파일 이전** — 파일 이동·원본 삭제·버킷 권한 변경은 별도 승인. 게시글 이미지(`post-images` 의 공개 게시물 사진)와 채팅 첨부가 같은 버킷에 섞여 있어, 버킷 전체를 비공개로 바꾸면 게시글 이미지가 깨진다 → 채팅 경로만 골라 복사 후 metadata 갱신, 확인 뒤 원본 삭제 순서로 설계해야 한다.

## 3. 약관 개정안 (게시 전 초안 — 게시는 Owner 승인 후)

### 재동의 영향

- 동의 게이트는 게시된 ko `version` 문자열로 판정한다(`lib/legal/resolve-required-consent-versions.ts`: 같은 version 의 본문 수정은 동의를 바꾸지 않는다).
- 현재 게시 terms version = `2026-04-store-review` (ko 258자 · en 501자). 이미 금지 행위·신고·차단·기록 보관 문장이 있다. 무관용·24시간·제재 단계 문장은 없다.
- **version 을 올리면 기존 회원 전원이 재동의 게이트에 걸린다.** Owner 지시(일괄 재동의 강제 금지)에 따라 **같은 version 으로 본문만 보완 게시**하는 방식을 제안한다.
- 다만 아래 초안은 회원 의무·제재를 구체화한다. 이것이 법적으로 재동의가 필요한 "불리한 변경"인지는 **법률 판단 필요(NOT_PROVEN)** — 필요 판단 시 version 변경 여부를 Owner 가 결정한다.

### 초안 (ko)

```
dibaY는 커뮤니티, 거래, 주문, 채팅 기능을 제공합니다.

[금지 콘텐츠·행위]
불법 행위, 사기, 혐오·차별 표현, 괴롭힘·위협, 성적 착취(아동 관련 콘텐츠 포함), 성매매 알선, 음란물, 폭력 조장, 개인정보 유출, 스팸, 타인 명의 도용을 금지합니다. dibaY는 이러한 콘텐츠와 이용자에 대해 무관용 원칙을 적용합니다.

[신고와 처리]
모든 게시물·댓글·프로필·채팅 메시지·리뷰·광고는 신고할 수 있습니다. 운영자는 일반 신고를 접수 후 24시간 이내에 1차 검토하며, 아동 안전·생명·신체 위협 등 긴급 신고를 우선 처리합니다.

[차단]
회원은 다른 회원을 차단할 수 있으며, 차단한 회원의 게시물·댓글·리뷰는 보이지 않고 메시지를 주고받을 수 없습니다.

[제재]
위반이 확인되면 콘텐츠 숨김·삭제, 기능 제한, 계정 정지 또는 영구 이용 정지 조치를 할 수 있습니다. 운영자는 심사와 안전을 위해 필요한 기록을 보관할 수 있습니다.

[계정]
회원은 본인 계정으로만 서비스를 이용해야 합니다. 필리핀 전화번호 인증이 필요한 기능은 정회원 인증 후에만 사용할 수 있습니다.

문의: support@dibay.app
```

### 초안 (en)

```
dibaY provides community, trade, order, and chat features.

[Prohibited content and conduct]
Illegal activity, fraud, hate or discriminatory speech, harassment or threats, sexual exploitation (including any content involving minors), solicitation of prostitution, pornography, incitement to violence, leaking personal information, spam, and impersonation are prohibited. dibaY has zero tolerance for such content and users.

[Reporting and review]
Any post, comment, profile, chat message, review, or ad can be reported. We complete an initial review of standard reports within 24 hours and prioritize urgent reports such as child safety or threats to life or safety.

[Blocking]
You can block other members. Posts, comments, and reviews from blocked members are hidden, and you cannot exchange messages with them.

[Enforcement]
When a violation is confirmed, we may hide or remove content, restrict features, or suspend or permanently ban the account. We may retain records needed for review and safety.

[Account]
Use the service only with your own account. Features that require Philippine phone verification are available only after full membership verification.

Contact: support@dibay.app
```

- 24시간 처리 측정: 관리자 신고 큐의 접수 시각(`created_at`)과 상태 변경 시각으로 계산한다. 이번 브랜치에서 별도 지표 화면은 만들지 않았다.
- 기존 게시물 자동 삭제·자동 제재 없음.

## 4. 통화·메신저 HARD LOCK 영향 분석 (구현 보류)

### 메신저 텍스트 금칙어 필터

- 대상 라우트: `app/api/community-messenger/rooms/[roomId]/messages/route.ts` POST (텍스트만). 통화 기록 메시지(`call_stub`)는 별도 경로 `app/api/community-messenger/calls/stub-message/route.ts`·`rooms/[roomId]/calls/route.ts` 가 쓴다.
- 제안: 위 POST 에서 `content` 만 검사해 400(`content_filter_blocked`)을 반환. `service.ts` 의 `sendCommunityMessengerMessage`·통화 함수·푸시 발송은 변경하지 않는다.
- 영향: 텍스트 전송 실패 응답 1종 추가 → 클라이언트 낙관적 메시지가 실패 상태로 남는 기존 경로를 탄다(실패 문구 노출 확인 필요). 통화 발신·수신·종료·VoIP/FCM 경로는 호출하지 않는다.
- 위험: 전송 지연(정규화·캐시 조회 1회), 오차단 시 메시지 미전송. 구 바이너리 영향 없음(웹 응답만).
- 통화 규정에 따라 **단독 커밋·실기기 행렬 검증·Owner 승인 후** 구현한다.

### 통화 기록 신고·차단

- 통화 기록 UI(`components/community-messenger/call-history/*`)에는 현재 신고·차단 동작이 없다.
- 제안: 통화 기록 행/상대 상세에 기존 `/api/community-messenger/reports`(reportType user)·기존 차단 경로를 붙이는 UI 만 추가. 통화 세션·기록 데이터는 변경하지 않는다.
- 이번 브랜치에서 통화 기록 파일은 변경하지 않았다(Owner 지시: 별도 승인 전 통화기록 수정 금지).

## 5. 금칙어 기본 목록

`lib/community-feed/banned-word-match.ts` — `BASELINE_BANNED_TERMS` 39개(ko 20 · en 12 · tl 7), 예외 문구 8개(시발점·병신년 등).
운영 목록(관리자 화면)이 비어 있어도 기본 목록이 적용된다. 운영 목록 추가는 Owner 확인 후.
