import express, { NextFunction, Request, Response, Router } from "express";
import type { ClientRequest } from "http";
import { createProxyMiddleware } from "http-proxy-middleware";

import { getEnv } from "../../utils";

// The single path prefix the blog hands off to the fantasy football app. The
// prefix is preserved when forwarding, so the fantasy app owns every route
// beneath it without the blog enumerating them.
const FANTASY_PREFIX = "/fantasy-football";

const TIMEOUT_MS = 30_000;

// Any header a caller could use to claim an identity, a client address or a
// position in a forwarding chain is dropped before the blog sets its own
// metadata. Whole namespaces are removed rather than named members, because
// enumerating individual vendor headers is a denylist that is never finished.
const STRIPPED_HEADER_PREFIXES = [
  "x-forwarded-",
  "x-ms-client-principal",
  "x-ms-token-",
  // Injected by the blog's own Azure front end; they describe the blog
  // request, not the proxied one.
  "x-arr-",
  "x-waws-",
];

const STRIPPED_HEADERS = [
  "forwarded",
  "x-real-ip",
  "x-client-ip",
  "x-client-port",
  "x-original-url",
  "x-original-host",
  "x-rewrite-url",
  "x-appservice-proto",
  "x-site-deployment-id",
  "disguised-host",
];

// Matches the prefix itself and everything beneath it, but never a similarly
// named sibling such as /fantasy-football-picks.
const isFantasyPath = (pathname: string): boolean =>
  pathname === FANTASY_PREFIX || pathname.startsWith(`${FANTASY_PREFIX}/`);

// Reads a setting that must be a bare origin. Returns undefined when unset and
// null when present but unusable, so callers can tell the two apart.
const readOrigin = (name: string): URL | undefined | null => {
  const configured = getEnv(name);
  if (configured.isErr() || configured.value.trim() === "") {
    return undefined;
  }

  let origin: URL;
  try {
    origin = new URL(configured.value.trim());
  } catch {
    console.error(`${name} is not an absolute URL`);
    return null;
  }
  if (
    (origin.protocol !== "https:" && origin.protocol !== "http:") ||
    origin.username !== "" ||
    origin.password !== "" ||
    origin.pathname !== "/" ||
    origin.search !== "" ||
    origin.hash !== ""
  ) {
    console.error(
      `${name} must be a bare http or https origin without credentials, path, query or fragment`
    );
    return null;
  }
  return origin;
};

const respondWithBadGateway = (req: Request, res: Response): void => {
  if (res.headersSent) {
    // The upstream already started streaming; the only honest signal left is
    // to break the response rather than append an error to partial content.
    res.destroy();
    return;
  }
  const message = "Fantasy football is unavailable right now.";
  res.status(502).set("Cache-Control", "no-store");
  // The same prefix serves pages and an API, so both callers get a usable body.
  if (req.accepts(["html", "json"]) === "json") {
    res.json({ error: message });
    return;
  }
  res.render("error-page", { content: `502: ${message}` });
};

const fantasyFootballRouter = (): Router => {
  const router = express.Router();

  // Navigation stays visible even when the proxy is unconfigured.
  router.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.navLinks = [
      ...(res.locals.navLinks ?? []),
      { href: `${FANTASY_PREFIX}/`, label: "Fantasy Football" },
    ];
    next();
  });

  // The destination is fixed by operator configuration and never derived from
  // the request, so the blog cannot be turned into an open proxy.
  const upstream = readOrigin("FANTASY_APP_ORIGIN");

  if (upstream === undefined) {
    console.log(
      `${FANTASY_PREFIX} proxy is disabled: FANTASY_APP_ORIGIN is not set`
    );
    return router;
  }

  if (upstream === null) {
    console.error(`${FANTASY_PREFIX} proxy is disabled: invalid upstream`);
    router.use((req: Request, res: Response, next: NextFunction) => {
      if (!isFantasyPath(req.path)) {
        return next();
      }
      res.status(503).set("Cache-Control", "no-store");
      res.render("error-page", {
        content: "503: Fantasy football is unavailable right now.",
      });
    });
    return router;
  }

  // The hostname and scheme the browser used are stated by the operator, not
  // read back out of request headers a caller controls. When unset the blog
  // forwards no identity metadata at all, which is the honest default until the
  // fantasy app restricts its origin at the network layer.
  const publicOrigin = readOrigin("FANTASY_PUBLIC_ORIGIN") ?? undefined;
  if (publicOrigin === undefined) {
    console.log(
      `${FANTASY_PREFIX} proxy is forwarding no X-Forwarded-* metadata: FANTASY_PUBLIC_ORIGIN is not set`
    );
  }

  const proxy = createProxyMiddleware<Request, Response>({
    target: upstream.origin,
    // Rewrites only the Host header so App Service routes to the fantasy app.
    // The browser's Origin header is deliberately passed through untouched so
    // the fantasy app can run its own CSRF checks against the external origin.
    changeOrigin: true,
    // Forwarding metadata is set explicitly in the proxyReq hook instead.
    xfwd: false,
    // Upstream status codes, redirects, cookies, content types and
    // cache-control headers are relayed to the browser as-is. Cookie
    // domain/path and redirect rewriting are intentionally left unconfigured:
    // that contract belongs to the fantasy app.
    followRedirects: false,
    autoRewrite: false,
    secure: true,
    proxyTimeout: TIMEOUT_MS,
    on: {
      proxyReq: (proxyReq: ClientRequest) => {
        for (const header of proxyReq.getHeaderNames()) {
          if (
            STRIPPED_HEADERS.includes(header) ||
            STRIPPED_HEADER_PREFIXES.some((prefix) => header.startsWith(prefix))
          ) {
            proxyReq.removeHeader(header);
          }
        }
        if (publicOrigin !== undefined) {
          proxyReq.setHeader("X-Forwarded-Host", publicOrigin.host);
          proxyReq.setHeader(
            "X-Forwarded-Proto",
            publicOrigin.protocol.replace(":", "")
          );
        }
      },
      error: (error: NodeJS.ErrnoException, req: Request, res: unknown) => {
        // Log the method and path only: query strings carry authentication
        // codes, and headers and bodies carry cookies and credentials.
        console.error(
          `${FANTASY_PREFIX} proxy error for ${req.method} ${req.path}: ${
            error.code ?? error.message
          }`
        );
        // http-proxy hands back a raw socket for upgrade requests.
        if (typeof (res as Response | undefined)?.writeHead === "function") {
          respondWithBadGateway(req, res as Response);
        }
      },
    },
  });

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!isFantasyPath(req.path)) {
      return next();
    }
    if (req.path === FANTASY_PREFIX) {
      // 308 keeps the method and body intact while canonicalizing the prefix.
      const separator = req.url.indexOf("?");
      const search = separator === -1 ? "" : req.url.slice(separator);
      return res.redirect(308, `${FANTASY_PREFIX}/${search}`);
    }
    return proxy(req, res, next);
  });

  return router;
};

export default fantasyFootballRouter;
