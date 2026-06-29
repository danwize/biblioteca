using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Biblioteca.Api.Data.Configurations;

public sealed class PhysicalCopyConfiguration : IEntityTypeConfiguration<PhysicalCopy>
{
    public void Configure(EntityTypeBuilder<PhysicalCopy> builder)
    {
        builder.ToTable("physical_copies");
        builder.HasKey(copy => copy.Id);
        builder.Property(copy => copy.Id).HasColumnName("id");
        builder.Property(copy => copy.WorkId).HasColumnName("work_id");
        builder.Property(copy => copy.TitleOverride).HasColumnName("title_override").HasMaxLength(512);
        builder.Property(copy => copy.Isbn13).HasColumnName("isbn13").HasMaxLength(13);
        builder.Property(copy => copy.Isbn10).HasColumnName("isbn10").HasMaxLength(10);
        builder.Property(copy => copy.Publisher).HasColumnName("publisher").HasMaxLength(256);
        builder.Property(copy => copy.PublishedDate).HasColumnName("published_date").HasMaxLength(64);
        builder.Property(copy => copy.PageCount).HasColumnName("page_count");
        builder.Property(copy => copy.Format).HasColumnName("format").HasMaxLength(64);
        builder.Property(copy => copy.Status).HasColumnName("status").HasMaxLength(64).IsRequired();
        builder.Property(copy => copy.Owned).HasColumnName("owned");
        builder.Property(copy => copy.Condition).HasColumnName("condition").HasMaxLength(64);
        builder.Property(copy => copy.CopyNumber).HasColumnName("copy_number");
        builder.Property(copy => copy.Notes).HasColumnName("notes");
        builder.Property(copy => copy.Metadata).HasColumnName("metadata").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(copy => copy.CreatedAt).HasColumnName("created_at");
        builder.Property(copy => copy.UpdatedAt).HasColumnName("updated_at");
        builder.HasIndex(copy => copy.Isbn13);
        builder.HasIndex(copy => new { copy.WorkId, copy.CopyNumber }).IsUnique();
    }
}
