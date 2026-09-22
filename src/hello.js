/**
 * The route handler: what `GET /hello` actually returns.
 *
 * This file teaches the one job every Node.js HTTP handler has. Node's
 * built-in `node:http` module calls a handler once per request and hands it
 * two objects: the request (`req`) and the response (`res`). The handler's
 * work is to write a complete response into `res`.
 *
 * Notice there are no imports here. `req` and `res` arrive as arguments, and
 * `Buffer` is a Node.js global, so this module depends on nothing at all.
 */

/**
 * The exact text this service returns, kept as a named constant so the one
 * value the whole project exists to send has a single, obvious home.
 *
 * There is deliberately no trailing newline, which is why the body is exactly
 * 11 bytes. The test suite asserts the literal `'Hello world'` rather than
 * importing this constant, so editing the text here fails the tests instead of
 * quietly redefining the contract.
 *
 * @type {string}
 */
export const HELLO_BODY = 'Hello world';

/**
 * Writes the complete `200 OK` response for the `/hello` endpoint: status,
 * headers and body, with the response finished before it returns. Nothing
 * further happens for that request.
 *
 * @param {import('node:http').IncomingMessage} req The incoming request Node
 *   created: a readable stream carrying the method, URL and headers. This
 *   endpoint reads nothing from it, so a caller needs no header, parameter or
 *   request body; `req` stays in the signature because `(req, res)` is the
 *   shape `node:http` calls a handler with, and they are the same two objects
 *   a framework such as Express would pass you.
 * @param {import('node:http').ServerResponse} res The response to write: a
 *   writable stream back to the client.
 * @returns {void}
 */
export function handleHello(req, res) {
  // An HTTP response travels in order: status line, then headers, then body.
  // So the status and headers have to go out before anything is written to the
  // body, and `writeHead` sets both in one call.
  //
  // `Content-Length` is stated explicitly rather than left to Node. When Node
  // is not told how long a response is, it frames the body with chunked
  // transfer encoding; supplying the length removes that framing. That keeps
  // the response bytes predictable, so `curl -i` prints exactly the headers
  // the README quotes, and it gives the tests a header to assert.
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(HELLO_BODY),
  });

  // `res` is a stream, and `end` writes this last piece of data and then
  // closes the response, which is the point at which the client receives it.
  // No `HEAD` branch is needed: on a `HEAD` request Node keeps the status and
  // headers and discards the body, so this single handler serves `GET` and
  // `HEAD` identically.
  res.end(HELLO_BODY);
}
