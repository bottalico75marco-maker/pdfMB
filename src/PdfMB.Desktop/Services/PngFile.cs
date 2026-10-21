namespace PdfMB.Desktop.Services;

internal static class PngFile
{
    public static byte[] Decode(string base64)
    {
        if (base64.Length > 44 * 1024 * 1024) throw new InvalidDataException("Immagine troppo grande.");
        byte[] bytes = Convert.FromBase64String(base64);
        ReadOnlySpan<byte> signature = [137, 80, 78, 71, 13, 10, 26, 10];
        if (bytes.Length is < 24 or > 32 * 1024 * 1024 || !bytes.AsSpan(0, 8).SequenceEqual(signature))
            throw new InvalidDataException("Immagine PNG non valida.");
        using var stream = new MemoryStream(bytes, writable: false);
        using var image = Image.FromStream(stream, useEmbeddedColorManagement: false, validateImageData: true);
        if ((long)image.Width * image.Height > 32 * 1024 * 1024) throw new InvalidDataException("Risoluzione immagine troppo grande.");
        return bytes;
    }
}
