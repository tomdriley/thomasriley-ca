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
| Website | `root-site` | `website-<sha>` | `thomasriley-blog-w3-pilot`, slot `stage` |
| Article service | `article-service` | `article-service-<sha>` | `thomasriley-article-w3-pilot`, slot `stage` |

Each deploy job receives the digest published by its own build job and deploys
`ghcr.io/tomdriley/thomasriley-ca@sha256:...`, so a slot can only ever run the
image that build produced.

Merging to `main` deploys both apps to their `stage` slot in `ff-westus3-pilot`.
The shared workflow uses Azure OIDC, not publish profiles. Each service has
separate `stage-<service>` and `production-<service>` GitHub environments,
restricted to the `main` branch, with environment variables `AZURE_CLIENT_ID`
and `AZURE_TENANT_ID`. Build jobs have package-write permission; only deployment
jobs request OIDC tokens.

`scripts/bootstrap-stage.py` provisions the stage slots on their existing
parents/plans, four managed identities, federated credentials, custom roles,
and GitHub environment variables. Run it with authenticated `az` and `gh`
(set `AZ` to an absolute CLI path if needed). Repository OIDC subjects use
GitHub's immutable numeric identity:
`repo:tomdriley@17971412/thomasriley-ca@452078536:environment:<environment>`.
Stage identities can read/reconfigure/restart only their own slot; production
identities can read stage and read/reconfigure/restart their own parent app.
Neither role grants publishing credentials, RBAC changes, or slot swaps.
Azure config-write permission is broader than one image field; the deploy
script deliberately patches only `linuxFxVersion`.

Stage has an explicit settings allowlist and no database connection strings.
The article service uses `ARTICLE_DATA_MODE=synthetic` to serve a fixed article;
database access throws in this mode. The website points only to the stage
article service. Production behavior is unchanged when this flag is absent.
Stage FTP/SCM basic authentication is disabled. No production certificates,
source apps, or production application settings are changed by bootstrap.
Re-running bootstrap reapplies the stage allowlist but retains its deployed
image. Existing public GHCR images require no registry password.

To promote, run **Promote verified stage digest to production** from `main`,
select the service, enter its current stage `sha256:...` digest and successful
component stage workflow run ID, and type `PROMOTE`. The workflow requires
that run's immutable `stage-tested-<service>` artifact to match the component,
digest, and source revision. Verification artifacts expire after 30 days;
deploy to stage again if the artifact has expired. It also checks that stage is configured with that digest and
responds over HTTP before updating only the pilot production image. It does
not rebuild or swap slots/settings. Per-app deployment concurrency serializes
stage deployment and promotion. This manual workflow is the explicit approval
gate; GitHub environment required-reviewer rules can be added separately.
No production promotion occurs automatically.

The job summary records previous/requested images for rollback and verifies
Azure's configured digest plus article HTTP availability. Stage checks also
assert synthetic article content, including frontend-to-backend rendering.
These checks do not attest
the digest of the running process. For rollback, redeploy a known-good digest
to stage, verify it, then promote that digest through the same workflow.
