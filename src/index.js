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

// A TCP port is a whole number from 0 to 65535, where 0 is the special request
// "any free port you have". Anything else has to be turned away here, before
// `listen` sees it, because `listen` does not turn it away in a way a learner
// would recognise: handed text that is not a number it opens a Unix-domain
// socket named after the value instead of a TCP port, so the server reports
// success while serving nothing over HTTP, and handed a number outside the
// range it throws from inside Node before the `error` handler below gets the
// chance to explain itself.
const LOWEST_PORT = 0;
const HIGHEST_PORT = 65535;

/**
 * Turns the optional `PORT` environment variable into a port to bind.
 *
 * @param {string|undefined} value The raw `process.env.PORT`, set or not.
 * @param {number} fallbackPort The port to use when `PORT` says nothing.
 * @returns {number} The port to bind — never a value `listen` could not bind,
 *   because an unusable one ends the process with a readable message instead.
 */
const resolvePort = (value, fallbackPort) => {
  // A variable that was never set reads as `undefined`, and one set to nothing
  // reads as blank; either way there is no preference to honour, so the
  // documented default applies.
  const requested = (value ?? '').trim();
  if (requested === '') {
    return fallbackPort;
  }

  // The environment hands every variable over as text — `PORT=8080` arrives as
  // the string `'8080'` — so it has to be read as a number before it can be
  // checked. `Number` understands every spelling of a number JavaScript knows,
  // so `3000`, `+3000` and `0x0BB8` all pass and all mean the same port, while
  // `abc` becomes `NaN` and is refused along with anything fractional or too
  // large for a port.
  const requestedPort = Number(requested);

  if (
    !Number.isInteger(requestedPort) ||
    requestedPort < LOWEST_PORT ||
    requestedPort > HIGHEST_PORT
  ) {
    // The same posture as the bind failure below: one readable sentence naming
    // the value and the remedy, then a non-zero exit — never a stack trace
    // aimed at a beginner. `JSON.stringify` quotes the value and escapes any
    // control character in it, so even a stray newline cannot break the
    // message across two lines.
    console.error(
      `PORT must be a whole number between ${LOWEST_PORT} and ` +
        `${HIGHEST_PORT}, but it was set to ${JSON.stringify(value)}. Start ` +
        'this server on a valid port instead: PORT=8080 npm start'
    );
    process.exit(1);
  }

  return requestedPort;
};

// These two lines are the entire configuration story of this project: one
// optional environment variable, read exactly once, and the default it falls
// back to. `process.env` is how a program reads the environment it was started
// in, so `PORT=8080 npm start` changes the port without touching code. There is
// no config file and no `.env` to load, and what comes back is always a number
// a socket can be bound to.
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
// The address is interpolated into the message rather than written out as
// 3000, so an override such as `PORT=8080` is reflected in the address you are
// told to open. A startup line that disagreed with the running server would
// send you to a dead URL.
server.listen(port, HOST, () => {
  // The port comes from the server rather than from the variable above,
  // because the two are not always the same number: `PORT=0` asks the
  // operating system for any free port, and only the server can say which one
  // it was given. `address()` is how you ask, once it is listening.
  const { port: boundPort } = server.address();

  console.log(`Server running at http://${HOST}:${boundPort}/hello`);
});

/** Closes the listening socket, so the process can finish. */
const shutdown = () => {
  // `close` stops the server accepting new connections and then calls back when
  // its `close` event fires — after the connections it is still holding have
  // ended, which is why stopping is a step of its own rather than instant.
  // Nothing calls `process.exit` here: with no listening socket left there is
  // nothing keeping the process alive, so once the line below is printed the
  // process ends on its own.
  server.close(() => {
    console.log('Server stopped');
  });
};

// A signal is a short message the operating system delivers to a running
// process. Pressing Ctrl-C in this terminal sends `SIGINT`; `SIGTERM` is the
// polite "please stop" that a process manager or the `kill` command sends. Both
// mean the same thing to this server, so both release the port the same way.
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
