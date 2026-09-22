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

// The address to send requests to, filled in by the `before` hook below once
// the operating system has chosen a port.
let baseUrl;

before(async () => {
  // Passing `0` as the port asks the operating system to assign an arbitrary
  // unused port, and `server.address()` reads back the one it assigned. This
  // is why the suite can never collide with a development server already
  // running — it never asks for a fixed port, so there is no port for the two
  // to argue over.
  //
  // `listen` reports that it has finished through a callback rather than a
  // promise, so it is wrapped in one here for the hook to `await`.
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  // A listening server keeps its process alive, so handing the port back is
  // what allows the test run to end rather than sit there waiting. Each test
  // below reads its response body to completion for the same reason: `fetch`
  // reuses connections, and a body left unread can keep a socket busy and
  // delay this close.
  await new Promise((resolve) => server.close(resolve));
});

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
    // The same four assertions are made over two unserved paths. `//x/hello`
    // is the second because it is three path segments — `''`, `'x'` and
    // `'hello'` — so it is simply a path this service does not serve, and the
    // dispatcher has to read it as the path it is rather than as a host
    // followed by `/hello`, which would reach the handler.
    for (const path of ['/nope', '//x/hello']) {
      const response = await fetch(`${baseUrl}${path}`);
      const body = await response.text();

      assert.equal(response.status, 404);
      assert.equal(
        response.headers.get('content-type'),
        'text/plain; charset=utf-8'
      );
      assert.equal(response.headers.get('content-length'), '9');
      assert.equal(body, 'Not Found');
    }
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
});
