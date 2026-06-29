using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Biblioteca.Api.Data.Configurations;

public sealed class MetadataSourceConfiguration : IEntityTypeConfiguration<MetadataSource>
{
    public void Configure(EntityTypeBuilder<MetadataSource> builder)
    {
        builder.ToTable("metadata_sources");
        builder.HasKey(source => source.Id);
        builder.Property(source => source.Id).HasColumnName("id");
        builder.Property(source => source.PhysicalCopyId).HasColumnName("physical_copy_id");
        builder.Property(source => source.Provider).HasColumnName("provider").HasMaxLength(64).IsRequired();
        builder.Property(source => source.Identifier).HasColumnName("identifier").HasMaxLength(256);
        builder.Property(source => source.RawPayload).HasColumnName("raw_payload").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(source => source.Confidence).HasColumnName("confidence").HasPrecision(5, 4);
        builder.Property(source => source.CreatedAt).HasColumnName("created_at");
        builder.HasIndex(source => new { source.Provider, source.Identifier });
    }
}
