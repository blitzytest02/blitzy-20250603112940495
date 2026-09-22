/**
 * The entry point: how a Node.js process reads its configuration and starts
 * listening.
 *
 * This is the file `npm start` runs, and the only file that decides *where*
 * the server runs. Building the server belongs to `src/server.js`; this file
 * resolves the port, binds it, and handles the two events that surround a
 * server's life — a port that cannot be claimed, and a request to shut down.
 *
 * It exports nothing, because nothing imports a process entry point.
 */

// Under ES modules a relative import must name the file extension: `./server`
// does not resolve, `./server.js` does.
import { createHelloServer } from './server.js';

// A port is a whole number from 1 to 65535: 65535 is the highest one there is,
// and 0 means "pick any free port", which would leave the startup line below
// advertising a port nobody is listening on. Only plain digits count, because
// an environment variable is a *string*, and `Number(' 80 ')` or `Number('1e3')`
// would quietly accept a value nobody meant to type.
const SMALLEST_PORT = 1;
const LARGEST_PORT = 65535;
const DIGITS_ONLY = /^[0-9]+$/;

// Anything that is not plain printable ASCII — space through `~`. The `u` flag
// steps through whole characters rather than half of one, so a character
// outside the basic set is matched in one piece.
const NOT_PRINTABLE_ASCII = /[^ -~]/gu;

/**
 * Renders a rejected `PORT` value as one quoted, printable line for the message
 * below.
 *
 * A value that came from the environment must never be printed as it arrived:
 * newlines, terminal escape codes and the Unicode line separators would each
 * let it fake extra output — a bogus "server running" line, say, or a change of
 * colour. `JSON.stringify` quotes the value and escapes the familiar control
 * characters; the pass after it escapes everything `JSON.stringify` leaves
 * alone, so what reaches the terminal is only printable ASCII.
 *
 * @param {string} value The raw environment value being rejected.
 * @returns {string} The value quoted and escaped, safe to log on one line.
 */
const quoteForLog = (value) =>
  JSON.stringify(value).replace(
    NOT_PRINTABLE_ASCII,
    (character) => `\\u{${character.codePointAt(0).toString(16)}}`
  );

/**
 * Turns the raw `PORT` string into the number to bind, or explains the problem
 * and stops the process.
 *
 * Checking before binding is the whole point: `listen` accepts far more than a
 * port — a non-numeric string becomes the path of a Unix socket, with the host
 * ignored, and a number above 65535 throws before the `error` handler below
 * could turn it into a readable sentence.
 *
 * @param {string|undefined} value The raw `process.env.PORT` value, if set.
 * @param {number} fallbackPort The port to bind when `PORT` is not set.
 * @returns {number} The port to bind, as a number.
 */
const resolvePort = (value, fallbackPort) => {
  // An unset variable reads as `undefined` and `PORT=` reads as an empty
  // string; both mean "no preference", so both take the default.
  if (value === undefined || value === '') {
    return fallbackPort;
  }

  // Digits are all this accepts, so the value is already a whole number by the
  // time it is compared — only the range is left to check.
  const requestedPort = Number(value);

  if (
    !DIGITS_ONLY.test(value) ||
    requestedPort < SMALLEST_PORT ||
    requestedPort > LARGEST_PORT
  ) {
    // The offending value goes through `quoteForLog` rather than straight into
    // the message, so whatever it contains, the reader sees one printable line.
    console.error(
      `PORT must be a whole number between ${SMALLEST_PORT} and ${LARGEST_PORT}, ` +
        `but it was set to ${quoteForLog(value)}. Start this server on a ` +
        'valid port instead: PORT=8080 npm start'
    );

    // Same posture as the bind failure below: one readable sentence and a
    // non-zero exit, rather than a stack trace aimed at a beginner.
    process.exit(1);
  }

  return requestedPort;
};

// These two lines are the entire configuration story of this project: one
// optional environment variable, read exactly once, and the default it falls
// back to. `process.env` is how a program reads the environment it was started
// in, so `PORT=8080 npm start` changes the port without touching code. There is
// no config file and no `.env` to load, and what comes back here is always a
// number — so the port that gets bound and the port that gets logged cannot
// drift apart.
const DEFAULT_PORT = 3000;
const port = resolvePort(process.env.PORT, DEFAULT_PORT);

// The address the server binds to. `127.0.0.1` is this machine talking to
// itself, so the server answers requests from this computer and is invisible to
// the rest of the network — the right posture for a tutorial you run locally.
// Unlike the port it is deliberately not configurable: one knob is enough.
const HOST = '127.0.0.1';

// A server object, fully wired but idle: it is not listening on anything yet.
const server = createHelloServer();

// `listen` below starts its work and returns immediately rather than finishing
// it, so a failure cannot be thrown back at the caller — the server reports it
// on the `error` event instead. In practice there is one error you will meet
// here: `EADDRINUSE`, meaning the port is already taken, usually by another
// copy of this server left running in a forgotten terminal.
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${port} is already in use. Stop whatever is listening there, or ` +
        'start this server on a free port instead: PORT=8080 npm start'
    );
  } else {
    console.error(`The server could not start: ${error.message}`);
  }

  // A server that never claimed a port has nothing to serve, so the process
  // ends here — with a non-zero exit code, which is how a program tells the
  // shell that it failed rather than finished.
  process.exit(1);
});

// `listen` is what makes this a server rather than a script: it claims the port
// and then the process *stays alive*, waiting for connections, instead of
// running off the end of the file and exiting. From here on, everything that
// happens is a response to an incoming request.
//
// The resolved port is interpolated into the message rather than written out as
// 3000, so the address printed is always the address actually bound. A startup
// line that disagreed with the running server would send you to a dead URL.
server.listen(port, HOST, () => {
  console.log(`Server running at http://${HOST}:${port}/hello`);
});

// Shutting down takes a moment, and an impatient second Ctrl-C arrives inside
// that moment. This flag remembers that the first one was already answered.
let isShuttingDown = false;

/** Closes the listening socket once, so the process can finish. */
const shutdown = () => {
  // The first signal wins and every later one is ignored. Without this guard a
  // second signal would ask an already-closing server to close again, which
  // reports an error and would print the shutdown line a second time — and one
  // shutdown deserves exactly one shutdown line.
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  // `close` stops the server accepting connections and calls back once the port
  // has actually been released — or with an error if it could not be. The
  // callback reads that argument instead of assuming success, because the line
  // it prints is a claim that the port is free. Nothing calls `process.exit` on
  // the happy path: with no listening socket left, there is nothing keeping the
  // process alive, so it ends on its own.
  server.close((error) => {
    if (error) {
      console.error(`The server could not shut down cleanly: ${error.message}`);
      process.exit(1);
    } else {
      console.log('Server stopped');
    }
  });
};

// A signal is a short message the operating system delivers to a running
// process. Pressing Ctrl-C in this terminal sends `SIGINT`; `SIGTERM` is the
// polite "please stop" that a process manager or the `kill` command sends. Both
// mean the same thing to this server, so both release the port the same way.
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
