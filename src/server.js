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
 * the `/hello` handler. Everything it does not recognise it answers itself —
 * including the two cases a first server usually gets wrong: a request target
 * that only looks like `/hello` once a URL parser has tidied it up, and a
 * `CONNECT` request, which Node.js delivers outside the ordinary listener.
 */

import { createServer } from 'node:http';

// Under ES modules a relative import must name the file extension: `./hello`
// does not resolve, `./hello.js` does.
import { handleHello } from './hello.js';

// The only two spellings of the one path this service serves. `/hello` is
// canonical, and `/hello/` is served as the same route so a trailing slash
// typed into a browser is not a dead end.
const HELLO_PATH = '/hello';
const HELLO_PATH_WITH_SLASH = '/hello/';

// The methods `/hello` answers, written the way the `Allow` header wants them:
// a comma-separated list. Every other method on that path gets the `405`.
const ALLOWED_METHODS = 'GET, HEAD';

// The bodies of the two replies this dispatcher writes itself. They are named
// here because each is sent from two places — an ordinary request is answered
// through `res`, a `CONNECT` request by writing to its socket directly — and
// the two have to agree to the byte.
const NOT_FOUND_BODY = 'Not Found';
const METHOD_NOT_ALLOWED_BODY = 'Method Not Allowed';

// The address a request target is measured against. A request line carries
// only the part after the host — `/hello?name=x` — which is a relative
// reference, and the `URL` parser needs an absolute address to resolve one
// against.
//
// The host named here stands in for this server, and it is not idle
// decoration: a target can carry an authority of its own, so
// `//example.test/hello` resolves to a path on *that* host rather than this
// one. The origin check below is what notices.
const REQUEST_TARGET_BASE = 'http://localhost';

/**
 * Decides whether a request target addresses the `/hello` route.
 *
 * The target arrives straight off the network, so it can be anything at all,
 * and two separate hazards have to be dealt with before it can be compared:
 *
 * 1. **It may not parse.** `new URL('//', base)` throws a `TypeError`, and an
 *    exception thrown inside a request listener takes the whole server process
 *    down instead of producing a reply. `URL.parse` is the same parser in its
 *    non-throwing form — it returns `null` where `new URL` would throw — which
 *    turns an unparseable target into the ordinary `404` below.
 * 2. **It may parse to `/hello` without being `/hello`.** A URL parser tidies
 *    up what it reads: `/a/../hello`, `/%2e/hello` and `/hello/%2e%2e/hello`
 *    all resolve to the pathname `/hello`, and `//example.test/hello` resolves
 *    to `/hello` on a different host entirely. Routing on the parsed pathname
 *    alone would serve all four under a path this service never advertised, so
 *    the raw target is what gets matched here and the parse is used to prove
 *    that target needed no tidying up.
 *
 * @param {string | undefined} requestTarget The target exactly as it arrived,
 *   which is what `req.url` holds.
 * @returns {boolean} `true` only for a raw `/hello` or `/hello/`, with or
 *   without a query string; `false` for everything else, a target the parser
 *   rejects included.
 */
function isHelloTarget(requestTarget) {
  if (typeof requestTarget !== 'string') {
    return false;
  }

  // Everything from the first `?` onwards is the query string, which this
  // service ignores: `/hello?name=x` is the `/hello` route.
  const rawPath = requestTarget.split('?')[0];

  const parsed = URL.parse(requestTarget, REQUEST_TARGET_BASE);
  if (parsed === null) {
    // Not a valid address at all. `//` is the shortest example: it promises an
    // authority and then names none.
    return false;
  }

  if (parsed.origin !== REQUEST_TARGET_BASE) {
    // The target named a host of its own, so it was never asking this server
    // for anything.
    return false;
  }

  if (parsed.pathname !== rawPath) {
    // The parser had to change the path to make sense of it — a dot segment,
    // an encoded dot, a fragment, or a whole URL where a path belongs.
    // Whatever it resolved to, what arrived was not one of the two spellings
    // this service serves.
    return false;
  }

  return rawPath === HELLO_PATH || rawPath === HELLO_PATH_WITH_SLASH;
}

/**
 * Writes one complete plain-text HTTP response onto a socket and closes it.
 *
 * Ordinary requests are answered through `res`, which knows how to format a
 * response. A `CONNECT` request is handed a bare socket instead, so its reply
 * has to be written exactly as it travels on the wire: the status line, the
 * headers, a blank line, then the body, every line ending in a carriage return
 * and a line feed (`\r\n`) because that is what HTTP specifies.
 *
 * @param {import('node:net').Socket} socket The socket handed over with the
 *   `connect` event.
 * @param {string} statusLine The status code and its reason phrase together,
 *   for example `'404 Not Found'`.
 * @param {string} body The plain-text body to send.
 * @param {string[]} [extraHeaders] Header lines to send ahead of the three this
 *   function always sends.
 * @returns {void}
 */
function writeRawResponse(socket, statusLine, body, extraHeaders = []) {
  const head = [
    `HTTP/1.1 ${statusLine}`,
    ...extraHeaders,
    'Content-Type: text/plain; charset=utf-8',
    // Computed from the text rather than typed as a number, so the length and
    // the body can never drift apart.
    `Content-Length: ${Buffer.byteLength(body)}`,
    // A socket offered up for `CONNECT` cannot carry ordinary requests
    // afterwards, so the client is told plainly that it ends here.
    'Connection: close',
  ];

  socket.end(`${head.join('\r\n')}\r\n\r\n${body}`);
}

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
  const server = createServer((req, res) => {
    // `req.url` holds the request target — the part of the address after the
    // host, something like `/hello?name=x` — and `isHelloTarget` above is what
    // decides whether it addresses this service's one route. Nothing in here
    // can throw, which matters: an exception raised while answering a request
    // would end the process rather than the request.
    //
    // The path is checked before the method. That order is what makes
    // `POST /nope` a `404` rather than a `405`: a path this service does not
    // serve has no allowed methods to talk about in the first place.
    if (isHelloTarget(req.url)) {
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
        Allow: ALLOWED_METHODS,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(METHOD_NOT_ALLOWED_BODY),
      });
      res.end(METHOD_NOT_ALLOWED_BODY);
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
    res.writeHead(404, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(NOT_FOUND_BODY),
    });
    res.end(NOT_FOUND_BODY);
  });

  // One method never reaches the listener above, and it is worth knowing why.
  // `CONNECT` asks a server to open a tunnel rather than to serve a document,
  // so Node.js reports it on a separate `connect` event and hands over the raw
  // socket instead of a `res` object. A server with no `connect` listener
  // simply drops the connection, which would leave `CONNECT /hello` with no
  // answer at all — and this service promises a `405` for every method other
  // than `GET` and `HEAD`, and a `404` for every other path. So the same
  // classification runs again here, and the reply is written by hand.
  server.on('connect', (req, socket) => {
    // A raw socket reports its own failures, and an error nobody is listening
    // for would be thrown at the process. A client that walks away mid-reply
    // is a normal event, not a reason to stop serving everybody else, so the
    // socket is simply discarded.
    socket.on('error', () => {
      socket.destroy();
    });

    if (!socket.writable) {
      return;
    }

    if (isHelloTarget(req.url)) {
      writeRawResponse(
        socket,
        '405 Method Not Allowed',
        METHOD_NOT_ALLOWED_BODY,
        [`Allow: ${ALLOWED_METHODS}`]
      );
      return;
    }

    writeRawResponse(socket, '404 Not Found', NOT_FOUND_BODY);
  });

  // The server is handed back still idle — created, wired, and listening to
  // nothing until its caller says so.
  return server;
}
