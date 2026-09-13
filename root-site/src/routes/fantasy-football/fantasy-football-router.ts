import express, { NextFunction, Request, Response, Router } from "express";
import type { ClientRequest } from "http";
import type { TLSSocket } from "tls";
import { createProxyMiddleware, Options } from "http-proxy-middleware";

import { getEnv } from "../../utils";

// The single path prefix the blog hands off to the fantasy football app. The
// prefix is preserved when forwarding, so the fantasy app owns every route
// beneath it (pages, assets, API and its own /.auth/* endpoints) without the
// blog enumerating them.
const FANTASY_PREFIX = "/fantasy-football";

const DEFAULT_TIMEOUT_MS = 30_000;

// Client-supplied forwarding and identity headers are stripped before the blog
// sets its own forwarding metadata, so a caller cannot dictate the client
// address, scheme or external hostname the fantasy app sees. The x-arr-*/
// x-waws-* entries are injected by the blog's own Azure front end and describe
// the blog request, not the proxied one.
const STRIPPED_REQUEST_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-forwarded-prefix",
  "x-forwarded-scheme",
  "x-forwarded-server",
  "x-real-ip",
  "x-client-ip",
  "x-client-port",
  "x-original-url",
  "x-original-host",
  "x-rewrite-url",
  "true-client-ip",
  "cf-connecting-ip",
  "fastly-client-ip",
  "x-arr-ssl",
  "x-arr-log-id",
  "x-appservice-proto",
  "x-site-deployment-id",
  "x-waws-unencoded-url",
  "disguised-host",
];

// Azure Easy Auth injects the signed-in principal and provider tokens as
// request headers. A client must never be able to forge them.
const STRIPPED_REQUEST_HEADER_PREFIXES = [
  "x-ms-client-principal",
  "x-ms-token-",
];

type ProxyTarget =
  | { kind: "disabled" }
  | { kind: "misconfigured"; reason: string }
  | { kind: "enabled"; origin: string };

type ForwardedProtocol = "http" | "https";

// Matches the prefix itself and everything beneath it, but never a similarly
// named sibling such as /fantasy-football-picks.
const isFantasyPath = (pathname: string): boolean =>
  pathname === FANTASY_PREFIX || pathname.startsWith(`${FANTASY_PREFIX}/`);

// The destination is fixed by operator configuration and never derived from the
// request, so the blog cannot be turned into an open proxy.
const resolveTarget = (): ProxyTarget => {
  const configured = getEnv("FANTASY_APP_ORIGIN");
  if (configured.isErr()) {
    return { kind: "disabled" };
  }

  const raw = configured.value.trim();
  if (raw === "") {
    return { kind: "disabled" };
  }

  let origin: URL;
  try {
    origin = new URL(raw);
  } catch {
    return { kind: "misconfigured", reason: "value is not an absolute URL" };
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return {
      kind: "misconfigured",
      reason: "only http and https are supported",
    };
  }
  if (origin.username !== "" || origin.password !== "") {
    return { kind: "misconfigured", reason: "credentials are not supported" };
  }
  if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") {
    return {
      kind: "misconfigured",
      reason: "value must be a bare origin without a path, query or fragment",
    };
  }

  return { kind: "enabled", origin: origin.origin };
};

// The scheme the browser used is deliberately not read from X-Forwarded-Proto:
// that header is client-supplied and Express reads it from the wrong end of the
// chain. Deployments that terminate TLS at a front end set this explicitly.
const resolveForwardedProtocol = (): ForwardedProtocol | undefined => {
  const configured = getEnv("FANTASY_FORWARDED_PROTO");
  if (configured.isErr()) {
    return undefined;
  }
  const value = configured.value.trim().toLowerCase();
  if (value === "https" || value === "http") {
    return value;
  }
  if (value !== "") {
    console.error(
      `${FANTASY_PREFIX} proxy ignoring invalid FANTASY_FORWARDED_PROTO: expected http or https`
    );
  }
  return undefined;
};

const resolveTimeoutMs = (): number => {
  const configured = getEnv("FANTASY_APP_TIMEOUT_MS");
  if (configured.isErr()) {
    return DEFAULT_TIMEOUT_MS;
  }
  const parsed = Number(configured.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
};

// Azure App Service appends ":port" to the IPv4 address it puts in
// X-Forwarded-For; forward just the address.
const normalizeClientIp = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(trimmed);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }
  return trimmed === "" ? undefined : trimmed;
};

const queryStringOf = (req: Request): string => {
  const separator = req.url.indexOf("?");
  return separator === -1 ? "" : req.url.slice(separator);
};

const respondWithGatewayError = (
  req: Request,
  res: Response,
  status: number,
  message: string
): void => {
  if (res.headersSent) {
    // The upstream already started streaming; the only honest signal left is to
    // break the response rather than append an error to partial content.
    res.destroy();
    return;
  }
  res.status(status);
  res.set("Cache-Control", "no-store");
  if (req.accepts(["html", "json"]) === "json") {
    res.json({ error: message });
    return;
  }
  res.render("error-page", { content: `${status}: ${message}` });
};

const isServerResponse = (value: unknown): value is Response =>
  typeof (value as Response | undefined)?.writeHead === "function";

const fantasyFootballRouter = (): Router => {
  const router = express.Router();
  const target = resolveTarget();

  if (target.kind === "disabled") {
    console.log(
      `${FANTASY_PREFIX} proxy is disabled: FANTASY_APP_ORIGIN is not set`
    );
    return router;
  }

  if (target.kind === "misconfigured") {
    console.error(
      `${FANTASY_PREFIX} proxy is disabled: invalid FANTASY_APP_ORIGIN, ${target.reason}`
    );
    router.use((req: Request, res: Response, next: NextFunction) => {
      if (!isFantasyPath(req.path)) {
        return next();
      }
      respondWithGatewayError(
        req,
        res,
        503,
        "Fantasy football is not available right now."
      );
    });
    return router;
  }

  const timeoutMs = resolveTimeoutMs();
  const configuredProtocol = resolveForwardedProtocol();

  const proxyOptions: Options<Request, Response> = {
    target: target.origin,
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
    on: {
      proxyReq: (proxyReq: ClientRequest, req: Request) => {
        for (const header of STRIPPED_REQUEST_HEADERS) {
          proxyReq.removeHeader(header);
        }
        for (const header of proxyReq.getHeaderNames()) {
          if (
            STRIPPED_REQUEST_HEADER_PREFIXES.some((prefix) =>
              header.startsWith(prefix)
            )
          ) {
            proxyReq.removeHeader(header);
          }
        }

        const externalHost = req.headers.host;
        if (externalHost !== undefined) {
          proxyReq.setHeader("X-Forwarded-Host", externalHost);
        }
        const protocol: ForwardedProtocol =
          configuredProtocol ??
          ((req.socket as TLSSocket).encrypted === true ? "https" : "http");
        proxyReq.setHeader("X-Forwarded-Proto", protocol);
        proxyReq.setHeader(
          "X-Forwarded-Port",
          protocol === "https" ? "443" : "80"
        );
        // req.ip resolves through the single trusted front end configured with
        // "trust proxy", so a forged prefix in the client's chain is discarded.
        const clientIp = normalizeClientIp(req.ip ?? req.socket.remoteAddress);
        if (clientIp !== undefined) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }

        proxyReq.setTimeout(timeoutMs, () => {
          const timeout: NodeJS.ErrnoException = new Error(
            `No response from the fantasy app within ${timeoutMs}ms`
          );
          timeout.code = "ETIMEDOUT";
          proxyReq.destroy(timeout);
        });
      },
      error: (
        error: NodeJS.ErrnoException,
        req: Request,
        res: Response | unknown
      ) => {
        const timedOut = error.code === "ETIMEDOUT";
        // Log the method and path only: query strings carry authentication
        // codes, and headers and bodies carry cookies and credentials.
        console.error(
          `${FANTASY_PREFIX} proxy error for ${req.method} ${req.path}: ${
            error.code ?? error.message
          }`
        );
        if (!isServerResponse(res)) {
          return;
        }
        respondWithGatewayError(
          req,
          res,
          timedOut ? 504 : 502,
          timedOut
            ? "Fantasy football did not respond in time."
            : "Fantasy football is unreachable right now."
        );
      },
    },
  };

  const proxy = createProxyMiddleware<Request, Response>(proxyOptions);

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (!isFantasyPath(req.path)) {
      return next();
    }
    if (req.path === FANTASY_PREFIX) {
      // 308 keeps the method and body intact while canonicalizing the prefix.
      return res.redirect(308, `${FANTASY_PREFIX}/${queryStringOf(req)}`);
    }
    return proxy(req, res, next);
  });

  return router;
};

export default fantasyFootballRouter;
export { FANTASY_PREFIX, isFantasyPath, normalizeClientIp, resolveTarget };
