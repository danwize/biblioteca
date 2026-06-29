using Biblioteca.Api.Data;
using Biblioteca.Api.GraphQL;
using Biblioteca.Api.Options;
using Biblioteca.Api.Services;
using Biblioteca.Api.Storage;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

builder.Services.Configure<ImageStorageOptions>(builder.Configuration.GetSection("ImageStorage"));
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"])
        .AllowAnyHeader()
        .AllowAnyMethod());
});

builder.Services.AddDbContextFactory<BibliotecaDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Biblioteca")));

builder.Services.AddHttpClient<IOpenLibraryClient, OpenLibraryClient>(client =>
{
    client.BaseAddress = new Uri("https://openlibrary.org/");
});
builder.Services.AddScoped<IImageStorage, LocalImageStorage>();

builder.Services
    .AddGraphQLServer()
    .ModifyRequestOptions(options => options.IncludeExceptionDetails = builder.Environment.IsDevelopment())
    .RegisterDbContextFactory<BibliotecaDbContext>()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddFiltering()
    .AddSorting();

var app = builder.Build();

app.UseCors();

if (!app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var dbFactory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<BibliotecaDbContext>>();
    await using var db = await dbFactory.CreateDbContextAsync();
    await db.Database.EnsureCreatedAsync();
}

app.MapDefaultEndpoints();
app.MapGraphQL("/graphql");
app.MapPost("/images", async (HttpRequest request, IImageStorage storage, IDbContextFactory<BibliotecaDbContext> dbFactory, CancellationToken cancellationToken) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new { error = "Expected multipart form data." });
    }

    var form = await request.ReadFormAsync(cancellationToken);
    var physicalCopyId = Guid.Parse(form["physicalCopyId"]!);
    var kind = form["kind"].ToString();
    var file = form.Files.GetFile("file");

    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "Image file is required." });
    }

    await using var db = await dbFactory.CreateDbContextAsync(cancellationToken);
    var physicalCopyExists = await db.PhysicalCopies.AnyAsync(copy => copy.Id == physicalCopyId, cancellationToken);
    if (!physicalCopyExists)
    {
        return Results.NotFound(new { error = "Physical copy not found." });
    }

    var stored = await storage.SaveAsync(file, cancellationToken);
    var image = new Biblioteca.Api.Domain.BookImage
    {
        PhysicalCopyId = physicalCopyId,
        Kind = string.IsNullOrWhiteSpace(kind) ? "other" : kind,
        OriginalPath = stored.RelativePath,
        MimeType = file.ContentType,
        Width = stored.Width,
        Height = stored.Height
    };

    db.BookImages.Add(image);
    await db.SaveChangesAsync(cancellationToken);

    return Results.Created($"/images/{image.Id}", image);
});

app.MapGet("/", () => Results.Redirect("/graphql"));

app.Run();

public partial class Program;
