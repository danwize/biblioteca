using System.Text.Json;

namespace Biblioteca.Api.Services;

public sealed class OpenLibraryClient(HttpClient httpClient) : IOpenLibraryClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<BookLookupResult?> LookupByIsbnAsync(string isbn, CancellationToken cancellationToken)
    {
        var normalized = NormalizeIsbn(isbn);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        using var response = await httpClient.GetAsync($"api/books?bibkeys=ISBN:{normalized}&jscmd=data&format=json", cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var key = $"ISBN:{normalized}";

        if (!payload.RootElement.TryGetProperty(key, out var book))
        {
            return null;
        }

        var raw = JsonDocument.Parse(book.GetRawText());
        return new BookLookupResult(
            GetString(book, "title"),
            GetString(book, "subtitle"),
            GetNameArray(book, "authors"),
            GetIdentifier(book, "isbn_13") ?? (normalized.Length == 13 ? normalized : null),
            GetIdentifier(book, "isbn_10") ?? (normalized.Length == 10 ? normalized : null),
            GetNameArray(book, "publishers").FirstOrDefault(),
            GetString(book, "publish_date"),
            GetInt(book, "number_of_pages"),
            GetNameArray(book, "subjects"),
            raw);
    }

    private static string NormalizeIsbn(string isbn) => new(isbn.Where(char.IsLetterOrDigit).ToArray());

    private static string? GetString(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.String
            ? property.GetString()
            : null;

    private static int? GetInt(JsonElement element, string propertyName) =>
        element.TryGetProperty(propertyName, out var property) && property.ValueKind == JsonValueKind.Number && property.TryGetInt32(out var value)
            ? value
            : null;

    private static string? GetIdentifier(JsonElement element, string identifierName)
    {
        if (!element.TryGetProperty("identifiers", out var identifiers) || !identifiers.TryGetProperty(identifierName, out var values))
        {
            return null;
        }

        return values.ValueKind == JsonValueKind.Array ? values.EnumerateArray().FirstOrDefault().GetString() : null;
    }

    private static string[] GetNameArray(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var array) || array.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return array.EnumerateArray()
            .Select(item => item.TryGetProperty("name", out var name) ? name.GetString() : item.GetString())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .Distinct()
            .ToArray();
    }
}
