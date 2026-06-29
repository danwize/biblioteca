using Biblioteca.Api.Options;
using Microsoft.Extensions.Options;

namespace Biblioteca.Api.Storage;

public sealed class LocalImageStorage(IOptions<ImageStorageOptions> options) : IImageStorage
{
    public async Task<StoredImage> SaveAsync(IFormFile file, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(options.Value.RootPath);
        var extension = System.IO.Path.GetExtension(file.FileName);
        var fileName = $"{Guid.NewGuid():N}{extension}";
        var path = System.IO.Path.Combine(options.Value.RootPath, fileName);

        await using var output = File.Create(path);
        await file.CopyToAsync(output, cancellationToken);

        return new StoredImage(fileName, null, null);
    }
}
