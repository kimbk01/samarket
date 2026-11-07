namespace DibayDesktop;

/// <summary>
/// 셸 설정 — 운영 웹 주소와 앱 안에서 열어도 되는 주소. 회사 도메인으로 옮기면 여기만 바꾼다.
/// </summary>
internal static class AppConfig
{
    public const string StartUrl = "https://samarket.vercel.app/";

    public const string WindowTitle = "DIBAY";

    /// <summary>웹 ↔ 셸 메시지 버전 — lib/platform/dibay-windows-shell.ts 의 DIBAY_WINDOWS_SHELL_BRIDGE_VERSION 과 같아야 한다.</summary>
    public const int BridgeVersion = 2;

    /// <summary>
    /// 앱 창 안에서 열어도 되는 호스트. 그 밖의 주소는 기본 브라우저로 연다.
    /// 로그인(W0: 웹 OAuth) 이 앱 안에서 돌아오도록 Supabase·카카오·Apple 로그인 호스트를 포함한다.
    /// Google 은 앱 안 로그인이 정책상 막혀(disallowed_useragent) W2 에서 시스템 브라우저로 바꾼다.
    /// </summary>
    public static readonly string[] InAppHosts =
    {
        "samarket.vercel.app",
        "supabase.co",
        "kauth.kakao.com",
        "accounts.kakao.com",
        "logins.daum.net",
        "appleid.apple.com",
        "accounts.google.com",
    };

    public static bool IsInAppHost(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttps) return false;
        var host = uri.Host.ToLowerInvariant();
        foreach (var allowed in InAppHosts)
        {
            if (host == allowed || host.EndsWith("." + allowed, StringComparison.Ordinal)) return true;
        }
        return false;
    }

    /// <summary>
    /// W2: 기본 브라우저로 열어도 되는 로그인 인가 주소 — 우리 Supabase 프로젝트(https, *.supabase.co)만.
    /// 웹이 보내는 auth.open 주소가 이 조건이 아니면 셸은 무시한다(아무 주소나 여는 통로 방지).
    /// </summary>
    public static bool IsAuthOpenAllowed(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps &&
        uri.Host.EndsWith(".supabase.co", StringComparison.OrdinalIgnoreCase) &&
        uri.AbsolutePath.StartsWith("/auth/v1/authorize", StringComparison.Ordinal);

    /// <summary>W2: 로그인 복귀 — dibay://auth/callback… 만.</summary>
    public static bool IsAuthReturnUri(Uri uri) =>
        uri.Scheme == "dibay" &&
        string.Equals(uri.Host, "auth", StringComparison.OrdinalIgnoreCase) &&
        uri.AbsolutePath.StartsWith("/callback", StringComparison.Ordinal);

    public static bool IsAppOrigin(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps &&
        string.Equals(uri.Host, new Uri(StartUrl).Host, StringComparison.OrdinalIgnoreCase);
}
