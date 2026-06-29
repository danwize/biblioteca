namespace Biblioteca.Api.Data;

public static class SortTitle
{
    private static readonly string[] Articles = ["the ", "a ", "an "];

    public static string For(string title)
    {
        var normalized = title.Trim();
        var article = Articles.FirstOrDefault(prefix => normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
        return article is null ? normalized : normalized[article.Length..].Trim();
    }
}
