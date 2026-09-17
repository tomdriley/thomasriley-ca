# Fantasy football proxy

`/fantasy-football` and everything beneath it is reverse-proxied to a separate
fantasy football App Service; the two applications and their deployment
pipelines stay independent. The blog does not enumerate the fantasy app's
routes, so pages, assets and its API all flow through the same prefix, with the
prefix preserved.

Everything the blog contributes lives in this folder, plus three lines
elsewhere: one `router.use` in `../router.ts`, one nav link in
`views/header-nav.ejs`, and the stage settings in `scripts/bootstrap-stage.py`.

## Settings

| Setting | Required | Meaning |
| --- | --- | --- |
| `FANTASY_APP_ORIGIN` | yes, to enable | Bare upstream origin, e.g. `https://thomasriley-fantasy-w3-pilot-stage.azurewebsites.net`. No path, query or credentials. |
| `FANTASY_PUBLIC_ORIGIN` | recommended | The external origin browsers use, e.g. `https://thomasriley.ca`. Supplies `X-Forwarded-Host` and `X-Forwarded-Proto`. When unset, no forwarding metadata is sent. |

Stage and production configure these separately. `bootstrap-stage.py` resolves
`FANTASY_APP_ORIGIN` for the blog's stage slot from the fantasy app's `stage`
slot and fails rather than falling back to the fantasy production app. When
`FANTASY_APP_ORIGIN` is unset the proxy is not mounted and the prefix simply
404s, so production routing stays off until it is configured deliberately; an
invalid value returns 503 instead of proxying somewhere unintended.

## Behavior worth knowing before changing this code

- The proxy is mounted ahead of the static-file, page and 404 handlers, and
  nothing may parse or buffer request bodies ahead of it. Requests stream
  through `http-proxy-middleware`; pages are never fetched and re-rendered.
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
