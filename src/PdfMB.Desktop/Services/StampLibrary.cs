using System.Text.Json;

namespace PdfMB.Desktop.Services;

internal sealed class StampLibrary(string directory)
{
    internal sealed record Stamp(string Id, string Name, int Width, int Height, string Base64);
    public object[] List()
    {
        Directory.CreateDirectory(directory);
        var result = new List<object>();
        foreach (string path in Directory.EnumerateFiles(directory, "*.json").Take(25))
        {
            try
            {
                if (new FileInfo(path).Length > 12 * 1024 * 1024) continue;
                var item = JsonSerializer.Deserialize<Stamp>(File.ReadAllText(path));
                if (item is not null) result.Add(new { id = item.Id, name = item.Name, width = item.Width, height = item.Height, base64 = item.Base64 });
            }
            catch (Exception ex) when (ex is IOException or JsonException or UnauthorizedAccessException) { /* Keep the remaining personal stamps usable. */ }
        }
        return result.ToArray();
    }
    public string Import(string name, string base64)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 80 || base64.Length > 12 * 1024 * 1024) throw new InvalidDataException("Nome o immagine del timbro non validi.");
        byte[] bytes = PngFile.Decode(base64);
        using var stream = new MemoryStream(bytes, false);
        using var image = Image.FromStream(stream);
        if (image.Width > 1200 || image.Height > 1200) throw new InvalidDataException("Il timbro deve avere al massimo 1200 pixel per lato.");
        Directory.CreateDirectory(directory);
        var files = Directory.GetFiles(directory, "*.json");
        if (files.Length >= 25 || files.Sum(path => new FileInfo(path).Length) + base64.Length > 44L * 1024 * 1024)
            throw new InvalidDataException("La raccolta contiene già il massimo di 25 timbri o 32 MB di immagini.");
        string id = "personal-" + Guid.NewGuid().ToString("N"), path = Path.Combine(directory, id + ".json");
        using var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        JsonSerializer.Serialize(file, new Stamp(id, name, image.Width, image.Height, Convert.ToBase64String(bytes)));
        file.Flush(true);
        return id;
    }
}
