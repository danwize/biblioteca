using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Biblioteca.Api.Data.Configurations;

public sealed class WorkConfiguration : IEntityTypeConfiguration<Work>
{
    public void Configure(EntityTypeBuilder<Work> builder)
    {
        builder.ToTable("works");
        builder.HasKey(work => work.Id);
        builder.Property(work => work.Id).HasColumnName("id");
        builder.Property(work => work.Title).HasColumnName("title").HasMaxLength(512).IsRequired();
        builder.Property(work => work.Subtitle).HasColumnName("subtitle").HasMaxLength(512);
        builder.Property(work => work.SortTitle).HasColumnName("sort_title").HasMaxLength(512).IsRequired();
        builder.Property(work => work.Description).HasColumnName("description");
        builder.Property(work => work.PrimaryAuthor).HasColumnName("primary_author").HasMaxLength(256);
        builder.Property(work => work.Authors).HasColumnName("authors").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(work => work.Series).HasColumnName("series").HasMaxLength(256);
        builder.Property(work => work.SeriesNumber).HasColumnName("series_number").HasMaxLength(64);
        builder.Property(work => work.Subjects).HasColumnName("subjects").HasColumnType("jsonb").HasConversion(JsonDocumentConversion.Converter);
        builder.Property(work => work.CreatedAt).HasColumnName("created_at");
        builder.Property(work => work.UpdatedAt).HasColumnName("updated_at");
        builder.HasIndex(work => work.SortTitle);
        builder.HasMany(work => work.PhysicalCopies)
            .WithOne(copy => copy.Work)
            .HasForeignKey(copy => copy.WorkId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
