using System.Net;
using System.Net.Http;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PdfMB.Desktop.Services;

internal enum UpdateState { Available, Current, NoRelease, Unavailable }
internal sealed record UpdateResult(UpdateState State, string Message, Version? Version = null,
    Uri? ReleaseUrl = null, Uri? DownloadUrl = null, string Notes = "");

internal sealed class UpdateChecker : IDisposable
{
    public const string Repository = "bottalico75marco-maker/pdfMB";
    public const string ReleasesUrl = "https://github.com/" + Repository + "/releases";
    private readonly HttpClient _client;
    private readonly Version _installed;

    public UpdateChecker(Version installed, HttpMessageHandler? handler = null)
    {
        _installed = new Version(installed.Major, installed.Minor, Math.Max(0, installed.Build));
        _client = new HttpClient(handler ?? new HttpClientHandler { AllowAutoRedirect = false })
        {
            BaseAddress = new Uri("https://api.github.com/"), Timeout = TimeSpan.FromSeconds(8),
            MaxResponseContentBufferSize = 2 * 1024 * 1024
        };
        _client.DefaultRequestHeaders.UserAgent.ParseAdd($"PDF-MB/{_installed}");
        _client.DefaultRequestHeaders.Accept.ParseAdd("application/vnd.github+json");
        _client.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
    }

    public static Version? StableVersion(string? tag)
    {
        if (tag is null || tag.Length > 64 || !Regex.IsMatch(tag, @"^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$")) return null;
        return System.Version.TryParse(tag.TrimStart('v'), out var version) ? version : null;
    }

    public async Task<UpdateResult> CheckAsync(CancellationToken cancellation = default)
    {
        try
        {
            using var response = await _client.GetAsync($"repos/{Repository}/releases/latest", cancellation);
            if (response.StatusCode == HttpStatusCode.NotFound)
                return new(UpdateState.NoRelease, "Non sono ancora disponibili release pubbliche stabili.");
            if (response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.TooManyRequests)
                return new(UpdateState.Unavailable, "GitHub ha limitato le richieste. Riprovare più tardi oppure aprire la pagina delle release.");
            if (!response.IsSuccessStatusCode)
                return new(UpdateState.Unavailable, $"Controllo aggiornamenti non disponibile (GitHub {(int)response.StatusCode}). Riprovare più tardi.");
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellation));
            var release = document.RootElement;
            if (release.GetProperty("draft").GetBoolean() || release.GetProperty("prerelease").GetBoolean())
                return new(UpdateState.NoRelease, "Non sono disponibili nuove release stabili.");
            string tag = release.GetProperty("tag_name").GetString() ?? "";
            var version = StableVersion(tag);
            if (version is null) return new(UpdateState.Unavailable, "La release GitHub non ha un numero di versione stabile riconoscibile.");
            if (version <= _installed)
                return new(UpdateState.Current, $"PDF MB {_installed} è aggiornato. Ultima release pubblica: {version}.", version);
            string zip = $"PDF-MB-{version}-win-x64.zip";
            string prefix = $"https://github.com/{Repository}/releases/download/{tag}/";
            var assets = release.GetProperty("assets").EnumerateArray().ToArray();
            bool HasAsset(string name) => assets.Any(asset => asset.GetProperty("name").GetString() == name &&
                asset.GetProperty("state").GetString() == "uploaded" && asset.GetProperty("size").GetInt64() > 0 &&
                asset.GetProperty("browser_download_url").GetString() == prefix + name);
            if (!HasAsset(zip) || !HasAsset(zip + ".sha256"))
                return new(UpdateState.Unavailable, $"La release {version} non dispone ancora del pacchetto Windows completo con checksum.");
            string notes = release.TryGetProperty("body", out var body) ? body.GetString() ?? "" : "";
            if (notes.Length > 30000) notes = notes[..30000] + "\n\nAltre note sulla pagina della release.";
            return new(UpdateState.Available, $"È disponibile PDF MB {version} (versione installata: {_installed}).", version,
                new Uri($"{ReleasesUrl}/tag/{tag}"), new Uri(prefix + zip), notes);
        }
        catch (OperationCanceledException) when (!cancellation.IsCancellationRequested)
        { return new(UpdateState.Unavailable, "Tempo scaduto durante il controllo aggiornamenti. Verificare la connessione e riprovare."); }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        { return new(UpdateState.Unavailable, "Impossibile verificare gli aggiornamenti. Verificare la connessione e riprovare."); }
    }
    public void Dispose() => _client.Dispose();
}

internal sealed class UpdatePreferences
{
    public bool Automatic { get; set; } = true;
    public DateTimeOffset? LastCheckedUtc { get; set; }
    public bool ShouldCheck(DateTimeOffset now) => Automatic &&
        (LastCheckedUtc is null || LastCheckedUtc > now || now - LastCheckedUtc >= TimeSpan.FromDays(1));
    public static UpdatePreferences Load(string path)
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<UpdatePreferences>(File.ReadAllText(path)) ?? new() : new(); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { return new(); }
    }
    public void Save(string path)
    {
        try { Directory.CreateDirectory(Path.GetDirectoryName(path)!); File.WriteAllText(path, JsonSerializer.Serialize(this)); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { /* Update preferences never block document work. */ }
    }
}
