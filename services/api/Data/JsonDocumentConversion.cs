using System.Text.Json;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace Biblioteca.Api.Data;

public static class JsonDocumentConversion
{
    public static readonly ValueConverter<JsonDocument, string> Converter = new(
        document => document.RootElement.GetRawText(),
        json => JsonDocument.Parse(json));
}
