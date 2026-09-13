"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, describe, it } = require("node:test");

const express = require("express");

const FANTASY_ORIGIN_VAR = "FANTASY_APP_ORIGIN";
const FANTASY_PROTO_VAR = "FANTASY_FORWARDED_PROTO";

// Upstream stand-in for the fantasy app. Echoes what it received so the tests
// can assert on the exact request the blog forwarded.
const startUpstream = async () => {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      if (req.url.startsWith("/fantasy-football/redirect")) {
        res.writeHead(302, { Location: "/fantasy-football/after-redirect" });
        res.end();
        return;
      }
      if (req.url.startsWith("/fantasy-football/teapot")) {
        res.writeHead(418, { "Content-Type": "text/plain" });
        res.end("teapot");
        return;
      }
      if (req.url.startsWith("/fantasy-football/slow")) {
        // Never responds, so the proxy's bounded timeout is what ends it.
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, private",
        "Set-Cookie": [
          "AppServiceAuthSession=abc; Path=/; HttpOnly; Secure",
          "extra=1; Path=/fantasy-football/",
        ],
      });
      res.end(
        JSON.stringify({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString(),
        })
      );
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return server;
};

const startBlog = async (fantasyOrigin, forwardedProto) => {
  const previous = {
    [FANTASY_ORIGIN_VAR]: process.env[FANTASY_ORIGIN_VAR],
    [FANTASY_PROTO_VAR]: process.env[FANTASY_PROTO_VAR],
  };
  const applyEnv = (values) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  };
  applyEnv({
    [FANTASY_ORIGIN_VAR]: fantasyOrigin,
    [FANTASY_PROTO_VAR]: forwardedProto,
  });
  // The router resolves its fixed upstream when it is constructed, so the
  // environment has to be in place for this call.
  const router = require("../dist/routes/router").default;
  const app = express();
  app.set("view engine", "ejs");
  // Matches server.ts: exactly one trusted hop, the Azure front end.
  app.set("trust proxy", 1);
  app.use("/", router());
  const server = await new Promise((resolve) => {
    const created = app.listen(0, "127.0.0.1", () => resolve(created));
  });
  applyEnv(previous);
  return server;
};

const close = (server) =>
  new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.closeAllConnections?.();
    server.close(resolve);
  });

const originOf = (server) => `http://127.0.0.1:${server.address().port}`;

describe("fantasy football proxy", () => {
  let upstream;
  let blog;
  let base;

  before(async () => {
    upstream = await startUpstream();
    // Mirrors production: TLS terminates at the Azure front end, so the
    // external scheme is configured rather than read from a request header.
    blog = await startBlog(originOf(upstream), "https");
    base = originOf(blog);
  });

  after(async () => {
    await close(blog);
    await close(upstream);
  });

  it("forwards nested pages with the prefix preserved", async () => {
    const response = await fetch(`${base}/fantasy-football/league/1/roster`);
    assert.equal(response.status, 200);
    const echo = await response.json();
    assert.equal(echo.url, "/fantasy-football/league/1/roster");
  });

  it("forwards assets and query strings beneath the prefix", async () => {
    const response = await fetch(
      `${base}/fantasy-football/assets/app.js?v=9&x=y`
    );
    const echo = await response.json();
    assert.equal(echo.url, "/fantasy-football/assets/app.js?v=9&x=y");
  });

  it("forwards the authentication routes owned by the fantasy app", async () => {
    const response = await fetch(
      `${base}/fantasy-football/.auth/login/google/callback?code=abc&state=xyz`
    );
    const echo = await response.json();
    assert.equal(
      echo.url,
      "/fantasy-football/.auth/login/google/callback?code=abc&state=xyz"
    );
  });

  it("forwards methods and request bodies", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${base}/fantasy-football/api/picks`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick: "QB" }),
      });
      const echo = await response.json();
      assert.equal(echo.method, method);
      assert.equal(echo.body, '{"pick":"QB"}');
      assert.equal(echo.headers["content-type"], "application/json");
    }
  });

  it("preserves upstream status codes and redirects", async () => {
    const teapot = await fetch(`${base}/fantasy-football/teapot`);
    assert.equal(teapot.status, 418);
    assert.equal(await teapot.text(), "teapot");

    const redirect = await fetch(`${base}/fantasy-football/redirect`, {
      redirect: "manual",
    });
    assert.equal(redirect.status, 302);
    assert.equal(
      redirect.headers.get("location"),
      "/fantasy-football/after-redirect"
    );
  });

  it("preserves Set-Cookie and cache-control headers", async () => {
    const response = await fetch(`${base}/fantasy-football/dashboard`);
    const cookies = response.headers.getSetCookie();
    assert.equal(cookies.length, 2);
    assert.match(cookies[0], /^AppServiceAuthSession=abc; Path=\/; HttpOnly/);
    assert.equal(response.headers.get("cache-control"), "no-store, private");
  });

  it("preserves the browser Origin but retargets Host", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: { Origin: "https://thomasriley.ca" },
    });
    const echo = await response.json();
    assert.equal(echo.headers.origin, "https://thomasriley.ca");
    assert.equal(echo.headers.host, `127.0.0.1:${upstream.address().port}`);
  });

  it("replaces client-supplied forwarding headers", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: {
        // "9.9.9.9" is the forged prefix; the trailing entry is what the
        // trusted front end appends for the real client.
        "X-Forwarded-For": "9.9.9.9, 203.0.113.7:51234",
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "http",
        "X-Forwarded-Prefix": "/",
        "X-Real-IP": "9.9.9.9",
        Forwarded: "for=9.9.9.9",
        "X-Original-URL": "/admin",
        "Disguised-Host": "evil.example",
      },
    });
    const echo = await response.json();
    assert.equal(
      echo.headers["x-forwarded-host"],
      `127.0.0.1:${blog.address().port}`
    );
    assert.equal(echo.headers["x-forwarded-proto"], "https");
    assert.equal(echo.headers["x-forwarded-port"], "443");
    assert.equal(echo.headers["x-forwarded-for"], "203.0.113.7");
    assert.equal(echo.headers["x-real-ip"], undefined);
    assert.equal(echo.headers["forwarded"], undefined);
    assert.equal(echo.headers["x-forwarded-prefix"], undefined);
    assert.equal(echo.headers["x-original-url"], undefined);
    assert.equal(echo.headers["disguised-host"], undefined);
  });

  it("strips forged Azure identity headers", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: {
        "X-MS-CLIENT-PRINCIPAL": "ZmFrZQ==",
        "x-ms-client-principal-name": "attacker@example.com",
        "x-ms-client-principal-id": "1",
        "x-ms-token-google-access-token": "forged",
      },
    });
    const echo = await response.json();
    for (const header of Object.keys(echo.headers)) {
      assert.ok(
        !header.startsWith("x-ms-client-principal") &&
          !header.startsWith("x-ms-token-"),
        `expected ${header} to be stripped`
      );
    }
  });

  it("canonicalizes the bare prefix without losing the method", async () => {
    const response = await fetch(`${base}/fantasy-football?week=3`, {
      redirect: "manual",
    });
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "/fantasy-football/?week=3");
  });

  it("does not claim similarly named blog paths", async () => {
    const response = await fetch(`${base}/fantasy-football-picks`);
    assert.equal(response.status, 404);
    assert.match(await response.text(), /404/);
  });

  it("leaves the existing blog routes untouched", async () => {
    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /Tom Riley/);

    const css = await fetch(`${base}/css/minimal.css`);
    assert.equal(css.status, 200);
  });
});

describe("fantasy football proxy when no external scheme is configured", () => {
  let upstream;
  let blog;
  let base;

  before(async () => {
    upstream = await startUpstream();
    blog = await startBlog(originOf(upstream), undefined);
    base = originOf(blog);
  });

  after(async () => {
    await close(blog);
    await close(upstream);
  });

  it("reports the real connection scheme, not the client's claim", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: { "X-Forwarded-Proto": "https" },
    });
    const echo = await response.json();
    assert.equal(echo.headers["x-forwarded-proto"], "http");
    assert.equal(echo.headers["x-forwarded-port"], "80");
  });
});

describe("fantasy football proxy when the upstream stalls", () => {
  let upstream;
  let blog;
  let base;
  let previousTimeout;

  before(async () => {
    upstream = await startUpstream();
    previousTimeout = process.env.FANTASY_APP_TIMEOUT_MS;
    process.env.FANTASY_APP_TIMEOUT_MS = "300";
    blog = await startBlog(originOf(upstream), "https");
    base = originOf(blog);
    if (previousTimeout === undefined) {
      delete process.env.FANTASY_APP_TIMEOUT_MS;
    } else {
      process.env.FANTASY_APP_TIMEOUT_MS = previousTimeout;
    }
  });

  after(async () => {
    await close(blog);
    await close(upstream);
  });

  it("gives up on a bounded timeout with 504", async () => {
    const response = await fetch(`${base}/fantasy-football/slow`);
    assert.equal(response.status, 504);

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
  });
});

describe("fantasy football proxy when the upstream is unavailable", () => {
  let blog;
  let base;

  before(async () => {
    // Bind and immediately release a port so nothing is listening on it.
    const placeholder = await startUpstream();
    const origin = originOf(placeholder);
    await close(placeholder);
    blog = await startBlog(origin);
    base = originOf(blog);
  });

  after(async () => {
    await close(blog);
  });

  it("returns 502 without breaking the blog", async () => {
    const response = await fetch(`${base}/fantasy-football/dashboard`, {
      headers: { Accept: "text/html" },
    });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get("cache-control"), "no-store");

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
  });

  it("returns a JSON 502 to API callers", async () => {
    const response = await fetch(`${base}/fantasy-football/api/picks`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 502);
    assert.match(response.headers.get("content-type"), /application\/json/);
  });
});

describe("fantasy football proxy when unconfigured", () => {
  let blog;
  let base;

  before(async () => {
    blog = await startBlog(undefined);
    base = originOf(blog);
  });

  after(async () => {
    await close(blog);
  });

  it("falls through to the blog 404 handler", async () => {
    const response = await fetch(`${base}/fantasy-football/dashboard`);
    assert.equal(response.status, 404);
  });
});

describe("fantasy football proxy when misconfigured", () => {
  let blog;
  let base;

  before(async () => {
    blog = await startBlog("not-a-url");
    base = originOf(blog);
  });

  after(async () => {
    await close(blog);
  });

  it("returns 503 rather than proxying somewhere unintended", async () => {
    const response = await fetch(`${base}/fantasy-football/dashboard`);
    assert.equal(response.status, 503);

    const home = await fetch(`${base}/`);
    assert.equal(home.status, 200);
  });
});
