using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Biblioteca.Api.Data.Configurations;

public sealed class BookImageConfiguration : IEntityTypeConfiguration<BookImage>
{
    public void Configure(EntityTypeBuilder<BookImage> builder)
    {
        builder.ToTable("book_images");
        builder.HasKey(image => image.Id);
        builder.Property(image => image.Id).HasColumnName("id");
        builder.Property(image => image.PhysicalCopyId).HasColumnName("physical_copy_id");
        builder.Property(image => image.Kind).HasColumnName("kind").HasMaxLength(64).IsRequired();
        builder.Property(image => image.OriginalPath).HasColumnName("original_path").HasMaxLength(1024).IsRequired();
        builder.Property(image => image.CroppedPath).HasColumnName("cropped_path").HasMaxLength(1024);
        builder.Property(image => image.MimeType).HasColumnName("mime_type").HasMaxLength(128);
        builder.Property(image => image.Width).HasColumnName("width");
        builder.Property(image => image.Height).HasColumnName("height");
        builder.Property(image => image.CropData).HasColumnName("crop_data").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(image => image.CreatedAt).HasColumnName("created_at");
        builder.HasIndex(image => new { image.PhysicalCopyId, image.Kind });
    }
}
