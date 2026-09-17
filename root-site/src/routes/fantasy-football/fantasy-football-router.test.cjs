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
  const router = require("../../../dist/routes/router").default;
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

// Each scenario differs only in how the blog is configured, so the shared
// setup keeps the per-suite boilerplate down to that one line.
const proxySuite = (name, setUp, defineTests) => {
  describe(name, () => {
    const ctx = {};
    before(async () => setUp(ctx));
    after(async () => {
      await close(ctx.blog);
      await close(ctx.upstream);
    });
    defineTests(ctx);
  });
};

const withUpstream = (publicOrigin) => async (ctx) => {
  ctx.upstream = await startUpstream();
  ctx.blog = await startBlog(originOf(ctx.upstream), publicOrigin);
  ctx.base = originOf(ctx.blog);
};

const withoutUpstream = (fantasyOrigin) => async (ctx) => {
  ctx.blog = await startBlog(fantasyOrigin);
  ctx.base = originOf(ctx.blog);
};

proxySuite(
  "fantasy football proxy",
  withUpstream("https://thomasriley.ca"),
  (ctx) => {
    it("forwards nested pages, assets and query strings with the prefix intact", async () => {
      for (const path of [
        "/fantasy-football/league/1/roster",
        "/fantasy-football/assets/app.js?v=9&x=y",
        // Proves only that the prefix is forwarded. The real Azure Easy Auth
        // contract (callback URLs, redirects, cookie scope) is owned and tested
        // by the fantasy app and is NOT validated here.
        "/fantasy-football/.auth/login/google/callback?code=abc&state=xyz",
      ]) {
        const response = await fetch(`${ctx.base}${path}`);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).url, path);
      }
    });

    it("forwards methods and request bodies", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await fetch(`${ctx.base}/fantasy-football/api/picks`, {
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

    it("preserves status codes, redirects, cookies and cache-control", async () => {
      const teapot = await fetch(`${ctx.base}/fantasy-football/teapot`);
      assert.equal(teapot.status, 418);
      assert.equal(await teapot.text(), "teapot");

      const redirect = await fetch(`${ctx.base}/fantasy-football/redirect`, {
        redirect: "manual",
      });
      assert.equal(redirect.status, 302);
      assert.equal(
        redirect.headers.get("location"),
        "/fantasy-football/after-redirect"
      );

      const page = await fetch(`${ctx.base}/fantasy-football/dashboard`);
      const cookies = page.headers.getSetCookie();
      assert.equal(cookies.length, 2);
      assert.match(cookies[0], /^AppServiceAuthSession=abc; Path=\/; HttpOnly/);
      assert.equal(page.headers.get("cache-control"), "no-store, private");
    });

    it("preserves the browser Origin but retargets Host", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football/api/me`, {
        headers: { Origin: "https://thomasriley.ca" },
      });
      const echo = await response.json();
      assert.equal(echo.headers.origin, "https://thomasriley.ca");
      assert.equal(
        echo.headers.host,
        `127.0.0.1:${ctx.upstream.address().port}`
      );
    });

    it("strips every forgeable forwarding and identity header", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football/api/me`, {
        headers: {
          "X-Forwarded-For": "9.9.9.9",
          "X-Forwarded-Host": "evil.example",
          "X-Forwarded-Proto": "http",
          "X-Forwarded-Client-Cert": "spoofed",
          "X-Real-IP": "9.9.9.9",
          Forwarded: "for=9.9.9.9",
          "X-Original-URL": "/admin",
          "Disguised-Host": "evil.example",
          "X-ARR-SSL": "spoofed",
          "X-WAWS-Unencoded-URL": "/admin",
          "X-MS-CLIENT-PRINCIPAL": "ZmFrZQ==",
          "x-ms-client-principal-name": "attacker@example.com",
          "x-ms-token-google-access-token": "forged",
        },
      });
      const echo = await response.json();
      // The operator-configured public origin wins; nothing is taken from the
      // request, including the Host header the caller controls.
      assert.equal(echo.headers["x-forwarded-host"], "thomasriley.ca");
      assert.equal(echo.headers["x-forwarded-proto"], "https");
      const allowed = new Set(["x-forwarded-host", "x-forwarded-proto"]);
      for (const header of Object.keys(echo.headers)) {
        if (allowed.has(header)) {
          continue;
        }
        for (const prefix of [
          "x-forwarded-",
          "x-ms-client-principal",
          "x-ms-token-",
          "x-arr-",
          "x-waws-",
        ]) {
          assert.ok(
            !header.startsWith(prefix),
            `expected ${header} to be stripped`
          );
        }
      }
      for (const header of [
        "forwarded",
        "x-real-ip",
        "x-original-url",
        "disguised-host",
      ]) {
        assert.equal(echo.headers[header], undefined);
      }
    });

    it("canonicalizes the bare prefix without losing the method", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football?week=3`, {
        redirect: "manual",
      });
      assert.equal(response.status, 308);
      assert.equal(
        response.headers.get("location"),
        "/fantasy-football/?week=3"
      );
    });

    it("leaves similarly named paths and the rest of the blog alone", async () => {
      const sibling = await fetch(`${ctx.base}/fantasy-football-picks`);
      assert.equal(sibling.status, 404);
      assert.match(await sibling.text(), /404/);

      const home = await fetch(`${ctx.base}/`);
      assert.equal(home.status, 200);
      const body = await home.text();
      assert.match(body, /Tom Riley/);
      assert.match(body, /<a href="\/blog">Blog<\/a>/);
      // The feature adds its own nav entry rather than the blog hard-coding one.
      assert.match(
        body,
        /<a href="\/fantasy-football\/">Fantasy Football<\/a>/
      );

      const css = await fetch(`${ctx.base}/css/minimal.css`);
      assert.equal(css.status, 200);
    });
  }
);

proxySuite(
  "fantasy football proxy without a public origin",
  withUpstream(undefined),
  (ctx) => {
    it("forwards no X-Forwarded-* metadata at all", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football/api/me`, {
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
  }
);

proxySuite(
  "fantasy football proxy with an unreachable upstream",
  async (ctx) => {
    // Bind and immediately release a port so nothing is listening on it.
    const placeholder = await startUpstream();
    const origin = originOf(placeholder);
    await close(placeholder);
    await withoutUpstream(origin)(ctx);
  },
  (ctx) => {
    it("returns 502 as HTML or JSON without breaking the blog", async () => {
      const page = await fetch(`${ctx.base}/fantasy-football/dashboard`, {
        headers: { Accept: "text/html" },
      });
      assert.equal(page.status, 502);
      assert.equal(page.headers.get("cache-control"), "no-store");

      const api = await fetch(`${ctx.base}/fantasy-football/api/picks`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(api.status, 502);
      assert.match(api.headers.get("content-type"), /application\/json/);

      assert.equal((await fetch(`${ctx.base}/`)).status, 200);
    });
  }
);

proxySuite(
  "fantasy football proxy when unconfigured",
  withoutUpstream(undefined),
  (ctx) => {
    it("falls through to the blog 404 handler", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football/dashboard`);
      assert.equal(response.status, 404);
    });

    it("advertises no nav link, so nothing points at a 404", async () => {
      const body = await (await fetch(`${ctx.base}/`)).text();
      assert.match(body, /<a href="\/blog">Blog<\/a>/);
      assert.doesNotMatch(body, /Fantasy Football/);
    });
  }
);

proxySuite(
  "fantasy football proxy when misconfigured",
  withoutUpstream("not-a-url"),
  (ctx) => {
    it("returns 503 rather than proxying somewhere unintended", async () => {
      const response = await fetch(`${ctx.base}/fantasy-football/dashboard`);
      assert.equal(response.status, 503);
      assert.equal((await fetch(`${ctx.base}/`)).status, 200);
    });
  }
);
