# Node.js Hello World HTTP Server

## What this is

A minimal Node.js HTTP server that uses nothing outside Node.js itself. It answers one greeting endpoint and replies with a 404 to everything else, so the whole path from an incoming request to the outgoing response is readable in one sitting. It is a local learning reference, not a production service: one route, no authentication, no database, no framework.

The project is three files: `server.js` (the server itself), `package.json` (project metadata) and this `README.md`.

## Prerequisites

- **Node.js 18.0.0 or newer.** Anything from `v18.0.0` upwards works.
- **`curl`**, used by the testing steps below. It is already installed on macOS and on most Linux distributions. On Windows, run the commands in Git Bash. If you would rather not use `curl` at all, you can paste the same URLs into a browser address bar: you will see the response body, but not the status code or the headers.

Check your Node.js version with:

```bash
node --version
```

You should see something like `v22.23.3`. `package.json` declares the version this project requires as `"node": ">=18.0.0"`, so anything from `v18.0.0` upwards satisfies it.

## Installation

There is nothing to install beyond Node.js. `package.json` declares no `dependencies` and no `devDependencies`, so there is no package to download and no build step.

Do not run `npm install`. It has nothing to install and would only create files this project does not use.

## Running the server

Open a terminal in the folder that contains `server.js` and start the server with either of these two equivalent commands:

```bash
node server.js
```

```bash
npm start
```

Both print the same startup line:

```
Server listening on port 3000
```

The server now stays in the foreground and prints one line for every request it receives until you stop it. Leave this terminal running and use a second terminal for the next section.

`npm start` prints a few banner lines of its own before the server's output, so its terminal looks like this:

```

> nodejs-tutorial-hello-world@1.0.0 start
> node server.js

Server listening on port 3000
```

Look for the startup line rather than for a completely empty terminal.

## Testing the server

With the server still running in the first terminal, open a second terminal and run the commands below. The `-i` flag tells `curl` to print the response status line and headers as well as the body.

### The greeting endpoint

```bash
curl -i http://localhost:3000/hello
```

```
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Fri, 16 Oct 2026 09:39:26 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

Hello world
```

`200 OK` means the request succeeded, `Content-Type: text/plain` says the body is plain text, and the body is `Hello world` - 11 bytes, with no trailing newline.

Everything between the `Content-Type` line and the blank line is added by Node.js: `Date` is automatic, and `Connection`, `Keep-Alive` and `Transfer-Encoding` describe how the connection is being framed. The lines you see may differ from the sample above, because Node.js chooses them and its choices can change between versions. This server itself sets exactly one header, `Content-Type: text/plain`, and never sets `Content-Length`.

### A path that is not defined

```bash
curl -i http://localhost:3000/invalid
```

```
HTTP/1.1 404 Not Found
Content-Type: text/plain
Date: Fri, 16 Oct 2026 09:39:26 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

Not Found
```

No route matches `/invalid`, so the server answers with its catch-all: status `404 Not Found`, `Content-Type: text/plain`, body `Not Found`. Every other method-and-path combination gets that same response.

### The greeting path with another method

```bash
curl -i -X POST http://localhost:3000/hello
```

```
HTTP/1.1 404 Not Found
Content-Type: text/plain
Date: Fri, 16 Oct 2026 09:39:26 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

Not Found
```

This is a 404, not a 405. The server matches the method and the path together, so `POST /hello` finds no route and is answered exactly like an unknown path.

### Paths that look like the greeting route but are not

The server compares the path literally: it takes what the client sent and splits off the query string (everything from `?` onwards). Nothing is resolved, decoded or lower-cased, so each of these commands returns `404 Not Found`:

```bash
curl -i http://localhost:3000/hello/
curl -i http://localhost:3000/HELLO
curl -i --path-as-is http://localhost:3000/foo/../hello
curl -i --path-as-is 'http://localhost:3000/hello%20'
```

- `/hello/` - the trailing slash makes it a different path.
- `/HELLO` - path matching is case-sensitive.
- `/foo/../hello` - the path is never resolved, so it does not become `/hello`. `--path-as-is` matters here: without it, `curl` removes the `..` segment before sending the request, the server receives `/hello`, and you get `200 OK` instead.
- `/hello%20` - percent escapes are not decoded, so `%20` stays part of the path.

### The greeting path with a query string

```bash
curl -i 'http://localhost:3000/hello?x=1'
```

```
HTTP/1.1 200 OK
Content-Type: text/plain
Date: Fri, 16 Oct 2026 09:39:26 GMT
Connection: keep-alive
Keep-Alive: timeout=5
Transfer-Encoding: chunked

Hello world
```

The route matches the path `/hello`. The `?x=1` part is not part of the path, is never read, and does not change the response.

## Expected output

Every request produces one line in the server's terminal, and each of those lines belongs to one `curl` response in the other terminal.

Server terminal:

```
Server listening on port 3000
2026-10-16T09:39:26.361Z GET /hello
2026-10-16T09:39:26.369Z GET /invalid
2026-10-16T09:39:26.375Z POST /hello
```

Each request line has three fields, separated by single spaces:

- the time the request arrived, as an ISO-8601 UTC timestamp with millisecond precision (the trailing `Z` means UTC);
- the HTTP method (`GET`, `POST`, and so on);
- the path, exactly as the client sent it, with the query string left off.

The lines are printed in arrival order and before the server decides what to answer, so a request that ends in a 404 is logged just like one that succeeds. Lining the two terminals up:

| Line in the server terminal | Response in the second terminal |
| --- | --- |
| `2026-10-16T09:39:26.361Z GET /hello` | `HTTP/1.1 200 OK`, `Content-Type: text/plain`, body `Hello world` |
| `2026-10-16T09:39:26.369Z GET /invalid` | `HTTP/1.1 404 Not Found`, `Content-Type: text/plain`, body `Not Found` |
| `2026-10-16T09:39:26.375Z POST /hello` | `HTTP/1.1 404 Not Found`, `Content-Type: text/plain`, body `Not Found` |

The startup line and the request lines go to standard output; problems go to standard error. Both streams are printed into the same terminal by default, which is where you will see the error lines below.

One more line exists that you should not normally see:

```
Request handling failed: <error message>
```

If answering a request fails unexpectedly, the server writes that line to standard error and replies with `500 Internal Server Error` and the body `Internal Server Error`. If the failure happens after the response headers have already gone out, there is nothing left to send safely, so the server ends the connection instead of writing a second response. The error text appears only in your terminal; the response never carries it.

## Shutting down

Go to the terminal running the server and press CTRL+C. The server stops accepting new connections, closes the ones that are open, prints one last line and exits:

```
Server shutting down (SIGINT received)
```

The shell prompt comes back, nothing is listening on port 3000 any more, and `node server.js` exits with status `0`. You can check that in the same terminal:

```bash
echo $?
```

```
0
```

If you started the server with `npm start`, CTRL+C reaches it the same way and prints the same line, but `npm` then exits with its own status rather than the server's `0`. Start with `node server.js` if you want to see the server's own exit status.

## Configuring the port

The port comes from the `PORT` environment variable. Set it in front of the command to use a different port:

```bash
PORT=4000 node server.js
```

```
Server listening on port 4000
```

The server now answers on port 4000 - `curl -i http://localhost:4000/hello` returns `200 OK` with `Hello world` - and nothing is listening on 3000.

| `PORT` | What happens |
| --- | --- |
| not set, empty or blank | the server binds port `3000` |
| a whole number from `1024` to `65535` | the server binds that port |
| anything else | the value is refused, with the message below, and the process exits with status `1` |

A value is either accepted or refused; it is never rounded, clamped or corrected. That covers `PORT=abc`, `PORT=80.5`, `PORT=80` (below 1024, which would need elevated privileges on most systems), `PORT=70000` (higher than the largest port) and `PORT=0` (which Node.js would read as "pick a free port for me"). For example:

```bash
PORT=abc node server.js
```

```
Invalid PORT "abc": expected an integer between 1024 and 65535, for example PORT=3000.
```

```bash
echo $?
```

```
1
```

The message names the value that was refused, the range it should have fallen in, and an example. Nothing binds, so no port is left half-open.

### When the port is already in use

If a server is already listening on 3000 - because you left one running in another terminal, for instance - a second one fails with an explanation instead of a stack trace, and exits with status `1`:

```bash
node server.js
```

```
Cannot start the server: port 3000 is already in use (EADDRINUSE). Stop the process using that port, or start on another one, for example: PORT=3001 node server.js
```

Either stop the first server with CTRL+C, or start on a free port:

```bash
PORT=3001 node server.js
```

Any other failure to bind is reported in the same shape, with the runtime's own error code and message:

```
Cannot start the server on port 3000: <code> <message>. Choose a free port between 1024 and 65535, for example: PORT=3001 node server.js
```

Here `<code>` and `<message>` stand in for the runtime's own values for that failure. Node's message already repeats the code and names the system call and the address it could not bind, so the same code appears twice in the line: a failed listen reads something shaped `listen <CODE>: <description> <address>:<port>`, and the exact wording varies between Node.js versions. You do not have to predict it: the line prints in your terminal when the failure happens.
