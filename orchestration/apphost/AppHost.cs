var builder = DistributedApplication.CreateBuilder(args);

var postgres = builder.AddPostgres("postgres")
    .WithDataVolume();

var database = postgres.AddDatabase("biblioteca");

var api = builder.AddProject<Projects.Biblioteca_Api>("api")
    .WithReference(database)
    .WaitFor(database)
    .WithEnvironment("ImageStorage__RootPath", "./data/images")
    .WithHttpEndpoint(port: 5000, targetPort: 5000);

builder.AddNpmApp("web", "../../apps/web", "dev")
    .WithReference(api)
    .WaitFor(api)
    .WithHttpEndpoint(port: 5173, targetPort: 5173, env: "PORT")
    .WithExternalHttpEndpoints();

builder.Build().Run();
