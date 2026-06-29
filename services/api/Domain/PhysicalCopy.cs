using System.Text.Json;

namespace Biblioteca.Api.Domain;

public sealed class PhysicalCopy
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid WorkId { get; set; }
    public Work? Work { get; set; }
    public string? TitleOverride { get; set; }
    public string? Isbn13 { get; set; }
    public string? Isbn10 { get; set; }
    public string? Publisher { get; set; }
    public string? PublishedDate { get; set; }
    public int? PageCount { get; set; }
    public string? Format { get; set; }
    public string Status { get; set; } = "unread";
    public bool Owned { get; set; } = true;
    public string? Condition { get; set; }
    public int CopyNumber { get; set; } = 1;
    public string? Notes { get; set; }
    public JsonDocument Metadata { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<BookImage> Images { get; set; } = [];
    public ICollection<MetadataSource> MetadataSources { get; set; } = [];
}
