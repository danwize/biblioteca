using Biblioteca.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace Biblioteca.Api.Data;

public sealed class BibliotecaDbContext(DbContextOptions<BibliotecaDbContext> options) : DbContext(options)
{
    public DbSet<Work> Works => Set<Work>();
    public DbSet<PhysicalCopy> PhysicalCopies => Set<PhysicalCopy>();
    public DbSet<BookImage> BookImages => Set<BookImage>();
    public DbSet<MetadataSource> MetadataSources => Set<MetadataSource>();
    public DbSet<ImportSession> ImportSessions => Set<ImportSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(BibliotecaDbContext).Assembly);
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var entry in ChangeTracker.Entries().Where(entry => entry.State is EntityState.Modified or EntityState.Added))
        {
            if (entry.Entity is Work work)
            {
                work.UpdatedAt = now;
                work.SortTitle = string.IsNullOrWhiteSpace(work.SortTitle) ? SortTitle.For(work.Title) : work.SortTitle;
            }

            if (entry.Entity is PhysicalCopy copy)
            {
                copy.UpdatedAt = now;
            }
        }

        return base.SaveChangesAsync(cancellationToken);
    }
}
