/**
 * The dispatcher: how an incoming request finds its handler.
 *
 * `node:http` ships with Node.js itself. The `node:` prefix on the import is
 * how you say "this comes with the runtime", so there is nothing to install
 * before this file runs — which is why this project has no dependencies at
 * all. `createServer` is the whole of what a Node.js program needs to speak
 * HTTP.
 *
 * This file does one job: build the server, and decide which requests reach
 * the `/hello` handler. Everything it does not recognise it answers itself.
 */

import { createServer } from 'node:http';

// Under ES modules a relative import must name the file extension: `./hello`
// does not resolve, `./hello.js` does.
import { handleHello } from './hello.js';

/**
 * Builds the HTTP server for this project with the request dispatcher already
 * wired in.
 *
 * The returned server is **not listening**. Creating a server and starting it
 * are two separate steps, and this function performs only the first — calling
 * `listen` is the caller's job. That split is what lets `src/index.js` bind
 * the real port while the test suite binds an ephemeral one with
 * `server.listen(0)`, so a development server already holding port 3000 can
 * never make the tests fail.
 *
 * @returns {import('node:http').Server} A configured but idle `http.Server`;
 *   call `listen` on it to start accepting connections.
 */
export function createHelloServer() {
  // `createServer` takes one listener function and calls it once per incoming
  // request, handing it two objects: `req`, the request that arrived (a
  // readable stream carrying the method, URL and headers), and `res`, a
  // writable stream for the response travelling back to the client. Until
  // something calls `listen` on the server returned here, no connection is
  // accepted and this listener never runs.
  return createServer((req, res) => {
    // `req.url` is only the part of the address after the host — something
    // like `/hello?name=x` — so it is parsed rather than compared as-is.
    // `URL` is a JavaScript global, so there is nothing to import; it needs a
    // base to resolve a path-only reference against, and because only the
    // pathname is read here, the host that base names is irrelevant.
    //
    // Parsing buys one thing and deliberately not another: the query string
    // drops away (`/hello?name=x` gives `/hello`), while a trailing slash is
    // kept exactly as typed (`/hello/` stays `/hello/`). That is precisely
    // why both spellings are matched below.
    const { pathname } = new URL(req.url, 'http://localhost');

    // The path is checked before the method. That order is what makes
    // `POST /nope` a `404` rather than a `405`: a path this service does not
    // serve has no allowed methods to talk about in the first place.
    if (pathname === '/hello' || pathname === '/hello/') {
      if (req.method === 'GET' || req.method === 'HEAD') {
        // `HEAD` is the same read as `GET` without the body, and Node.js
        // discards the body of a `HEAD` response on its own — so the single
        // handler serves both methods with no special case here or in it.
        handleHello(req, res);
        return;
      }

      // The path exists, this method does not belong on it. A `405` is
      // expected to say which methods do, and `Allow` is the header carrying
      // that list.
      const body = 'Method Not Allowed';
      res.writeHead(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    // Anything else. This service has exactly one endpoint, so every other
    // path — `/` included — is genuinely not found.
    //
    // Both of these replies live in the dispatcher rather than in
    // `src/hello.js` because they describe a decision made here, not anything
    // the `/hello` endpoint does. A framework such as Express would supply a
    // default `404` of its own; with core `node:http` there is no framework to
    // defer to, so the answer is written out where a reader can see it.
    //
    // They are written with the same two calls the handler uses — `writeHead`
    // for the status and headers, then `end` for the body — so there is one
    // consistent way of answering a request in this project. The length is
    // computed from the text rather than typed as a number, so the two can
    // never drift apart.
    const body = 'Not Found';
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  });
}
