# thomasriley-ca

[![Build and deploy a container to an Azure Web App](https://github.com/tomdriley/thomasriley-ca/actions/workflows/azure-container-webapp.yml/badge.svg?branch=main)](https://github.com/tomdriley/thomasriley-ca/actions/workflows/azure-container-webapp.yml)

[![lint](https://github.com/tomdriley/thomasriley-ca/actions/workflows/lint.yml/badge.svg)](https://github.com/tomdriley/thomasriley-ca/actions/workflows/lint.yml)

Web service to generate front-end of blog site. Communicates with other backend article service over HTTP.

Built with TypeScript and Node.js for the server. Uses EJS rendering for pages.

To build and test locally:

```bash
npm install
npm run lint
npm run compile
npm start
```

To build and test with Docker:

```bash
docker build --pull --rm -f "Dockerfile" -t thomasrileyca:latest "."
docker run --rm -d  -p 8080:8080/tcp --env-file .env thomasrileyca:latest
```

## Deployment

Each app builds from its own directory as the Docker context and publishes a
distinctly named image to the same GHCR package, so the two builds can't
overwrite each other:

| App | Context | Image tag | Azure target |
| --- | --- | --- | --- |
| Website | `root-site` | `website-<sha>` | `thomasriley-ca`, slot `stage` |
| Article service | `article-service` | `article-service-<sha>` | `article-service`, slot `stage` |

Each deploy job receives the digest published by its own build job and deploys
`ghcr.io/tomdriley/thomasriley-ca@sha256:...`, so a slot can only ever run the
image that build produced.

Merging to `main` deploys both apps to their `stage` slot. Promoting to
production is a manual slot swap.
