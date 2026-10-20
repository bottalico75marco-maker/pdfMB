using System.Text.Json;

namespace PdfMB.Desktop.Services;

internal sealed class RecentFiles(string dataDirectory)
{
    private readonly string _path = Path.Combine(dataDirectory, "recent-files.json");
    public List<string> Items { get; private set; } = [];

    public void Load()
    {
        try
        {
            if (File.Exists(_path))
                Items = (JsonSerializer.Deserialize<List<string>>(File.ReadAllText(_path)) ?? [])
                    .Where(p => !string.IsNullOrWhiteSpace(p)).Distinct(StringComparer.OrdinalIgnoreCase).Take(10).ToList();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException) { Items = []; }
    }

    public void Add(string path)
    {
        Items.RemoveAll(item => string.Equals(item, path, StringComparison.OrdinalIgnoreCase));
        Items.Insert(0, path);
        Items = Items.Take(10).ToList();
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            File.WriteAllText(_path, JsonSerializer.Serialize(Items));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException) { /* Opening remains usable. */ }
    }
}
