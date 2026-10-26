using System.Text.RegularExpressions;

namespace PdfMB.Desktop;

internal sealed class InsertPagesDialog : Form
{
    private readonly int _sourcePageCount;
    private readonly TextBox _range = new() { Text = "Tutte", MaxLength = 4096 };
    private readonly NumericUpDown _position = new() { Minimum = 1, DecimalPlaces = 0 };
    private readonly ToolTip _tips = new();
    private readonly Label _error = new() { ForeColor = Color.Firebrick, AutoEllipsis = true };

    public int[] PageIndexes { get; private set; } = [];
    public int Position => decimal.ToInt32(_position.Value);

    public InsertPagesDialog(string sourceName, int sourcePageCount, int destinationPageCount, int position)
    {
        if (sourcePageCount < 1 || destinationPageCount < 1) throw new ArgumentOutOfRangeException(nameof(sourcePageCount));
        AppIcon.Apply(this);
        _sourcePageCount = sourcePageCount;
        Text = "Inserisci pagine da PDF";
        StartPosition = FormStartPosition.CenterParent;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MinimizeBox = MaximizeBox = false;
        ShowInTaskbar = false;
        Font = new Font("Segoe UI", 10);
        ClientSize = new Size(560, 342);
        // Long names are shortened in the middle so the page count below always stays visible.
        var source = new Label
        {
            Text = $"{DialogText.FitFileName(sourceName, Font, 515)}\nPagine disponibili: {sourcePageCount}", UseMnemonic = false,
            Location = new Point(20, 16), Size = new Size(520, 45)
        };
        _tips.SetToolTip(source, sourceName);
        Disposed += (_, _) => _tips.Dispose();
        var rangeLabel = new Label { Text = "Pagine da inserire", Location = new Point(20, 71), AutoSize = true };
        _range.SetBounds(20, 96, 520, 28);
        var rangeHint = new Label
        {
            Text = "Tutte oppure numeri e intervalli, ad esempio 1, 3-5.\nLe pagine vengono inserite nell’ordine del PDF; i duplicati sono ignorati.",
            Location = new Point(20, 128), Size = new Size(520, 43), ForeColor = Color.DimGray
        };
        var positionLabel = new Label { Text = "Posizione di inserimento", Location = new Point(20, 179), AutoSize = true };
        _position.SetBounds(20, 205, 120, 28);
        _position.Maximum = destinationPageCount + 1M;
        _position.Value = Math.Clamp(position, 1, checked(destinationPageCount + 1));
        var positionHint = new Label
        {
            Text = $"Prima della pagina indicata.\n{destinationPageCount + 1L} = dopo l’ultima pagina.",
            Location = new Point(158, 201), Size = new Size(380, 42), ForeColor = Color.DimGray
        };
        _error.SetBounds(20, 249, 520, 38);
        var insert = new Button { Text = "Inserisci", Size = new Size(108, 34) };
        var cancel = new Button { Text = "Annulla", Size = new Size(108, 34), DialogResult = DialogResult.Cancel };
        var buttons = new FlowLayoutPanel
        {
            FlowDirection = FlowDirection.RightToLeft, Location = new Point(20, 296), Size = new Size(520, 42)
        };
        buttons.Controls.AddRange([cancel, insert]);
        Controls.AddRange([source, rangeLabel, _range, rangeHint, positionLabel, _position, positionHint, _error, buttons]);
        AcceptButton = insert;
        CancelButton = cancel;
        CommandIcons.ConfigureDialog(this);
        Shown += (_, _) => { _range.Focus(); _range.SelectAll(); };
        insert.Click += (_, _) =>
        {
            try
            {
                PageIndexes = ParsePages(_range.Text);
                DialogResult = DialogResult.OK;
                Close();
            }
            catch (FormatException ex) { _error.Text = ex.Message; _range.Focus(); }
        };
    }

    private int[] ParsePages(string input)
    {
        if (string.Equals(input.Trim(), "Tutte", StringComparison.OrdinalIgnoreCase))
            return Enumerable.Range(0, _sourcePageCount).ToArray();
        var pages = new SortedSet<int>();
        foreach (string part in input.Split(','))
        {
            var match = Regex.Match(part, @"^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$", RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200));
            if (!match.Success || !int.TryParse(match.Groups[1].Value, out int start))
                throw new FormatException("Indicare Tutte oppure pagine e intervalli separati da virgole.");
            int end = start;
            if (match.Groups[2].Success && !int.TryParse(match.Groups[2].Value, out end))
                throw new FormatException("Numero di pagina non valido.");
            if (start < 1 || end < start || end > _sourcePageCount)
                throw new FormatException($"Indicare pagine da 1 a {_sourcePageCount}, con intervalli crescenti.");
            for (int page = start - 1; page < end; page++) pages.Add(page);
        }
        if (pages.Count == 0) throw new FormatException("Selezionare almeno una pagina.");
        return pages.ToArray();
    }
}
