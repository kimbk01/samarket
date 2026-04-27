"use client";

type Props = {
  identifier: string;
  password: string;
  error?: string | null;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string | null;
  onIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
};

export function PasswordLoginForm({
  identifier,
  password,
  error,
  disabled = false,
  loading = false,
  loadingText = "",
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  /**
     * `disabled` 상태에서는 Enter 키로 form.onSubmit이 다시 발사되지 않도록 입력도 잠근다.
     * (LoginPageClient의 `loading` 가드와 함께 이중 제출을 차단)
     */
  const inputClassName =
    "mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body disabled:opacity-60";
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate autoComplete="off">
      <fieldset disabled={disabled} className="space-y-4">
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">이메일 또는 로그인 ID</label>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={identifier}
            onChange={(e) => onIdentifierChange(e.target.value)}
            placeholder="이메일 또는 로그인 ID"
            required
            className={inputClassName}
          />
        </div>
        <div>
          <label className="block sam-text-body-secondary font-medium text-sam-fg">비밀번호</label>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            required
            className={inputClassName}
          />
        </div>
      </fieldset>
      {loading && loadingText ? <p className="sam-text-helper text-sam-meta" role="status" aria-live="polite">{loadingText}</p> : null}
      {error ? <p className="sam-text-body-secondary text-red-600" role="alert" aria-live="assertive">{error}</p> : null}
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
      >
        {loading ? "로그인 처리 중..." : "로그인"}
      </button>
    </form>
  );
}
