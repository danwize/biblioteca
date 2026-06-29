using Biblioteca.Api.Data;
using Biblioteca.Api.GraphQL;
using Microsoft.EntityFrameworkCore;
using Shouldly;

namespace Biblioteca.Api.Tests;

public sealed class ConfirmBookImportTests
{
    [Fact]
    public async Task ConfirmBookImport_Creates_Work_And_First_Physical_Copy()
    {
        var options = new DbContextOptionsBuilder<BibliotecaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new BibliotecaDbContext(options);
        var mutation = new Mutation();

        var result = await mutation.ConfirmBookImport(null, new ConfirmBookImportInput(
            "The Blue Fairy Book",
            null,
            ["Andrew Lang"],
            "Lang's Fairy Books",
            "1",
            "9780486214375",
            "0486214370",
            "Dover Publications",
            "1965",
            390,
            "paperback",
            "unread",
            true,
            null,
            null,
            "The Blue Fairy Book edited by Andrew Lang"), db, CancellationToken.None);

        result.Title.ShouldBe("The Blue Fairy Book");
        result.PrimaryAuthor.ShouldBe("Andrew Lang");
        result.CopyNumber.ShouldBe(1);

        var work = await db.Works.SingleAsync();
        work.SortTitle.ShouldBe("Blue Fairy Book");

        var copy = await db.PhysicalCopies.SingleAsync();
        copy.Isbn13.ShouldBe("9780486214375");
        copy.PageCount.ShouldBe(390);
    }

    [Fact]
    public async Task ConfirmBookImport_Increments_Copy_Number_For_Duplicate_Work()
    {
        var options = new DbContextOptionsBuilder<BibliotecaDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        await using var db = new BibliotecaDbContext(options);
        var mutation = new Mutation();
        var input = new ConfirmBookImportInput("Twelfth Night", null, ["William Shakespeare"], null, null, null, null, null, null, null, null, "unread", true, null, null, null);

        await mutation.ConfirmBookImport(null, input, db, CancellationToken.None);
        var second = await mutation.ConfirmBookImport(null, input, db, CancellationToken.None);

        second.CopyNumber.ShouldBe(2);
        (await db.PhysicalCopies.CountAsync()).ShouldBe(2);
    }
}
