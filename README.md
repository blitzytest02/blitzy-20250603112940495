# hello-world-node-tutorial

The smallest complete Node.js HTTP server: one endpoint, zero dependencies, and about sixty lines of code written to be read end to end in a few minutes. That one endpoint is the whole of the contract:

| Method | Path | Status | Content-Type | Body |
| --- | --- | --- | --- | --- |
| `GET` | `/hello` | `200` | `text/plain; charset=utf-8` | `Hello world` |

The body is exactly `Hello world` — capital `H`, lowercase `w`, one space, no punctuation — and it carries **no trailing newline**, so it is exactly 11 bytes and the response states `Content-Length: 11`.

Everything else follows from that single route, and this server answers all of it itself:

- `/hello/`, the same path with a trailing slash, returns the identical response, so a slash typed into a browser is not a dead end.
- A query string is ignored: `/hello?name=x` matches `/hello`, because the match is made on the parsed pathname rather than on the raw text of the request target.
- `HEAD /hello` returns the same status and headers with an empty body.
- Any other path, `/` included, returns `404 Not Found`.
- Any other method on `/hello` returns `405 Method Not Allowed` with an `Allow: GET, HEAD` header.

## Prerequisites

**Node.js 24 LTS, version 24.18.1 or newer** — that is the line this project is tested on, reference build v24.21.0 — or Node.js 26, version 26.5.1 or newer, which is the Current line until it becomes Active LTS on 28 October 2026. Check what you have:

```bash
node --version
```

**npm**, which ships with Node.js. There is nothing else to install.

Two statements about the runtime are easy to run together, so it is worth separating them. `package.json` declares `"engines": { "node": ">=24.18.1 <25 || >=26.5.1 <27" }`, and that is the *permitted* set: two release lines, each closed at both ends. `>=24.18.1` is the first release on the 24 LTS line to carry the security fixes published on 29 July 2026, so the oldest runtime admitted is a patched one rather than an early 24.x. `<25` shuts out the Node.js 25 line completely. `>=26.5.1 <27` admits the 26 line on exactly the same terms — from its own 29 July 2026 patched release rather than from its first — and stops at the end of it. Nothing past 26 is admitted in advance, and that is the point of closing each range: a major that has not shipped yet has no patched baseline to name, so admitting it would be a promise this file cannot keep. When the next LTS line arrives, the range gains an arm for it. The *tested and supported* runtime is the Node.js 24 LTS line alone — that is where every command and every output in this file was verified. Node.js 26 is permitted but untested; it is expected to work, because the code uses only core APIs (`node:http`, `node:test`, the WHATWG `URL` class and the global `fetch`), but that is an expectation rather than a guarantee.

The reason the range skips a whole major: **Node.js 25 has reached end of life and should not be used.** Odd-numbered Node.js lines never become LTS — each gets about six months as the Current line and then stops receiving fixes — so rather than admit 25 and warn you about it in prose, the range leaves it out, as it leaves out every odd line after it. Install an LTS line instead.

One caveat worth carrying beyond this project: `engines` is a declaration, not a gate. npm checks it while *installing* — on a runtime outside the range, `npm install` prints a warning beginning `npm warn EBADENGINE` and carries on anyway, or stops with `npm error code EBADENGINE` if you have set `npm config set engine-strict true` in your own npm configuration. npm does **not** check it when it runs a script, so `npm start` and `npm test` will start on any version you have, and this project has no install step for the check to happen during. That is why the prerequisite above is a `node --version` you run yourself. The server does not inspect its own runtime version either: that check is deliberately absent from `src/index.js`, so the file you read there stays about starting a server.

## Install — there is no install step

Nothing needs installing. This project has zero runtime dependencies and zero development dependencies: `package.json` carries no `dependencies` block and no `devDependencies` block at all.

There is nothing to configure either, and that is worth stating plainly rather than leaving you to infer it: **no environment file, no database and no external service is required** for `npm start` to succeed. The one variable the server reads, `PORT`, carries a working default of `3000`, so there is nothing to set before the first run. Cloning the repository is the whole of the setup.

Running `npm install` anyway is not an error, merely pointless — but it does write a `package-lock.json` into your working directory. `.gitignore` keeps that file out of version control, so it stays a local artefact and never becomes part of the repository.

## Start

```bash
npm start
```

That runs `node src/index.js` and prints:

```text
> hello-world-node-tutorial@1.0.0 start
> node src/index.js

Server running at http://127.0.0.1:3000/hello
```

The last line is the application's entire output, with `3000` replaced by whatever port was resolved. The two lines beginning with `>` come from npm itself, announcing the script it is about to run; they are not produced by this code.

The process now stays alive waiting for requests instead of finishing. Leave it running and open a second terminal for the next step.

## Verify

```bash
curl -i http://localhost:3000/hello
```

```text
HTTP/1.1 200 OK
Content-Type: text/plain; charset=utf-8
Content-Length: 11
Date: <RFC 7231 date>
Connection: keep-alive
Keep-Alive: timeout=5

Hello world
```

Four things worth knowing about that output:

- `Date`, `Connection` and `Keep-Alive` are emitted by Node.js itself and are **not** part of the contract this project asserts. The asserted headers are `Content-Type` and `Content-Length`.
- Because the body carries no trailing newline, your shell prompt returns on the same line as `Hello world`. That is expected, and not truncation.
- On **Windows PowerShell 5.1**, `curl` is an alias for `Invoke-WebRequest` rather than the curl program, so the command there names the executable directly:

```text
curl.exe -i http://localhost:3000/hello
```

- Where `curl` is not installed at all, the same status, headers and body can be read with the runtime this project already requires:

```bash
node -e "fetch('http://localhost:3000/hello').then(async r => console.log(r.status, r.headers.get('content-type'), r.headers.get('content-length'), JSON.stringify(await r.text())))"
```

That prints:

```text
200 text/plain; charset=utf-8 11 "Hello world"
```

A browser pointed at `http://localhost:3000/hello` shows the same text. Treat it as a body-only smoke test: an address bar shows you the text but not the status line or the headers, so it cannot confirm the rest of the contract.

## Test

```bash
npm test
```

That runs `node --test`, and the runner finds `test/hello.test.js` on its own because the name ends in `.test.js` — there is no test configuration file, and nothing was installed to make the tests run. The suite starts a server of its own on an ephemeral port, so it never collides with an `npm start` left running in another terminal, and it asserts the whole contract: the `/hello` success response with its status, `Content-Type` and `Content-Length`; the `/hello/` trailing-slash alias; `HEAD /hello` returning identical headers with an empty body; `404 Not Found` for an unknown path; and `405 Method Not Allowed` with `Allow: GET, HEAD` for `POST /hello`.

## Stop

Press **Ctrl-C** in the terminal running the server. It prints:

```text
Server stopped
```

and exits cleanly. Do this rather than take it on trust: releasing the port on the way out is what the signal handling in `src/index.js` is for, and watching it happen is the point of the exercise.

## What each file teaches

Six files besides this one, and each carries a single idea.

**`src/index.js`** — how a Node.js process reads its configuration and starts listening. It resolves the port from `process.env.PORT` with a default of `3000`, binds `127.0.0.1`, and logs the startup line with the *resolved* port interpolated, so an override such as `PORT=8080` is reflected in the address you are told to open. It also handles the two events that bracket a server's life: a port that cannot be claimed (reported as a readable sentence instead of a stack trace) and a shutdown signal. `listen` is the call that makes this a server rather than a script — the process stops running off the end of the file and waits for connections instead.

**`src/server.js`** — how a server is created, and how a request is matched to a handler. `createServer`, from the built-in `node:http` module, takes one listener function and calls it once per incoming request. It reads the pathname out of `req.url` with the `URL` parser the platform already provides — which is what drops a query string for you, while keeping a trailing slash — and routes `GET` and `HEAD` on `/hello` or `/hello/` to the handler. It exports `createHelloServer()`, a function that returns a configured `http.Server` which is deliberately **not** listening, so the entry point can choose the real port and the test suite can choose an ephemeral one. The `404` and `405` replies live here, with the dispatcher's decision, rather than with the endpoint: they describe a request this server declined to route, not anything `/hello` does. A framework such as Express would supply a default `404` of its own; with core `node:http` there is no framework to defer to, so the answer is written out where you can read it.

**`src/hello.js`** — what a handler does with `req` and `res`. Node hands every handler those two objects: the request that arrived, and a writable stream for the response travelling back. The handler writes the status and headers first, with `writeHead`, and the body last, with `res.end`, because that is the order an HTTP response travels in. It states `Content-Length` explicitly — told nothing, Node frames the body with chunked transfer encoding, and supplying the length is what makes the `curl -i` output above exactly what you see. There is no `HEAD` branch anywhere in the project: Node.js keeps the status and headers of a `HEAD` response and discards the body, so one handler serves both methods. That is a property of the runtime rather than code written here, which is why the suite asserts it instead of assuming it.

**`test/hello.test.js`** — how an HTTP route is tested without any extra tooling. The runner (`node:test`) and the assertions (`node:assert/strict`) are both part of Node.js. The suite binds port `0`, which asks the operating system to assign an arbitrary unused port, reads back the port it assigned, and issues real requests with the global `fetch`. It asserts the literal `'Hello world'` rather than importing the constant from `src/hello.js` — so editing that constant breaks the test instead of quietly redefining what the endpoint may return.

**`package.json`** — what a manifest declares: the name and version npm echoes in its banner, `"type": "module"` (which is what makes `import` work in every file here), the `start` and `test` scripts, and the `engines` range that fixes which Node.js versions this project supports — two ranges of patched releases, each closed at both ends, rather than a bare `>=`, for the reasons given under Prerequisites. Read it for what is absent as much as for what is present — there is no `dependencies` block and no `devDependencies` block. That emptiness is deliberate: nothing to install, nothing to lock, no third-party code to audit, and no module graph to load before the server starts.

**`.gitignore`** — why `node_modules` never belongs in version control. It is generated rather than authored, it is large, and npm can recreate it from the manifest at any time, so committing it would put machine-specific installed output into your history. The same file excludes npm's debug logs and `package-lock.json`; with nothing to lock here, an accidental install leaves an untracked local file rather than an eighth tracked one.

## Changing the port

`PORT` is the one knob this project has, and the form depends on your shell. macOS and Linux shells:

```bash
PORT=8080 npm start
```

PowerShell:

```text
$env:PORT=8080; npm start
```

Windows `cmd`:

```text
set "PORT=8080" && npm start
```

Keep the quotes exactly as written in the `cmd` form: without them the value absorbs the space before `&&`, and the port is wrong.

The startup line then names the port actually bound:

```text
Server running at http://127.0.0.1:8080/hello
```

and the whole contract is served on 8080.

The host is not a knob. It is fixed at `127.0.0.1`, the loopback address — this machine talking to itself — so starting this server exposes nothing to your local network.

## Where this tutorial stops

This project is a teaching artefact for one reader on one machine. It has no TLS, no authentication, no authorisation, no rate limiting and no CORS headers, all absent by design for a local service that returns one public constant, and it has no deployment path.

These are the concepts it deliberately does not teach, each of them a reasonable next step:

- routing at scale, and router abstractions
- middleware and request pipelines
- template engines and server-rendered HTML
- persistence and data modelling
- authentication and authorisation
- request validation
- deployment, containers and process managers
- TypeScript and build steps
- clustering and load balancing

Naming them is the point. This is where the project stops, so nothing above reads as forgotten.
