using System.Text.Json;

namespace Biblioteca.Api.Domain;

public sealed class Work
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Title { get; set; }
    public string? Subtitle { get; set; }
    public string SortTitle { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? PrimaryAuthor { get; set; }
    public JsonDocument Authors { get; set; } = JsonDocument.Parse("[]");
    public string? Series { get; set; }
    public string? SeriesNumber { get; set; }
    public JsonDocument Subjects { get; set; } = JsonDocument.Parse("[]");
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public ICollection<PhysicalCopy> PhysicalCopies { get; set; } = [];
}
