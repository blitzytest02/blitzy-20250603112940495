/**
 * The automated proof that the one endpoint answers what it promises.
 *
 * Everything this suite needs is already in Node.js. `node:test` is the test
 * runner built into the runtime and `node:assert/strict` is its assertion
 * library, so nothing was installed to make these tests run and the project
 * has no test configuration file at all. `npm test` runs `node --test`, which
 * finds this file by itself because the name ends in `.test.js`.
 *
 * The suite starts a server of its own rather than talking to one you started
 * by hand, so `npm test` behaves the same whether or not `npm start` is
 * running in another terminal.
 */

import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Also built into Node.js, and needed for the two kinds of request `fetch`
// cannot make: one whose target has to arrive exactly as written, and one
// using the `CONNECT` method. `connect` here opens a plain TCP connection —
// see `sendRawRequest` below.
import { connect } from 'node:net';

// The only project file this suite imports. Under ES modules a relative import
// must name the file extension: `../src/server` does not resolve,
// `../src/server.js` does.
import { createHelloServer } from '../src/server.js';

// `createHelloServer()` hands back a server that is fully wired but not
// listening yet, and that is precisely what makes it testable: this file gets
// to choose the port it binds, and to close it again when the tests are done.
// The project's entry point is deliberately not imported here — it exports
// nothing, and loading it would start a server on the application's own
// configured port.
const server = createHelloServer();

// The address to send requests to, and the port inside it, both filled in by
// the `before` hook below once the operating system has chosen one.
let baseUrl;
let port;

before(async () => {
  // Port `0` is not a port: it asks the operating system for any free one,
  // which it then picks and assigns. `server.address()` reads back the port it
  // gave us. This is why the suite can never collide with a development server
  // already running — it never asks for a fixed port, so there is no port for
  // the two to argue over.
  //
  // `listen` reports that it has finished through a callback rather than a
  // promise, so it is wrapped in one here for the hook to `await`.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  // A listening server keeps its process alive, so handing the port back is
  // what allows the test run to end rather than sit there waiting. Each test
  // below reads its response body to completion for the same reason: `fetch`
  // reuses connections, and a body left unread can keep a socket busy and
  // delay this close.
  await new Promise((resolve) => server.close(resolve));
});

/**
 * Sends one request line over a plain TCP connection and reads the whole reply
 * back as text.
 *
 * `fetch` is the right tool for an ordinary request, but it cannot express the
 * two kinds below: it tidies a URL up before sending it, so a target such as
 * `/a/../hello` never leaves the client as written, and it has no way to send
 * the `CONNECT` method at all. A raw socket sends exactly the bytes given,
 * which is how an odd or hostile request actually arrives.
 *
 * @param {string} requestLine The method and target, e.g. `'GET //'`. The
 *   HTTP version, the `Host` header and the blank line are added here.
 * @returns {Promise<{statusLine: string, headers: Map<string, string>,
 *   body: string}>} The parsed reply.
 */
function sendRawRequest(requestLine) {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.end(
        `${requestLine} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n` +
          'Connection: close\r\n\r\n'
      );
    });

    let received = '';
    let failure = null;

    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      received += chunk;
    });
    socket.on('error', (error) => {
      failure = error;
    });
    socket.on('close', () => {
      // A server that answers and then closes is the expected case. One that
      // closes without a complete answer — which is what a dropped connection
      // or a crashed process looks like from out here — is reported rather
      // than smoothed over, so the tests below cannot pass on silence.
      if (!received.includes('\r\n\r\n')) {
        reject(
          failure ?? new Error(`No complete response to: ${requestLine}`)
        );
        return;
      }

      resolve(parseRawResponse(received));
    });
  });
}

/**
 * Splits a raw HTTP reply into the three parts the assertions need: the status
 * line, the headers, and the body. A blank line separates the head from the
 * body, and each header is a name, a colon and a value.
 *
 * @param {string} raw The reply exactly as it came off the socket.
 * @returns {{statusLine: string, headers: Map<string, string>, body: string}}
 */
function parseRawResponse(raw) {
  const separator = raw.indexOf('\r\n\r\n');
  const [statusLine, ...headerLines] = raw.slice(0, separator).split('\r\n');
  const headers = new Map(
    headerLines.map((line) => {
      const colon = line.indexOf(':');
      // Header names are matched case-insensitively, so they are lowercased
      // here and read the same way `response.headers.get(...)` reads them in
      // the `fetch` tests.
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    })
  );

  return { statusLine, headers, body: raw.slice(separator + 4) };
}

describe('GET /hello', () => {
  it('answers 200 with the exact text Hello world as plain text', async () => {
    // `fetch` needs no import — it is a global in modern Node.js, the same
    // function a browser gives you.
    const response = await fetch(`${baseUrl}/hello`);
    const body = await response.text();

    // A status is a number, but header values always arrive as strings, so the
    // length below is compared against `'11'` rather than `11`: strict
    // assertions do not treat those as equal.
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '11');

    // The expected text is written out here instead of being imported from
    // `src/hello.js`. That is the whole point of the assertion: this test
    // guards the contract, so editing the constant in the source has to break
    // this line rather than quietly redefine what the endpoint may return.
    assert.equal(body, 'Hello world');

    // Eleven bytes is the text and nothing else; a trailing newline would make
    // it twelve, so this line pins the body down to the character.
    assert.equal(Buffer.byteLength(body), 11);
  });

  it('serves the trailing-slash form /hello/ as the same route', async () => {
    const response = await fetch(`${baseUrl}/hello/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, 'Hello world');
  });

  it('ignores a query string and serves the same route', async () => {
    // The dispatcher matches the target with everything from the first `?`
    // onwards removed, so a query string is neither read nor in the way.
    const response = await fetch(`${baseUrl}/hello?name=x`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.equal(body, 'Hello world');
  });
});

describe('HEAD /hello', () => {
  it('repeats the GET status and headers with an empty body', async () => {
    const response = await fetch(`${baseUrl}/hello`, { method: 'HEAD' });
    const body = await response.text();

    // `HEAD` asks for the headers a `GET` would send, without the body. The
    // handler has no `HEAD` branch: Node.js keeps the status and headers and
    // discards the body it wrote. That is behaviour of the runtime rather than
    // of this project's code, which is exactly why it is asserted instead of
    // assumed.
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '11');
    assert.equal(body, '');
  });
});

describe('requests this service does not serve', () => {
  it('answers 404 Not Found for a path other than /hello', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    const body = await response.text();

    assert.equal(response.status, 404);
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '9');
    assert.equal(body, 'Not Found');
  });

  it('answers 405 on /hello for a method other than GET or HEAD', async () => {
    const response = await fetch(`${baseUrl}/hello`, { method: 'POST' });
    const body = await response.text();

    // A `405` is expected to name the methods that do belong on the path, and
    // `Allow` is the header that carries them.
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '18');
    assert.equal(body, 'Method Not Allowed');
  });

  it('answers 405 on /hello for a CONNECT request', async () => {
    // `CONNECT` asks a server to open a tunnel rather than serve a document,
    // so Node.js reports it on the server's own `connect` event and never
    // calls the ordinary request listener. A server that ignores that event
    // drops the connection and answers nothing, so this promise of a `405`
    // for every method other than `GET` and `HEAD` has to be proved for
    // `CONNECT` specifically — over a raw socket, because `fetch` cannot send
    // the method.
    const response = await sendRawRequest('CONNECT /hello');

    assert.equal(response.statusLine, 'HTTP/1.1 405 Method Not Allowed');
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '18');
    assert.equal(response.body, 'Method Not Allowed');
  });

  it('answers 404 for a CONNECT request to any other target', async () => {
    const response = await sendRawRequest('CONNECT /nope');

    assert.equal(response.statusLine, 'HTTP/1.1 404 Not Found');
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '9');
    assert.equal(response.body, 'Not Found');
  });
});

describe('request targets that only look like /hello', () => {
  it('answers 404 for an unparseable target and keeps serving', async () => {
    // `//` promises a host and then names none, so it is not a valid address:
    // `new URL('//', base)` throws a `TypeError`. A dispatcher that parses the
    // target that way answers this request with a crashed process rather than
    // a reply, which is why both halves are asserted here — the `404`, and a
    // still-working endpoint afterwards.
    const response = await sendRawRequest('GET //');

    assert.equal(response.statusLine, 'HTTP/1.1 404 Not Found');
    assert.equal(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8'
    );
    assert.equal(response.headers.get('content-length'), '9');
    assert.equal(response.body, 'Not Found');

    const afterwards = await fetch(`${baseUrl}/hello`);
    assert.equal(afterwards.status, 200);
    assert.equal(await afterwards.text(), 'Hello world');
  });

  // Every target below resolves to the pathname `/hello` once a URL parser has
  // normalised it — the first one on a different host altogether — so a
  // dispatcher routing on the parsed pathname would serve all four under paths
  // this service never advertised. Only the two raw spellings it does
  // advertise are served. They are sent over a raw socket because `fetch`
  // would normalise them away before they ever left the client.
  for (const target of [
    '//example.test/hello',
    '/a/../hello',
    '/%2e/hello',
    '/hello/%2e%2e/hello',
  ]) {
    it(`answers 404 for the noncanonical target ${target}`, async () => {
      const response = await sendRawRequest(`GET ${target}`);

      assert.equal(response.statusLine, 'HTTP/1.1 404 Not Found');
      assert.equal(
        response.headers.get('content-type'),
        'text/plain; charset=utf-8'
      );
      assert.equal(response.headers.get('content-length'), '9');
      assert.equal(response.body, 'Not Found');
    });
  }
});
