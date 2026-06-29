using System.Text.Json;

namespace Biblioteca.Api.Domain;

public sealed class MetadataSource
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? PhysicalCopyId { get; set; }
    public PhysicalCopy? PhysicalCopy { get; set; }
    public required string Provider { get; set; }
    public string? Identifier { get; set; }
    public JsonDocument RawPayload { get; set; } = JsonDocument.Parse("{}");
    public decimal? Confidence { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
