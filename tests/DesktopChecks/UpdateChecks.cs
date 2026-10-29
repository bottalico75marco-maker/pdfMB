using System.Net;
using System.Net.Http;
using System.Text;
using System.Text.Json;
using PdfMB.Desktop.Services;

internal static class UpdateChecks
{
    private sealed class Handler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellation) => respond(request, cancellation);
    }
    private static void Check(bool valid, string message) { if (!valid) throw new Exception(message); }
    private static HttpResponseMessage Json(object value, HttpStatusCode code = HttpStatusCode.OK) => new(code)
    { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
    private static object Release(string tag = "v0.13.0", bool draft = false, bool prerelease = false, bool checksum = true, string host = "https://github.com")
    {
        string name = $"PDF-MB-{tag.TrimStart('v')}-win-x64.zip";
        var names = checksum ? new[] { name, name + ".sha256" } : [name];
        return new { tag_name = tag, draft, prerelease, body = "# Novità\nCorrezioni e funzionalità.", assets = names.Select(name => new
        { name, state = "uploaded", size = 100, browser_download_url = $"{host}/bottalico75marco-maker/pdfMB/releases/download/{tag}/{name}" }) };
    }
    public static async Task RunAsync()
    {
        foreach (string invalid in new[] { "v1.0.0-rc1", "v1.0.0+build", "1.2", "v1.2.3.4", "v01.2.3", "v9.0.0/evil", "v2147483648.0.0" })
            Check(UpdateChecker.StableVersion(invalid) is null, "Invalid stable version accepted: " + invalid);
        Check(UpdateChecker.StableVersion("v0.12.1") == new Version(0, 12, 1), "Stable tag rejected");
        using (var service = new UpdateChecker(new Version(0, 12, 1, 0), new Handler((request, _) =>
        {
            Check(request.RequestUri?.AbsoluteUri == "https://api.github.com/repos/bottalico75marco-maker/pdfMB/releases/latest", "Wrong update endpoint");
            Check(request.Headers.UserAgent.ToString() == "PDF-MB/0.12.1" && request.Headers.Authorization is null, "Update check needs a token or has no User-Agent");
            return Task.FromResult(Json(Release()));
        })))
        {
            var result = await service.CheckAsync();
            Check(result.State == UpdateState.Available && result.Version == new Version(0, 13, 0), "New version not detected");
            Check(result.DownloadUrl?.AbsoluteUri.EndsWith("/v0.13.0/PDF-MB-0.13.0-win-x64.zip") == true && result.Notes.Contains("Novità"), "Download or notes missing");
        }
        foreach (string tag in new[] { "v0.12.1", "v0.10.6" })
        {
            using var current = new UpdateChecker(new Version(0, 12, 1), new Handler((_, _) => Task.FromResult(Json(Release(tag)))));
            Check((await current.CheckAsync()).State == UpdateState.Current, "Equal/older release offered as update");
        }
        foreach (var release in new[] { Release(draft: true), Release(prerelease: true) })
        {
            using var hidden = new UpdateChecker(new Version(0, 12, 1), new Handler((_, _) => Task.FromResult(Json(release))));
            Check((await hidden.CheckAsync()).State == UpdateState.NoRelease, "Draft/prerelease offered to stable users");
        }
        foreach (var release in new[] { Release(checksum: false), Release(host: "https://example.com"), Release("v0.13.0-rc1"), new { unexpected = true } as object })
        {
            using var invalid = new UpdateChecker(new Version(0, 12, 1), new Handler((_, _) => Task.FromResult(Json(release))));
            Check((await invalid.CheckAsync()).State == UpdateState.Unavailable, "Incomplete/invalid release accepted");
        }
        foreach (var status in new[] { HttpStatusCode.NotFound, HttpStatusCode.Forbidden, HttpStatusCode.TooManyRequests, HttpStatusCode.InternalServerError })
        {
            using var error = new UpdateChecker(new Version(0, 12, 1), new Handler((_, _) => Task.FromResult(new HttpResponseMessage(status))));
            Check((await error.CheckAsync()).State == (status == HttpStatusCode.NotFound ? UpdateState.NoRelease : UpdateState.Unavailable), "HTTP failure not handled");
        }
        using (var offline = new UpdateChecker(new Version(0, 12, 1), new Handler((_, _) => throw new HttpRequestException("offline"))))
            Check((await offline.CheckAsync()).State == UpdateState.Unavailable, "Offline update check interrupted app");
        using (var cancellation = new CancellationTokenSource())
        using (var pending = new UpdateChecker(new Version(0, 12, 1), new Handler(async (_, token) => { await Task.Delay(Timeout.Infinite, token); return Json(Release()); })))
        {
            cancellation.CancelAfter(50);
            bool cancelled = false;
            try { await pending.CheckAsync(cancellation.Token); } catch (OperationCanceledException) { cancelled = true; }
            Check(cancelled, "Update check did not cancel on close");
        }
        string directory = Path.Combine(Path.GetTempPath(), "pdfmb-updates-" + Guid.NewGuid().ToString("N")), path = Path.Combine(directory, "settings.json");
        try
        {
            var now = DateTimeOffset.UtcNow;
            var preferences = UpdatePreferences.Load(path);
            Check(preferences.ShouldCheck(now), "Fresh installation does not check updates");
            preferences.LastCheckedUtc = now; preferences.Save(path);
            Check(!UpdatePreferences.Load(path).ShouldCheck(now.AddHours(23)) && UpdatePreferences.Load(path).ShouldCheck(now.AddDays(1)), "Daily update limit failed");
            preferences.Automatic = false; preferences.Save(path);
            Check(!UpdatePreferences.Load(path).ShouldCheck(now.AddDays(2)), "Disabled automatic updates still checked");
        }
        finally { if (File.Exists(path)) File.Delete(path); if (Directory.Exists(directory)) Directory.Delete(directory); }
        if (Environment.GetEnvironmentVariable("PDFMB_LIVE_UPDATES") == "1")
        {
            using var live = new UpdateChecker(new Version(0, 12, 1));
            var result = await live.CheckAsync();
            Check(result.State is UpdateState.Current or UpdateState.Available or UpdateState.NoRelease, result.Message);
            Console.WriteLine("Live GitHub updates: " + result.Message);
            using var previous = new UpdateChecker(new Version(0, 0, 0));
            var offered = await previous.CheckAsync();
            Check(offered.State is UpdateState.Available or UpdateState.NoRelease, offered.Message);
            Console.WriteLine("Live GitHub release assets: " + offered.DownloadUrl);
        }
        Console.WriteLine("Updates: stable versions, trusted assets/checksum, no token, offline/rate limits, cancellation and daily preferences OK");
    }
}
