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
