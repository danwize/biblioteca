using Biblioteca.Api.Data;
using Shouldly;

namespace Biblioteca.Api.Tests;

public sealed class SortTitleTests
{
    [Theory]
    [InlineData("The Blue Fairy Book", "Blue Fairy Book")]
    [InlineData("A Wrinkle in Time", "Wrinkle in Time")]
    [InlineData("Robin Hood", "Robin Hood")]
    public void For_Removes_Leading_Articles(string title, string expected)
    {
        SortTitle.For(title).ShouldBe(expected);
    }
}
