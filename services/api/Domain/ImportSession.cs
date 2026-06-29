using System.Text.Json;

namespace Biblioteca.Api.Domain;

public sealed class ImportSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Status { get; set; } = "draft";
    public string? ScannedIsbn { get; set; }
    public string? DetectedTitle { get; set; }
    public JsonDocument DetectedAuthors { get; set; } = JsonDocument.Parse("[]");
    public JsonDocument DraftData { get; set; } = JsonDocument.Parse("{}");
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAt { get; set; }
}
