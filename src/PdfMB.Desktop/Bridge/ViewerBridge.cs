using System.Text.Json;
using Microsoft.Web.WebView2.Core;

namespace PdfMB.Desktop.Bridge;

internal sealed class ViewerBridge(CoreWebView2 core) : IDisposable
{
    public const string Origin = "https://pdfmb.example";
    private readonly Dictionary<string, TaskCompletionSource<JsonElement>> _pending = [];
    public event Action<string, JsonElement>? EventReceived;

    public void Attach() => core.WebMessageReceived += OnMessage;

    public async Task<JsonElement> RequestAsync(string type, object? payload = null)
    {
        var id = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending.Add(id, completion);
        try
        {
            core.PostWebMessageAsJson(JsonSerializer.Serialize(new { version = 1, kind = "request", id, type, payload }));
            return await completion.Task.WaitAsync(TimeSpan.FromSeconds(120));
        }
        finally { _pending.Remove(id); }
    }

    private void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var source) ||
            source.GetLeftPart(UriPartial.Authority) != Origin) return;
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var message = doc.RootElement;
            if (message.GetProperty("version").GetInt32() != 1) return;
            string? kind = message.GetProperty("kind").GetString();
            if (kind == "response" && _pending.TryGetValue(message.GetProperty("id").GetString()!, out var completion))
            {
                if (message.GetProperty("ok").GetBoolean()) completion.TrySetResult(message.GetProperty("payload").Clone());
                else completion.TrySetException(new InvalidOperationException(message.GetProperty("error").GetString()));
            }
            else if (kind == "event")
                EventReceived?.Invoke(message.GetProperty("type").GetString()!, message.GetProperty("payload").Clone());
        }
        catch (Exception ex) when (ex is JsonException or KeyNotFoundException or InvalidOperationException or FormatException)
        { /* Ignore malformed messages; never interpret them as filesystem commands. */ }
    }

    public void Dispose()
    {
        core.WebMessageReceived -= OnMessage;
        foreach (var pending in _pending.Values) pending.TrySetCanceled();
        _pending.Clear();
    }
}
