using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Biblioteca.Api.Data.Configurations;

public sealed class ImportSessionConfiguration : IEntityTypeConfiguration<ImportSession>
{
    public void Configure(EntityTypeBuilder<ImportSession> builder)
    {
        builder.ToTable("import_sessions");
        builder.HasKey(session => session.Id);
        builder.Property(session => session.Id).HasColumnName("id");
        builder.Property(session => session.Status).HasColumnName("status").HasMaxLength(64).IsRequired();
        builder.Property(session => session.ScannedIsbn).HasColumnName("scanned_isbn").HasMaxLength(32);
        builder.Property(session => session.DetectedTitle).HasColumnName("detected_title").HasMaxLength(512);
        builder.Property(session => session.DetectedAuthors).HasColumnName("detected_authors").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(session => session.DraftData).HasColumnName("draft_data").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(session => session.CreatedAt).HasColumnName("created_at");
        builder.Property(session => session.CompletedAt).HasColumnName("completed_at");
    }
}
