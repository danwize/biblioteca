using Biblioteca.Api.Data;
using Biblioteca.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace Biblioteca.Api.GraphQL;

public sealed class Query
{
    public async Task<IReadOnlyList<WorkSummary>> GetWorks(BibliotecaDbContext db, CancellationToken cancellationToken) =>
        await db.Works
            .OrderBy(work => work.SortTitle)
            .Select(work => new WorkSummary(
                work.Id,
                work.Title,
                work.Subtitle,
                work.PrimaryAuthor,
                work.Series,
                work.SeriesNumber,
                work.PhysicalCopies.Count))
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<PhysicalCopySummary>> GetPhysicalCopies(BibliotecaDbContext db, CancellationToken cancellationToken) =>
        await db.PhysicalCopies
            .OrderBy(copy => copy.Work!.SortTitle)
            .ThenBy(copy => copy.CopyNumber)
            .Select(copy => new PhysicalCopySummary(
                copy.Id,
                copy.WorkId,
                copy.TitleOverride ?? copy.Work!.Title,
                copy.Work!.PrimaryAuthor,
                copy.Isbn13,
                copy.Publisher,
                copy.PublishedDate,
                copy.PageCount,
                copy.CopyNumber,
                copy.Status,
                copy.Owned))
            .ToListAsync(cancellationToken);

    public async Task<BookLookupPayload?> LookupBookByIsbn(string isbn, IOpenLibraryClient openLibrary, CancellationToken cancellationToken)
    {
        var result = await openLibrary.LookupByIsbnAsync(isbn, cancellationToken);
        return result is null
            ? null
            : new BookLookupPayload(
                result.Title,
                result.Subtitle,
                result.Authors,
                result.Isbn13,
                result.Isbn10,
                result.Publisher,
                result.PublishedDate,
                result.PageCount,
                result.Subjects);
    }
}
