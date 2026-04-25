"use client";

type Props = {
  identifier: string;
  password: string;
  error?: string | null;
  disabled?: boolean;
  onIdentifierChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
};

export function PasswordLoginForm({
  identifier,
  password,
  error,
  disabled = false,
  onIdentifierChange,
  onPasswordChange,
  onSubmit,
}: Props) {
  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">이메일 또는 로그인 ID</label>
        <input
          type="text"
          inputMode="email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => onIdentifierChange(e.target.value)}
          placeholder="이메일 또는 로그인 ID"
          required
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      <div>
        <label className="block sam-text-body-secondary font-medium text-sam-fg">비밀번호</label>
        <input
          type="password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
        />
      </div>
      {error ? <p className="sam-text-body-secondary text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-ui-rect bg-signature py-2.5 sam-text-body font-medium text-white transition-transform duration-100 active:scale-[0.985] active:brightness-95 disabled:opacity-50 disabled:active:scale-100 disabled:active:brightness-100"
      >
        로그인
      </button>
    </form>
  );
}
