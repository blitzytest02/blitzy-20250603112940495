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

// These two lines are the entire configuration story of this project: one
// optional environment variable, read exactly once, and the default it falls
// back to. `process.env` is how a program reads the environment it was started
// in, so `PORT=8080 npm start` changes the port without touching code. There is
// no config file and no `.env` to load. A variable that was never set reads as
// `undefined`, and one set to nothing reads as `''`; both are falsy, so `||`
// hands the default through. A port typed into the environment arrives as a
// *string* — `PORT=8080` reads as `'8080'` — and `listen` takes the TCP port
// that string spells, so the documented override needs no conversion here.
const DEFAULT_PORT = 3000;
const port = process.env.PORT || DEFAULT_PORT;

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
// 3000, so an override such as `PORT=8080` is reflected in the address you are
// told to open. A startup line that disagreed with the running server would
// send you to a dead URL.
server.listen(port, HOST, () => {
  console.log(`Server running at http://${HOST}:${port}/hello`);
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
