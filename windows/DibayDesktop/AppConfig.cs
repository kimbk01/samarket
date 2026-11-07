namespace DibayDesktop;

/// <summary>
/// 셸 설정 — 운영 웹 주소와 앱 안에서 열어도 되는 주소. 회사 도메인으로 옮기면 여기만 바꾼다.
/// </summary>
internal static class AppConfig
{
    public const string StartUrl = "https://samarket.vercel.app/";

    public const string WindowTitle = "DIBAY";

    /// <summary>웹 ↔ 셸 메시지 버전 — lib/platform/dibay-windows-shell.ts 의 DIBAY_WINDOWS_SHELL_BRIDGE_VERSION 과 같아야 한다.</summary>
    public const int BridgeVersion = 1;

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

    public static bool IsAppOrigin(Uri uri) =>
        uri.Scheme == Uri.UriSchemeHttps &&
        string.Equals(uri.Host, new Uri(StartUrl).Host, StringComparison.OrdinalIgnoreCase);
}
