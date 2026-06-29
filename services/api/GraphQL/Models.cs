namespace Biblioteca.Api.GraphQL;

public sealed record WorkSummary(
    Guid Id,
    string Title,
    string? Subtitle,
    string? PrimaryAuthor,
    string? Series,
    string? SeriesNumber,
    int CopyCount);

public sealed record PhysicalCopySummary(
    Guid Id,
    Guid WorkId,
    string Title,
    string? PrimaryAuthor,
    string? Isbn13,
    string? Publisher,
    string? PublishedDate,
    int? PageCount,
    int CopyNumber,
    string Status,
    bool Owned);

public sealed record ImportSessionSummary(Guid Id, string Status, string? ScannedIsbn, string? DetectedTitle);

public sealed record BookLookupPayload(
    string? Title,
    string? Subtitle,
    string[] Authors,
    string? Isbn13,
    string? Isbn10,
    string? Publisher,
    string? PublishedDate,
    int? PageCount,
    string[] Subjects);

public sealed record StartImportSessionInput(string? ScannedIsbn, string? DetectedTitle, string[]? DetectedAuthors, string? OcrText);

public sealed record ConfirmBookImportInput(
    string Title,
    string? Subtitle,
    string[] Authors,
    string? Series,
    string? SeriesNumber,
    string? Isbn13,
    string? Isbn10,
    string? Publisher,
    string? PublishedDate,
    int? PageCount,
    string? Format,
    string Status,
    bool Owned,
    string? Condition,
    string? Notes,
    string? OcrText);
