using System.Text.Json;

namespace Biblioteca.Api.Services;

public sealed record BookLookupResult(
    string? Title,
    string? Subtitle,
    string[] Authors,
    string? Isbn13,
    string? Isbn10,
    string? Publisher,
    string? PublishedDate,
    int? PageCount,
    string[] Subjects,
    JsonDocument RawPayload);
