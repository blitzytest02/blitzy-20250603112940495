'use strict';

const http = require('http');

/**
 * Port the server binds when the PORT environment variable is not set or is blank.
 * @type {number}
 */
const DEFAULT_PORT = 3000;

/**
 * Lowest port this application accepts. Values below it need elevated privileges on
 * most systems, so they are refused rather than attempted.
 * @type {number}
 */
const MIN_PORT = 1024;

/**
 * Highest port the TCP/IP port space allows.
 * @type {number}
 */
const MAX_PORT = 65535;

/** Body of the greeting response. @type {string} */
const HELLO_BODY = 'Hello world';

/** Body of the catch-all response. @type {string} */
const NOT_FOUND_BODY = 'Not Found';

/** Body of the response sent when request handling fails unexpectedly. @type {string} */
const INTERNAL_ERROR_BODY = 'Internal Server Error';

/**
 * Route table keyed by "<METHOD> <path>". Keying on the method as well as the path is
 * what makes method matching exact and gives the catch-all its meaning: "POST /hello"
 * simply finds no entry, so no separate 405 branch is needed.
 * Frozen so a future edit cannot mutate the running route set by accident.
 * @type {Readonly<{[key: string]: (response: import('http').ServerResponse) => void}>}
 */
const ROUTES = Object.freeze({
  'GET /hello': (response) => sendText(response, 200, HELLO_BODY)
});

/**
 * Turn the raw PORT environment value into a port to bind.
 * @param {string|undefined} rawValue Value of process.env.PORT, or undefined when unset.
 * @returns {number|null} The validated port, or null after logging why the value was refused.
 */
function resolvePort(rawValue) {
  const value = rawValue === undefined ? '' : String(rawValue);

  if (value.trim() === '') {
    return DEFAULT_PORT;
  }

  // A digits-only test is the whole validation: it rejects a sign, a decimal point and
  // surrounding whitespace, and it avoids parseInt coercion (parseInt('12abc', 10) is 12,
  // while Number('12abc') is NaN).
  const isDigitsOnly = /^\d+$/.test(value);
  const port = isDigitsOnly ? Number(value) : NaN;

  // 0 is refused too: the runtime would ask the OS to pick a port, which is outside the
  // accepted range. The value is never clamped and never silently corrected.
  if (!isDigitsOnly || port < MIN_PORT || port > MAX_PORT) {
    console.error(
      `Invalid PORT "${value}": expected an integer between ${MIN_PORT} and ${MAX_PORT}, `
      + `for example PORT=${DEFAULT_PORT}.`
    );
    return null;
  }

  return port;
}

/**
 * Reduce a request target to the path the route table is keyed on.
 * The target is sliced at the query string rather than parsed with `new URL()`, because
 * that parser rewrites the target before the comparison: it resolves dot segments
 * ("/foo/../hello" becomes "/hello") and re-encodes some characters (a raw space becomes
 * "%20"). Slicing keeps the route match, and the logged path, a literal match on
 * exactly what the client sent, with no decoding, lower-casing or re-encoding applied.
 * @param {string} requestUrl Raw request target, path plus optional query string.
 * @returns {string} The path portion of the target.
 */
function parsePath(requestUrl) {
  const queryIndex = requestUrl.indexOf('?');
  return queryIndex === -1 ? requestUrl : requestUrl.slice(0, queryIndex);
}

/**
 * Write one request line, before any routing decision, so a request served a 404 is
 * logged exactly like one that succeeds.
 * @param {string} method HTTP method of the request.
 * @param {string} path Request path, with the query string already split off.
 * @returns {void}
 */
function logRequest(method, path) {
  console.log(`${new Date().toISOString()} ${method} ${path}`);
}

/**
 * Write a plain-text response. The only place in this file where a response is written,
 * so both endpoints and the failure path are framed identically.
 * No other header is set: the runtime adds Date on its own, and the framing it chooses
 * for the body is runtime detail. writeHead must precede end, and end closes the stream.
 * @param {import('http').ServerResponse} response Response to write to.
 * @param {number} statusCode HTTP status code.
 * @param {string} body Response body.
 * @returns {void}
 */
function sendText(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  response.end(body);
}

/**
 * Request listener: parse the target, log the request, match the route, respond.
 * Synchronous throughout, with no I/O and no await, so the event loop never queues behind a
 * request and latency stays well inside the budget. Reads only request.method and the
 * path portion of request.url; headers and the body stream are never touched.
 * @param {import('http').IncomingMessage} request Incoming request.
 * @param {import('http').ServerResponse} response Response to complete.
 * @returns {void}
 */
function handleRequest(request, response) {
  try {
    const path = parsePath(request.url);
    logRequest(request.method, path);

    const routeHandler = ROUTES[`${request.method} ${path}`];

    if (routeHandler === undefined) {
      sendText(response, 404, NOT_FOUND_BODY);
      return;
    }

    routeHandler(response);
  } catch (error) {
    // The runtime throws on invalid header names and values, so nothing here may reach
    // the client: the detail goes to the console and the response body stays fixed.
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`Request handling failed: ${detail}`);

    if (response.headersSent) {
      // The headers are already on the wire, so a second writeHead would fail. Destroying
      // the response is the only safe way to leave the connection in a defined state.
      response.destroy();
      return;
    }

    sendText(response, 500, INTERNAL_ERROR_BODY);
  }
}

/**
 * Create the server and wire its lifecycle events.
 * @param {number} port Validated port to bind.
 * @returns {import('http').Server} The listening server.
 */
function startServer(port) {
  const server = http.createServer(handleRequest);

  // Open connections are tracked so shutdown can release idle keep-alive ones. The server
  // cannot be closed by server.closeAllConnections() here: that API arrived in Node 18.2.0
  // and this application supports the whole 18.0.0 line.
  const sockets = new Set();

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => {
      sockets.delete(socket);
    });
  });

  // Registered before listen(): an unhandled bind error would otherwise surface as an
  // uncaught exception with a raw stack trace instead of an actionable line.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(
        `Cannot start the server: port ${port} is already in use (EADDRINUSE). Stop the `
        + `process using that port, or start on another one, for example: `
        + `PORT=3001 node server.js`
      );
    } else {
      console.error(
        `Cannot start the server on port ${port}: ${error.code} ${error.message}. Choose a free `
        + `port between ${MIN_PORT} and ${MAX_PORT}, for example: PORT=3001 node server.js`
      );
    }

    process.exitCode = 1;
  });

  // once(), not on(): a second CTRL+C must neither repeat the log line nor close twice.
  process.once('SIGINT', () => {
    shutdown(server, sockets);
  });

  // The startup line is written from the listen callback, which the runtime documents as
  // the 'listening' listener, so it can never claim a port the socket layer refused.
  server.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  return server;
}

/**
 * Stop the server on SIGINT and let the process end: with status 0 for a server that was
 * serving, and with the status a fatal path already set rather than success.
 * @param {import('http').Server} server Server to close.
 * @param {Set<import('net').Socket>} sockets Open connections tracked by startServer.
 * @returns {void}
 */
function shutdown(server, sockets) {
  console.log('Server shutting down (SIGINT received)');

  server.close(() => {
    // process.exit() is deliberately not called: the runtime documents that it can
    // truncate pending writes to stdout, which is where the shutdown line was just
    // written. Setting the exit code lets the event loop drain and exit cleanly.
    // A status a fatal path already set is left standing, never overwritten with 0.
    if (process.exitCode === undefined) {
      process.exitCode = 0;
    }
  });

  // Destroying the tracked sockets keeps an idle keep-alive connection from holding the
  // close callback open.
  sockets.forEach((socket) => {
    socket.destroy();
  });
}

// Startup sequence: a null port means resolvePort() has already logged the reason, so no
// server is created, nothing binds, and the process exits with status 1.
const port = resolvePort(process.env.PORT);

if (port === null) {
  process.exitCode = 1;
} else {
  startServer(port);
}
