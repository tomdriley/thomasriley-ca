# Fantasy football proxy

`/fantasy-football` and everything beneath it is reverse-proxied to a separate
fantasy football App Service; the two applications and their deployment
pipelines stay independent. The blog does not enumerate the fantasy app's
routes, so pages, assets and its API all flow through the same prefix, with the
prefix preserved.

Everything the blog contributes lives in this folder. Outside it the feature
touches two lines of hand-written code — an `import` and a `router.use` in
`../router.ts` — plus the npm dependency. The nav entry and tests are owned here.

## Settings

| Setting | Required | Meaning |
| --- | --- | --- |
| `FANTASY_APP_ORIGIN` | yes, to enable | Bare upstream origin, e.g. `https://thomasriley-fantasy-w3-pilot-stage.azurewebsites.net`. No path, query or credentials. |
| `FANTASY_PUBLIC_ORIGIN` | recommended | The external origin browsers use, e.g. `https://thomasriley.ca`. Supplies `X-Forwarded-Host` and `X-Forwarded-Proto`. When unset, no forwarding metadata is sent. |

Configure these settings manually on the blog slot; Azure retains them across
image deployments. For staging, use the `defaultHostName` of each app's `stage`
slot, prefixed with `https://`, never the parent/production app. Production
settings are configured separately.

When `FANTASY_APP_ORIGIN` is unset the proxy is not mounted, the prefix simply
404s, and production routing stays off until it is configured deliberately;
an invalid value returns 503 instead of proxying somewhere unintended. The
nav link is always visible, including when its destination returns an error.

## Files

| File | |
| --- | --- |
| `fantasy-football-router.ts` | the proxy, mounted by `../router.ts` |
| `fantasy-football-router.test.cjs` | end-to-end tests against a real upstream |

## Behavior worth knowing before changing this code

- The proxy is mounted ahead of the static-file, page and 404 handlers, and
  nothing may parse or buffer request bodies ahead of it. Requests stream
  through `http-proxy-middleware`; pages are never fetched and re-rendered.
- The nav entry is added by this router via `res.locals.navLinks`, which
  `views/header-nav.ejs` renders generically. Its visibility does not depend
  on proxy configuration or upstream availability.
- Status codes, redirects, `Set-Cookie`, content types and cache-control
  headers are relayed untouched. Cookie and redirect rewriting are
  deliberately not configured — that contract belongs to the fantasy app.
- `/fantasy-football` redirects to `/fantasy-football/` with a 308, so methods
  and bodies survive canonicalization. Similarly named paths such as
  `/fantasy-football-picks` are left to the blog.
- The whole `x-forwarded-*`, `x-ms-client-principal*`, `x-ms-token-*`,
  `x-arr-*` and `x-waws-*` namespaces are stripped, along with `Forwarded`,
  `X-Real-IP` and friends. Namespaces rather than named headers, because
  enumerating vendor headers is a denylist that is never finished. The blog
  then states `X-Forwarded-Host`/`-Proto` from `FANTASY_PUBLIC_ORIGIN` — never
  from the request, not even from `Host`, which a caller controls. The
  browser's `Origin` is passed through unchanged so the fantasy app can run
  its own CSRF checks.
- Forwarding headers are not by themselves proof that a request came through
  the blog. The fantasy app restricts its origin at the network layer before
  trusting any of them.
- Upstream failures and the 30s timeout return 502 without affecting the rest
  of the blog. Only the method and path are logged — never query strings,
  headers or bodies.
- Sharing `thomasriley.ca` means both apps share one browser security origin,
  so a script-injection flaw in the blog can reach a signed-in fantasy user. A
  path prefix is routing, not isolation. Note `views/article-page.ejs` renders
  article HTML unescaped.

## Authentication is not validated here

The fantasy app's preferred contract places its endpoints under
`/fantasy-football/.auth/*`, which needs no special handling because the prefix
is preserved — but whether Azure Easy Auth accepts that path, and what its
callbacks, redirects and cookie scopes look like, is owned and tested by the
fantasy app. The test named "forwards paths shaped like the fantasy app's auth
routes" proves path forwarding only.

## Tests

`fantasy-football-router.test.cjs` covers this boundary end to end against a
real upstream: prefix preservation, method and body forwarding, cookies,
redirects, header stripping, upstream failure, and the untouched blog routes.
It runs in the lint workflow, or locally from `root-site`:

```bash
npm test
```
