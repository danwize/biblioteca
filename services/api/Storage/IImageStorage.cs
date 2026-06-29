namespace Biblioteca.Api.Storage;

public interface IImageStorage
{
    Task<StoredImage> SaveAsync(IFormFile file, CancellationToken cancellationToken);
}
