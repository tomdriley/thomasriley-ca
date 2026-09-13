"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const { after, before, describe, it } = require("node:test");

const express = require("express");

const FANTASY_ORIGIN_VAR = "FANTASY_APP_ORIGIN";
const FANTASY_PUBLIC_ORIGIN_VAR = "FANTASY_PUBLIC_ORIGIN";

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

const startBlog = async (fantasyOrigin, publicOrigin) => {
  const previous = {
    [FANTASY_ORIGIN_VAR]: process.env[FANTASY_ORIGIN_VAR],
    [FANTASY_PUBLIC_ORIGIN_VAR]: process.env[FANTASY_PUBLIC_ORIGIN_VAR],
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
    [FANTASY_PUBLIC_ORIGIN_VAR]: publicOrigin,
  });
  // The router resolves its fixed upstream when it is constructed, so the
  // environment has to be in place for this call.
  const router = require("../dist/routes/router").default;
  const app = express();
  app.set("view engine", "ejs");
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
    blog = await startBlog(originOf(upstream), "https://thomasriley.ca");
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

  // Proves only that the prefix is forwarded intact. The real Azure Easy Auth
  // contract (callback URLs, redirects, cookie scope) is owned and tested by
  // the fantasy app and is NOT validated here.
  it("forwards paths shaped like the fantasy app's auth routes", async () => {
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

  it("replaces client-supplied forwarding and vendor headers", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: {
        "X-Forwarded-For": "9.9.9.9",
        "X-Forwarded-Host": "evil.example",
        "X-Forwarded-Proto": "http",
        "X-Forwarded-Prefix": "/",
        "X-Forwarded-Client-Cert": "spoofed",
        "X-Real-IP": "9.9.9.9",
        Forwarded: "for=9.9.9.9",
        "X-Original-URL": "/admin",
        "Disguised-Host": "evil.example",
        "X-ARR-SSL": "spoofed",
        "X-WAWS-Unencoded-URL": "/admin",
      },
    });
    const echo = await response.json();
    // The operator-configured public origin wins; nothing is taken from the
    // request, including the Host header the caller controls.
    assert.equal(echo.headers["x-forwarded-host"], "thomasriley.ca");
    assert.equal(echo.headers["x-forwarded-proto"], "https");
    for (const header of Object.keys(echo.headers)) {
      if (header === "x-forwarded-host" || header === "x-forwarded-proto") {
        continue;
      }
      assert.ok(
        !header.startsWith("x-forwarded-") &&
          !header.startsWith("x-arr-") &&
          !header.startsWith("x-waws-"),
        `expected ${header} to be stripped`
      );
    }
    assert.equal(echo.headers["x-real-ip"], undefined);
    assert.equal(echo.headers["forwarded"], undefined);
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

describe("fantasy football proxy when no public origin is configured", () => {
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

  it("forwards no X-Forwarded-* metadata at all", async () => {
    const response = await fetch(`${base}/fantasy-football/api/me`, {
      headers: { "X-Forwarded-Proto": "https", "X-Forwarded-Host": "evil" },
    });
    const echo = await response.json();
    for (const header of Object.keys(echo.headers)) {
      assert.ok(
        !header.startsWith("x-forwarded-"),
        `expected ${header} to be absent`
      );
    }
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
