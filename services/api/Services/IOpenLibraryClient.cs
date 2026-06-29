namespace Biblioteca.Api.Services;

public interface IOpenLibraryClient
{
    Task<BookLookupResult?> LookupByIsbnAsync(string isbn, CancellationToken cancellationToken);
}
