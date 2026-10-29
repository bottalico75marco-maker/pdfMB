using System.Drawing.Drawing2D;

namespace PdfMB.Desktop;

internal static class CommandIcons
{
    public static Bitmap Create(string kind)
    {
        var bitmap = new Bitmap(48, 48);
        using var g = Graphics.FromImage(bitmap);
        g.ScaleTransform(2, 2);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        using var pen = new Pen(Color.FromArgb(45, 65, 90), 1.6f) { StartCap = LineCap.Round, EndCap = LineCap.Round, LineJoin = LineJoin.Round };
        void Line(float x, float y, float a, float b) => g.DrawLine(pen, x, y, a, b);
        void Rect(float x, float y, float w, float h) => g.DrawRectangle(pen, x, y, w, h);
        void Poly(params PointF[] points) => g.DrawLines(pen, points);
        void Sheet() { Poly(new(5, 2), new(14, 2), new(19, 7), new(19, 22), new(5, 22), new(5, 2)); Poly(new(14, 2), new(14, 7), new(19, 7)); }
        void Plus(float x, float y) { Line(x - 3, y, x + 3, y); Line(x, y - 3, x, y + 3); }
        switch (kind)
        {
            case "protect": Rect(4, 10, 16, 12); g.DrawArc(pen, 8, 2, 8, 12, 180, 180); Line(12, 15, 12, 18); break;
            case "unprotect": Rect(4, 10, 16, 12); g.DrawArc(pen, 11, 1, 10, 10, 180, 180); Line(11, 6, 11, 10); Line(12, 15, 12, 18); break;
            case "new": case "blank": Sheet(); Plus(12, 14); break;
            case "open": Poly(new(2, 7), new(2, 20), new(20, 20), new(22, 9), new(10, 9), new(7, 5), new(2, 5), new(2, 7)); Line(2, 10, 19, 10); break;
            case "recent": g.DrawEllipse(pen, 3, 3, 18, 18); Poly(new(12, 6), new(12, 12), new(16, 14)); break;
            case "save": case "saveAs": case "saveOff":
                Poly(new(3, 3), new(17, 3), new(21, 7), new(21, 21), new(3, 21), new(3, 3)); Rect(7, 3, 9, 6); Rect(7, 13, 10, 8);
                if (kind == "saveAs") { using var white = new SolidBrush(Color.White); g.FillRectangle(white, 13, 13, 11, 11); Plus(18, 18); }
                if (kind == "saveOff") { using var red = new Pen(Color.Firebrick, 2); g.DrawLine(red, 2, 22, 22, 2); }
                break;
            case "pages": Rect(7, 3, 14, 16); Poly(new(3, 7), new(3, 22), new(17, 22)); break;
            case "text": Poly(new(3, 21), new(5, 15), new(16, 4), new(20, 8), new(9, 19), new(3, 21)); Line(5, 15, 9, 19); Line(14, 6, 18, 10); break;
            case "markdown": Rect(2, 4, 20, 16); Poly(new(5, 16), new(5, 8), new(8, 12), new(11, 8), new(11, 16)); Line(17, 8, 17, 16); Poly(new(14, 13), new(17, 16), new(20, 13)); break;
            case "ocr": Poly(new(8, 3), new(3, 3), new(3, 8)); Poly(new(16, 3), new(21, 3), new(21, 8)); Poly(new(3, 16), new(3, 21), new(8, 21)); Poly(new(16, 21), new(21, 21), new(21, 16)); Line(7, 8, 17, 8); Line(12, 8, 12, 17); Line(9, 17, 15, 17); break;
            case "forms": Sheet(); Rect(8, 8, 8, 3); Rect(8, 15, 4, 4); Poly(new(8, 17), new(10, 19), new(13, 14)); Line(15, 16, 17, 16); break;
            case "highlight": Poly(new(3, 16), new(14, 4), new(20, 10), new(9, 22), new(3, 22), new(3, 16)); Line(10, 9, 16, 15); break;
            case "tools": g.DrawArc(pen, 4, 2, 12, 12, 15, 280); Poly(new(7, 12), new(2, 20), new(5, 23), new(13, 15)); Line(16, 3, 12, 7); break;
            case "print": Rect(6, 2, 12, 7); Poly(new(5, 17), new(2, 17), new(2, 9), new(22, 9), new(22, 17), new(19, 17)); Rect(6, 14, 12, 8); Line(18, 12, 19, 12); break;
            case "undo": g.DrawBezier(pen, 4, 9, 21, 4, 25, 21, 12, 22); Poly(new(8, 4), new(3, 9), new(8, 14)); break;
            case "redo": g.DrawBezier(pen, 20, 9, 3, 4, -1, 21, 12, 22); Poly(new(16, 4), new(21, 9), new(16, 14)); break;
            case "exit": Poly(new(10, 3), new(3, 3), new(3, 21), new(10, 21)); Line(9, 12, 22, 12); Poly(new(16, 6), new(22, 12), new(16, 18)); break;
            case "help": g.DrawEllipse(pen, 3, 3, 18, 18); using (var font = new Font("Segoe UI", 12, FontStyle.Bold, GraphicsUnit.Pixel)) g.DrawString("?", font, Brushes.SteelBlue, 7, 4); break;
            case "note": Rect(4, 3, 16, 18); Line(8, 8, 16, 8); Line(8, 12, 16, 12); Line(8, 16, 13, 16); break;
            case "square": Rect(3, 4, 18, 16); break;
            case "circle": g.DrawEllipse(pen, 3, 4, 18, 16); break;
            case "line": Line(3, 20, 21, 4); break;
            case "ink": g.DrawBezier(pen, 3, 19, 7, -4, 12, 27, 21, 5); break;
            case "stamp": Poly(new(8, 14), new(8, 11), new(10, 8), new(10, 3), new(14, 3), new(14, 8), new(16, 11), new(16, 14)); Rect(4, 15, 16, 5); Line(4, 23, 20, 23); break;
            case "image": Rect(3, 3, 18, 18); g.DrawEllipse(pen, 6, 6, 4, 4); Poly(new(3, 18), new(9, 12), new(14, 17), new(18, 13), new(21, 16)); break;
            case "objects": Rect(4, 3, 16, 15); Poly(new(4, 13), new(10, 8), new(15, 14), new(20, 10)); Plus(16, 20); break;
            case "redact": Rect(3, 5, 18, 14); g.FillRectangle(Brushes.Black, 6, 9, 12, 6); break;
            case "guide": Poly(new(2, 4), new(9, 4), new(12, 6), new(15, 4), new(22, 4), new(22, 21), new(15, 21), new(12, 23), new(9, 21), new(2, 21), new(2, 4)); Line(12, 6, 12, 22); break;
            case "settings": Sheet(); g.DrawEllipse(pen, 9, 10, 8, 8); Line(13, 8, 13, 20); Line(7, 14, 19, 14); break;
            case "import": Sheet(); Line(12, 9, 12, 18); Poly(new(8, 14), new(12, 18), new(16, 14)); break;
            case "delete": Line(3, 6, 21, 6); Rect(9, 2, 6, 4); Poly(new(5, 6), new(7, 22), new(17, 22), new(19, 6)); Line(10, 10, 10, 18); Line(14, 10, 14, 18); break;
            case "cancel": Line(5, 5, 19, 19); Line(5, 19, 19, 5); break;
            case "apply": Poly(new(3, 12), new(9, 18), new(21, 5)); break;
            default: Sheet(); Line(8, 11, 16, 11); Line(8, 15, 16, 15); break;
        }
        return bitmap;
    }

    private static string Key(string text) => text.Replace("&", "").TrimEnd('…').Trim() switch
    {
        "Nuovo" or "Nuovo documento" or "Crea" => "new", "Apri PDF" or "Apri" => "open", "Recenti" => "recent", "Applica" => "apply",
        "Salva" => "save", "Salva con nome" or "Salva copia" => "saveAs", "Non salvare" => "saveOff",
        "Gestisci pagine" or "Pagine" => "pages", "Testo" => "text", "Evidenziatore" => "highlight",
        "Strumenti" => "tools", "Progetta modulo" or "Moduli" => "forms", "Stampa" => "print", "Confronta Markdown" => "markdown", "OCR e descrivi foto" => "ocr",
        "Annulla" => "cancel", "Ripeti" => "redo", "Chiudi documento" => "exit", "Aiuto" => "help",
        "Nota adesiva" => "note", "Rettangolo" => "square", "Ellisse" => "circle", "Linea" => "line", "Penna" => "ink",
        "Timbri" => "stamp", "Immagine" => "image", "Modifica oggetti" or "Modifica testo e oggetti" => "objects", "Oscuramento effettivo" => "redact",
        "Proteggi con password" => "protect",
        "Guida Windows" => "guide", "Imposta come lettore PDF predefinito" => "settings",
        "Verifica aggiornamenti" => "recent", "Controlla aggiornamenti all’avvio" => "settings",
        "Inserisci pagina vuota" => "blank", "Inserisci pagine da PDF" or "Inserisci" => "import", _ => "file"
    };

    public static void Configure(ToolStripItem item, string? kind = null, bool menuEntry = false)
    {
        string name = (item.Text ?? "").Replace("&", "");
        item.AccessibleName = name;
        // ToolTipText can return Text implicitly while AutoToolTip is enabled.
        // Preserve that value before disabling the implicit tooltip.
        string? tooltip = item.ToolTipText;
        item.AutoToolTip = false;
        item.ToolTipText = string.IsNullOrEmpty(tooltip) ? name : tooltip;
        var image = Create(kind ?? Key(name));
        item.Image = image;
        item.Disposed += (_, _) => image.Dispose();
        item.DisplayStyle = menuEntry ? ToolStripItemDisplayStyle.ImageAndText : ToolStripItemDisplayStyle.Image;
        if (!menuEntry) { item.AutoSize = false; item.Size = new Size(item is ToolStripDropDownButton ? 42 : 36, 36); }
    }

    public static void ConfigureStrip(ToolStrip strip)
    {
        strip.ImageScalingSize = new Size(22, 22);
        strip.ShowItemToolTips = true;
        foreach (ToolStripItem item in strip.Items)
        {
            if (item is ToolStripButton or ToolStripDropDownItem)
            {
                Configure(item, item.Text == "Annulla" && strip is not MenuStrip ? "undo" : null);
                if (item is ToolStripDropDownItem drop) foreach (ToolStripItem entry in drop.DropDownItems)
                    if (entry is not ToolStripSeparator) Configure(entry, menuEntry: true);
            }
        }
    }

    public static void ConfigureDialog(Control root)
    {
        var tips = new ToolTip { ShowAlways = true };
        root.Disposed += (_, _) => tips.Dispose();
        void Visit(Control control)
        {
            if (control is Button button)
            {
                string name = button.Text;
                using var source = Create(Key(name));
                var image = new Bitmap(source, new Size(24, 24));
                button.Text = ""; button.AccessibleName = name; button.Image = image;
                button.AutoSize = false; button.Size = new Size(42, 36);
                tips.SetToolTip(button, name);
                button.Disposed += (_, _) => image.Dispose();
            }
            foreach (Control child in control.Controls) Visit(child);
        }
        Visit(root);
    }
}
