using System.Text.Json;
using Biblioteca.Api.Data;
using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Biblioteca.Api.GraphQL;

public sealed class Mutation
{
    public async Task<ImportSessionSummary> StartImportSession(
        StartImportSessionInput input,
        BibliotecaDbContext db,
        CancellationToken cancellationToken)
    {
        var session = new ImportSession
        {
            ScannedIsbn = Normalize(input.ScannedIsbn),
            DetectedTitle = input.DetectedTitle,
            DetectedAuthors = ToJson(input.DetectedAuthors ?? []),
            DraftData = ToJson(new { input.OcrText })
        };

        db.ImportSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        return new ImportSessionSummary(session.Id, session.Status, session.ScannedIsbn, session.DetectedTitle);
    }

    public async Task<PhysicalCopySummary> ConfirmBookImport(
        Guid? importSessionId,
        ConfirmBookImportInput input,
        BibliotecaDbContext db,
        CancellationToken cancellationToken)
    {
        var title = input.Title.Trim();
        var primaryAuthor = input.Authors.FirstOrDefault(author => !string.IsNullOrWhiteSpace(author));
        var work = await db.Works
            .Include(existing => existing.PhysicalCopies)
            .FirstOrDefaultAsync(existing => existing.Title == title && existing.PrimaryAuthor == primaryAuthor, cancellationToken);

        if (work is null)
        {
            work = new Work
            {
                Title = title,
                Subtitle = EmptyToNull(input.Subtitle),
                SortTitle = SortTitle.For(title),
                PrimaryAuthor = EmptyToNull(primaryAuthor),
                Authors = ToJson(input.Authors),
                Series = EmptyToNull(input.Series),
                SeriesNumber = EmptyToNull(input.SeriesNumber)
            };
            db.Works.Add(work);
        }

        var nextCopyNumber = work.PhysicalCopies.Count == 0 ? 1 : work.PhysicalCopies.Max(copy => copy.CopyNumber) + 1;
        var copy = new PhysicalCopy
        {
            Work = work,
            Isbn13 = Normalize(input.Isbn13),
            Isbn10 = Normalize(input.Isbn10),
            Publisher = EmptyToNull(input.Publisher),
            PublishedDate = EmptyToNull(input.PublishedDate),
            PageCount = input.PageCount,
            Format = EmptyToNull(input.Format),
            Status = string.IsNullOrWhiteSpace(input.Status) ? "unread" : input.Status,
            Owned = input.Owned,
            Condition = EmptyToNull(input.Condition),
            CopyNumber = nextCopyNumber,
            Notes = EmptyToNull(input.Notes),
            Metadata = ToJson(new { input.OcrText })
        };

        db.PhysicalCopies.Add(copy);

        if (!string.IsNullOrWhiteSpace(input.OcrText))
        {
            db.MetadataSources.Add(new MetadataSource
            {
                PhysicalCopy = copy,
                Provider = "client_ocr",
                RawPayload = ToJson(new { rawText = input.OcrText })
            });
        }

        if (importSessionId is { } sessionId)
        {
            var session = await db.ImportSessions.FindAsync([sessionId], cancellationToken);
            if (session is not null)
            {
                session.Status = "completed";
                session.CompletedAt = DateTimeOffset.UtcNow;
            }
        }

        await db.SaveChangesAsync(cancellationToken);

        return new PhysicalCopySummary(
            copy.Id,
            work.Id,
            work.Title,
            work.PrimaryAuthor,
            copy.Isbn13,
            copy.Publisher,
            copy.PublishedDate,
            copy.PageCount,
            copy.CopyNumber,
            copy.Status,
            copy.Owned);
    }

    private static JsonDocument ToJson<T>(T value) => JsonDocument.Parse(JsonSerializer.Serialize(value));
    private static string? EmptyToNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : new string(value.Where(char.IsLetterOrDigit).ToArray());
}
