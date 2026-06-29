using System.Text.Json;

namespace Biblioteca.Api.Domain;

public sealed class BookImage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PhysicalCopyId { get; set; }
    public PhysicalCopy? PhysicalCopy { get; set; }
    public required string Kind { get; set; }
    public required string OriginalPath { get; set; }
    public string? CroppedPath { get; set; }
    public string? MimeType { get; set; }
    public int? Width { get; set; }
    public int? Height { get; set; }
    public JsonDocument CropData { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
