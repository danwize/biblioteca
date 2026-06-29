FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
COPY services/api/Biblioteca.Api.csproj services/api/
COPY orchestration/servicedefaults/Biblioteca.ServiceDefaults.csproj orchestration/servicedefaults/
RUN dotnet restore services/api/Biblioteca.Api.csproj
COPY services/api services/api
COPY orchestration/servicedefaults orchestration/servicedefaults
RUN dotnet publish services/api/Biblioteca.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS runtime
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 5000
ENTRYPOINT ["dotnet", "Biblioteca.Api.dll"]
