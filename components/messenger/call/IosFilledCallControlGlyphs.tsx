"use client";

/**
 * 통화 하단 컨트롤 — 텔레그램/iOS와 같은 **채움(filled)** 실루엣.
 * 경로 출처: @heroicons/react v2.1.1 solid (MIT)
 */

const BOX = "block shrink-0";

/** `SpeakerWaveIcon` solid */
export function IosFilledSpeakerWaveGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z"
      />
      <path
        fill="currentColor"
        d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  );
}

/** `SpeakerXMarkIcon` solid */
export function IosFilledSpeakerXMarkGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06ZM17.78 9.22a.75.75 0 1 0-1.06 1.06L18.44 12l-1.72 1.72a.75.75 0 1 0 1.06 1.06l1.72-1.72 1.72 1.72a.75.75 0 1 0 1.06-1.06L20.56 12l1.72-1.72a.75.75 0 1 0-1.06-1.06l-1.72 1.72-1.72-1.72Z"
      />
    </svg>
  );
}

/** `VideoCameraIcon` solid */
export function IosFilledVideoCameraGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M4.5 4.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h8.25a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3H4.5ZM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06Z"
      />
    </svg>
  );
}

/** `MicrophoneIcon` solid */
export function IosFilledMicrophoneGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path fill="currentColor" d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
      <path
        fill="currentColor"
        d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z"
      />
    </svg>
  );
}

/** `XMarkIcon` solid */
export function IosFilledXMarkGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={28} height={28} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** `PhoneIcon` solid — 권한 허용·수락 */
export function IosFilledPhoneGlyph({ className }: { className?: string }) {
  return (
    <svg className={`${BOX} ${className ?? ""}`.trim()} width={26} height={26} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 0 0 6.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
