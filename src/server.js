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
 * the `/hello` handler. Everything it is handed and does not recognise it
 * answers itself, with the `404` and the `405` written out further down — both
 * belong to the decision made here rather than to the endpoint.
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
  //
  // It is registered for one event: the server's `request` event, where
  // ordinary HTTP requests are delivered — so the decision below is this
  // service's entire answer to them. An upgrade handshake, which asks to switch
  // from HTTP to a protocol like WebSocket, is offered to a separate `upgrade`
  // event first; registering no listener there declines the switch, and the
  // request arrives here as the plain `GET` it also is.
  //
  // `CONNECT` alone never arrives here. It asks a proxy for a tunnel and names
  // a host and port rather than a path, so there is no `/hello` for it to
  // match; Node.js routes it to its own `connect` event and closes the
  // connection when nothing listens there — the right answer from a server that
  // is not a proxy, and why this file needs no case for it.
  return createServer((req, res) => {
    // `req.url` is the request target, copied straight off the request line,
    // and it arrives in one of two shapes: the bare path an ordinary request
    // sends (`/hello?name=x`), or the whole address a request relayed through
    // a proxy sends (`http://example.com/hello`), which a server is obliged to
    // accept. `URL` is the parser the platform already provides and it needs a
    // whole address, so a bare path is joined onto a stand-in origin to make
    // one; a target that is already an address is parsed as it stands.
    //
    // Joining the text rather than resolving it against a base URL is the
    // point of that split. Resolved against a base, a target opening with `//`
    // is read as naming a host, so the client rather than this file would
    // decide which characters became the path: `//example.com/hello` would
    // arrive here as `/hello` and reach the handler. Joined on, that target
    // keeps the pathname it actually has, `//example.com/hello`, which is not
    // the one path this service serves — so it is not found.
    //
    // Reading the pathname is what makes a query string a non-issue:
    // `/hello?name=x` has the pathname `/hello`, so this service ignores a
    // query without ever looking at one. A trailing slash is kept, though —
    // `/hello/` parses to `/hello/` rather than `/hello` — and that is exactly
    // why both spellings are matched below.
    //
    // `URL.parse` is that same parser in the form that returns `null` instead
    // of throwing. A request target arrives straight off the network and need
    // not be an address at all (`OPTIONS *` sends exactly `*`), and an
    // exception raised in here would end the process rather than the request —
    // so an unparseable target leaves `pathname` undefined and falls through to
    // the `404` below, which is the right answer for it.
    const url = req.url.startsWith('/')
      ? URL.parse(`http://localhost${req.url}`)
      : URL.parse(req.url);
    const pathname = url?.pathname;

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
      res.writeHead(405, {
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength('Method Not Allowed'),
      });
      res.end('Method Not Allowed');
      return;
    }

    // Anything else. This service has exactly one endpoint, so every other
    // path — `/` included — is genuinely not found.
    //
    // Both fallbacks are written with the same two calls the handler uses:
    // `writeHead` for the status and headers, then `end` for the body, so
    // there is one consistent way of answering a request in this project. Each
    // length is computed from its own text rather than typed as a number, so
    // the two can never drift apart. A framework such as Express would supply
    // a default `404` of its own; with core `node:http` there is no framework
    // to defer to, so the answer is written out where a reader can see it.
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength('Not Found'),
    });
    res.end('Not Found');
  });
}
