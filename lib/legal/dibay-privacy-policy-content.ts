/**
 * DIBAY Privacy Policy — FALLBACK + CMS publish seed ONLY.
 * CONTRACT:
 * - Production TEXT SSOT = published `app_legal_documents` (kind=privacy).
 * - This module is NOT a consent writer and NOT Production text authority when CMS exists.
 * - Consent gate versions follow CMS published ko `version` via resolveRequiredConsentVersions.
 * - Only describe processing evidenced in app/DB/native code.
 * DO NOT invent company legal entity fields, retention day counts, or processors.
 */

/** Align with STORE_* / consent-binding CMS version after realign (body may still be full policy). */
export const DIBAY_PRIVACY_POLICY_VERSION = "2026-04-store-review";
export const DIBAY_PRIVACY_POLICY_EFFECTIVE_ISO = "2026-04-01T00:00:00.000Z";

export type DibayPrivacyPolicyLocaleBody = {
  title: string;
  body: string;
};

const KO_BODY = `1. 개인정보처리방침 개요

DIBAY(서비스 표기: dibaY)는 커뮤니티, 중고거래(마켓), 매장·배달 주문, 채팅(거래·커뮤니티 메신저·주문 채팅), 알림, 음성·영상 통화 기능을 제공하는 서비스입니다. 본 방침은 DIBAY가 서비스 제공을 위해 실제로 처리하는 개인정보의 항목, 목적, 보유·이용, 외부 서비스 이용, 이용자 권리, 회원탈퇴·삭제 요청 방법을 안내합니다.

문의: support@dibay.app
공개 주소: https://samarket.vercel.app/privacy

2. 처리하는 개인정보 항목

DIBAY는 이용 기능에 따라 다음 정보를 처리할 수 있습니다.

(1) 계정·인증
- 회원 식별자(사용자 ID)
- 로그인 방식(Google, Apple, Kakao 등 OAuth 및 이메일/세션 기반 인증)
- 인증·세션 정보(세션 ID, 기기·세션 메타데이터)
- 로그인에 연결된 이메일 또는 로그인 식별 정보(제공·설정되는 경우)

(2) 프로필·회원 정보
- 닉네임, 표시 이름, 공개 식별자(DIBAY ID 등), 프로필 이미지
- 전화번호 및 휴대폰 인증 관련 정보(인증이 필요한 기능 이용 시)
- 지역·주소 정보(프로필·주소록에 등록하는 경우), 지도 좌표(주소·위치 설정 시)

(3) 위치 정보
- 이용자가 허용한 경우, 서비스 이용 중(포그라운드) 위치 좌표
- 매장 탐색·지도·배달 주소·주문 배송지 좌표 등 기능 목적의 위치·주소 정보
- 백그라운드 상시 위치 추적 목적의 별도 제품은 본 방침 작성 기준 앱 코드에서 확인되지 않았습니다. 기기 OS에 위치 관련 권한 문구가 있을 수 있으나, 실제 수집은 이용 중 기능 호출에 따릅니다.

(4) 채팅·통화
- 거래 채팅, 커뮤니티 메신저(1:1·그룹), 매장 주문 채팅의 메시지·첨부(이미지·파일 등)
- 음성·영상 통화 세션·이벤트·참여 기록 및 통화 연결에 필요한 기술 정보
- 통화·알림 전달을 위한 푸시·VoIP 관련 토큰

(5) 커뮤니티·거래
- 게시물, 댓글, 거래 글, 후기, 신고·차단 관련 기록

(6) 매장·배달 주문
- 주문자 연락처, 배달 주소·상세주소·좌표, 주문 상품·금액·결제 수단 표시 정보, 주문 상태·이력
- 주문 이행을 위해 해당 매장(사장님/운영 권한자)에게 제공되는 주문·배송 정보

(7) 알림
- 기기 푸시 토큰(FCM, APNs, VoIP, 웹 푸시 구독 정보)
- 알림 설정 및 알림 전달·이력 관련 기록

(8) 미디어·기기 권한
- 카메라, 사진·파일, 마이크 접근(통화, 업로드, 프로필·상품·리뷰 이미지 등 이용 시)
- 업로드된 이미지·파일 등 미디어

(9) 광고·프로모션(자체)
- DIBAY 내 피드 광고·프로모션 신청 및 운영에 필요한 정보
- 마케팅 푸시 수신 설정(이용자가 설정한 경우)
- 제3자 광고 SDK·분석 SDK(예: AdMob, Google Analytics 등)는 본 방침 작성 기준 앱 의존성에서 확인되지 않았습니다.

(10) 포인트·정산성 정보
- D-Point 및 Business Credit(매장 포인트) 충전·사용·원장 기록
- 외부 카드 결제 PSP SDK를 통한 카드번호 직접 수집은 본 방침 작성 기준 코드에서 확인되지 않았습니다. 주문·충전 화면의 GCash/Maya 등은 결제·정산 수단 표시/절차로 사용될 수 있습니다.

(11) 기기·기술 정보
- IP 주소, User-Agent, 쿠키·세션, 요청 메타데이터, 감사(audit) 로그, 오류·운영 로그
- 기기 정보(푸시·세션·보안 목적)

(12) 안전·고객지원
- 신고, 제재, 차단, 고객 문의(플랫폼·매장 문의), 계정 삭제 요청 기록

3. 개인정보 처리 목적

- 회원 가입·로그인·세션 유지 및 부정 이용 방지
- 프로필·회원 식별 및 서비스 내 표시
- 거래·커뮤니티·매장 주문·채팅·통화 기능 제공
- 배달·근처 매장 등 위치·주소 기반 기능 제공
- 푸시·알림·통화 수신
- 포인트·광고(자체)·프로모션 운영
- 신고·분쟁·안전·고객지원·법령상 의무 이행
- 서비스 품질·보안·감사·장애 대응

4. 개인정보의 처리 및 보유기간

- 회원 정보가 서비스 이용에 필요한 동안 처리·보관합니다.
- 이용자가 계정 삭제(탈퇴)를 요청하면, 운영 처리 절차에 따라 개인정보를 비식별화하거나 삭제합니다. 다만 거래·주문·신고·정산·감사·법령상 의무 이행에 필요한 기록은 관련 목적이 달성될 때까지 보관될 수 있습니다.
- 항목별 고정 일수(예: N일/N년) 보유기간은 코드에 단일 값으로 정의되어 있지 않으며, 관련 법령·분쟁 대응·서비스 운영 필요에 따릅니다. 세부 보관 기준이 확정되면 본 방침을 갱신합니다.

5. 개인정보의 제3자 제공

DIBAY는 원칙적으로 이용자 동의 없이 개인정보를 외부에 판매하지 않습니다. 다만 다음의 경우 제공될 수 있습니다.

- 매장·배달 주문: 주문 이행을 위해 해당 매장 운영자에게 주문자 연락처·배송지·주문 내용 제공
- 채팅·통화: 상대 회원에게 메시지·첨부·통화 연결에 필요한 범위의 정보 노출
- 법령에 따른 요청, 수사·법원 등 적법한 절차

6. 개인정보 처리업무의 위탁·외부 서비스

서비스 제공을 위해 다음 외부 인프라·서비스를 이용할 수 있습니다. (처리 위탁/국외 이전에 해당할 수 있음)

- Supabase: 인증, 데이터베이스, 파일 저장, 실시간 동기화
- Google / Apple / Kakao: 소셜 로그인(Identity Provider)
- Semaphore: 휴대폰 인증 SMS 발송(전화번호·인증 메시지)
- Google Maps / Places: 지도·장소·주소 검색
- Firebase Cloud Messaging(FCM): Android 등 푸시 알림
- Apple APNs / VoIP Push: iOS 알림·통화 수신
- Agora: 음성·영상 통화 미디어 중계
- Web Push(VAPID): 웹 브라우저 푸시
- Upstash Redis: API 속도 제한 등 운영
- Vercel: 웹 애플리케이션 호스팅

각 서비스는 해당 기능 제공에 필요한 범위의 데이터를 처리합니다.

7. 국외 처리·이전

위 외부 서비스의 인프라 위치에 따라 개인정보가 이용자 거주 지역 외에서 처리될 수 있습니다. 이전 국가·보관 장소를 단일 값으로 앱 코드에 고정해 두지 않았으며, 각 제공자의 처리 지역 정책에 따릅니다.

8. 위치정보

위치정보는 매장 탐색, 지도, 배달 주소·주문 배송 등 이용자가 해당 기능을 사용할 때 처리될 수 있습니다. 기기 설정에서 위치 권한을 거부하면 관련 기능이 제한될 수 있습니다.

9. 기기 권한

DIBAY 앱은 기능에 따라 다음 권한을 요청할 수 있습니다.

- 위치(대략/정확): 배달·근처·지도·주소
- 카메라: 영상 통화, 촬영·업로드
- 마이크: 음성·영상 통화, 음성 관련 기능
- 사진/파일: 프로필·채팅·상품·리뷰 등 업로드
- 알림: 푸시·통화 알림

권한은 OS 설정에서 변경할 수 있습니다.

10. 쿠키·세션·로그 및 기술정보

로그인 유지, 보안, 감사, 속도 제한, 장애 분석을 위해 쿠키·세션·IP·User-Agent·기기/세션 메타데이터·감사 로그를 처리할 수 있습니다.

11. 광고 및 프로모션

DIBAY는 자체 피드 광고·프로모션·포인트 연동 기능을 운영할 수 있습니다. 제3자 광고 네트워크 SDK는 본 방침 작성 기준 확인되지 않았습니다. 마케팅 푸시는 설정에 따라 수신할 수 있습니다.

12. 이용자의 권리와 행사 방법

이용자는 서비스 내 프로필·설정 메뉴에서 회원 정보를 열람·수정하고, 알림 설정을 변경하며, 계정 삭제 요청을 할 수 있습니다. 문의는 support@dibay.app로 접수할 수 있습니다.

13. 회원탈퇴 및 개인정보 삭제

- 앱/웹(로그인 후): 내정보(또는 설정) → 계정 삭제/탈퇴 메뉴
  경로 예: /mypage/section/settings/leave
  단축 URL: /account/delete-request (위 경로로 연결)
- 삭제 요청은 접수 후 운영 절차에 따라 처리됩니다. 요청만으로 즉시 모든 데이터가 삭제되지 않을 수 있으며, 처리 완료 시 프로필 등 개인정보는 비식별화·삭제 정책에 따라 관리됩니다.
- 거래·주문·신고·정산·감사 등 보관이 필요한 기록은 목적 범위에서 남을 수 있습니다.

14. 개인정보의 파기

보유 목적이 달성되거나 삭제·비식별화 처리가 완료된 개인정보는 복구가 어려운 방법으로 삭제하거나 더 이상 개인을 알아볼 수 없는 형태로 처리합니다. 전자 파일은 시스템에서 삭제·익명화하며, 관련 백업·로그는 운영 주기에 따라 정리될 수 있습니다.

15. 아동·미성년자

DIBAY는 보호자 동의 없이 아동의 개인정보를 수집·이용하는 것을 목적으로 하지 않습니다. 관련 문의·삭제는 support@dibay.app 및 계정 삭제 요청 경로로 요청할 수 있습니다. 세부 연령 기준은 운영 정책에 따릅니다.

16. 개인정보 보호를 위한 안전조치

접근 통제, 인증·세션 관리, 전송 구간 HTTPS, 데이터베이스·스토리지 접근 제어, 관리자 권한 분리, 감사 로그 등 서비스 운영에 필요한 기술적·관리적 조치를 적용합니다.

17. 개인정보 보호 문의처

- 이메일: support@dibay.app
- 서비스명: DIBAY (dibaY)
- 사업자 등록 정보·대표자·주소·전화 등 추가 사업자 정보는 공개 페이지 https://samarket.vercel.app/business-info 및 등록된 값이 있는 범위에서 확인할 수 있습니다. 미등록 항목은 별도 고지 전까지 이메일로 문의합니다.

18. 개인정보처리방침 변경

본 방침을 변경하는 경우 본 페이지에 게시하며, 중요한 변경은 서비스 내 공지 등 합리적 방법으로 안내할 수 있습니다.

19. 시행일

본 방침은 2026년 8월 8일부터 적용됩니다.`;

const EN_BODY = `1. Overview

DIBAY (product branding: dibaY) provides community, marketplace trade, store/delivery orders, chat (trade, community messenger, store-order chat), notifications, and voice/video calls. This Privacy Policy explains what personal information DIBAY actually processes, why, how long it may be kept, external services used, your rights, and how to request account deletion.

Contact: support@dibay.app
Public URL: https://samarket.vercel.app/privacy

2. Personal information we process

Depending on features you use, DIBAY may process:

(1) Account / authentication
- User ID
- Sign-in method (Google, Apple, Kakao OAuth and email/session auth)
- Session data (session IDs, device/session metadata)
- Email or login identifiers when provided/stored

(2) Profile / membership
- Nickname, display name, public ID (e.g. DIBAY ID), profile image
- Phone number and phone-verification data when required
- Region/address (when saved to profile/address book) and map coordinates when set

(3) Location
- Device location while you use relevant features (foreground / on-use), if permitted
- Addresses and coordinates for store discovery, maps, and delivery orders
- Continuous background location tracking as a product purpose was not evidenced in app code at the time of writing; OS permission strings may still appear, and collection follows feature use.

(4) Chat / calls
- Messages and attachments in trade chat, community messenger (1:1/group), and store-order chat
- Voice/video call session/event/participant records and technical data needed to connect calls
- Push/VoIP tokens for call and alert delivery

(5) Community / marketplace
- Posts, comments, listings, reviews, report and block records

(6) Store / delivery orders
- Buyer contact, delivery address/details/coordinates, order items/amounts/payment-method labels, order status/history
- Order and delivery details shared with the relevant store operator for fulfillment

(7) Notifications
- Device push tokens (FCM, APNs, VoIP, web push subscriptions)
- Notification preferences and delivery-related records

(8) Media / device permissions
- Camera, photos/files, microphone when used for calls, uploads, avatars, products, reviews, etc.
- Uploaded media files

(9) Advertising / promotions (first-party)
- In-app feed ads/promotions and related request data
- Marketing push preference when set by the user
- Third-party advertising/analytics SDKs (e.g. AdMob, Google Analytics) were not found in app dependencies at the time of writing.

(10) Points / ledger
- D-Point and store Business Credit charge/use/ledger records
- Direct card-number collection via an embedded card PSP SDK was not evidenced; GCash/Maya and similar labels may appear as payment/settlement methods.

(11) Device / technical data
- IP address, User-Agent, cookies/sessions, request metadata, audit logs, operational/error logs
- Device metadata for push, session, and security

(12) Safety / support
- Reports, sanctions, blocks, customer inquiries, account-deletion requests

3. Purposes of processing

- Sign-up, login, session continuity, and abuse prevention
- Profile display and membership identification
- Trade, community, store orders, chat, and calls
- Location/address-based store and delivery features
- Push notifications and incoming calls
- Points and first-party ads/promotions
- Safety, disputes, support, and legal obligations
- Security, auditing, and reliability

4. Retention

- We process and keep personal information while needed to provide the service.
- After an account-deletion request, we de-identify or delete personal information under operational procedures. Records needed for trades, orders, reports, settlement, auditing, or legal duties may be kept until those purposes are completed.
- Fixed per-field day/year retention values are not defined as a single constant in code; retention follows law, dispute needs, and operations. This Policy will be updated if detailed schedules are finalized.

5. Sharing with third parties

DIBAY does not sell personal information. Sharing may occur for:

- Store/delivery orders: buyer contact, delivery address, and order details with the relevant store operator
- Chat/calls: counterparties see messages/attachments and data needed to connect calls
- Lawful requests from authorities

6. Processors / external services

We use infrastructure and services such as:

- Supabase — auth, database, file storage, realtime
- Google / Apple / Kakao — social login (identity providers)
- Semaphore — SMS OTP for phone verification
- Google Maps / Places — maps and place/address lookup
- Firebase Cloud Messaging (FCM) — push on Android and related channels
- Apple APNs / VoIP Push — iOS alerts and call signaling
- Agora — voice/video media
- Web Push (VAPID) — browser push
- Upstash Redis — rate limiting and operations
- Vercel — web hosting

Each processes data as needed for its function.

7. International processing

Depending on provider infrastructure, data may be processed outside your country of residence. Exact hosting countries are not hard-coded as a single app constant and follow each provider’s regions.

8. Location

Location may be processed when you use store discovery, maps, delivery addressing, and related features. Denying OS location permission may limit those features.

9. Device permissions

Depending on features, DIBAY may request:

- Location (approximate/precise): delivery, nearby, maps, addresses
- Camera: video calls and capture/upload
- Microphone: voice/video calls and related features
- Photos/files: profile, chat, product, review uploads
- Notifications: push and call alerts

You can change permissions in OS settings.

10. Cookies, sessions, logs

We may use cookies/sessions, IP, User-Agent, device/session metadata, and audit logs for login continuity, security, rate limiting, and operations.

11. Advertising and promotions

DIBAY may operate first-party feed ads/promotions and point-related campaigns. Third-party ad-network SDKs were not evidenced at the time of writing. Marketing push follows your settings.

12. Your rights

You may view/update profile information in-app, change notification settings, and request account deletion. Contact support@dibay.app for inquiries.

13. Account deletion

- In app/web (signed in): My / Settings → account deletion
  Path: /mypage/section/settings/leave
  Shortcut: /account/delete-request (redirects to the path above)
- Requests are handled through operational procedures and may not erase all data instantly. After processing, profile personal data is managed via de-identification/deletion. Trade, order, report, settlement, and audit records may remain as needed.

14. Destruction

When purposes end or deletion/de-identification completes, we delete or irreversibly anonymize personal data. Electronic records are removed or anonymized in systems; backups/logs may be cleared on operational cycles.

15. Children

DIBAY does not intend to collect children’s personal information without a guardian’s involvement. Related inquiries/deletion can be requested via support@dibay.app or the account-deletion path. Detailed age criteria follow operational policy.

16. Security measures

We apply access controls, authentication/session management, HTTPS in transit, database/storage access controls, admin privilege separation, and audit logging as needed to operate the service.

17. Privacy contact

- Email: support@dibay.app
- Service: DIBAY (dibaY)
- Additional business registration details (representative, address, phone, etc.) appear on https://samarket.vercel.app/business-info when published. If a field is empty, contact us by email until updated.

18. Changes

We will post updates on this page and may notify you of material changes through reasonable in-service notices.

19. Effective date

This Policy is effective as of 8 August 2026.`;

export const DIBAY_PRIVACY_POLICY_CONTENT: Record<"ko" | "en", DibayPrivacyPolicyLocaleBody> = {
  ko: {
    title: "개인정보처리방침",
    body: KO_BODY,
  },
  en: {
    title: "Privacy Policy",
    body: EN_BODY,
  },
};

export function getDibayPrivacyPolicyFallback(locale: "ko" | "en"): DibayPrivacyPolicyLocaleBody {
  return DIBAY_PRIVACY_POLICY_CONTENT[locale] ?? DIBAY_PRIVACY_POLICY_CONTENT.ko;
}
