import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseProxyHeader } from './parse-proxy-header.js';

const SSH_VERSION_LINE = Buffer.from('SSH-2.0-OpenSSH_9.9\r\n');

/** A v2 header as HAProxy's send-proxy-v2 writes it; IPv6 written out in full. */
function proxyV2(source: { address: string; port: number } | 'local'): Buffer {
  const signature = Buffer.from('\r\n\r\n\0\r\nQUIT\n', 'latin1');
  if (source === 'local') return Buffer.concat([signature, Buffer.from([0x20, 0x00, 0, 0])]);
  const isIpv6 = source.address.includes(':');
  const addressBytes = (address: string) =>
    isIpv6
      ? address.split(':').flatMap((group) => [parseInt(group, 16) >> 8, parseInt(group, 16) & 0xff])
      : address.split('.').map(Number);
  const ports = Buffer.alloc(4);
  ports.writeUInt16BE(source.port, 0);
  ports.writeUInt16BE(22, 2);
  const destination = isIpv6 ? '0:0:0:0:0:0:0:1' : '10.0.0.5';
  const addressBlock = Buffer.concat([
    Buffer.from([...addressBytes(source.address), ...addressBytes(destination)]),
    ports,
  ]);
  const fixedPart = Buffer.from([0x21, isIpv6 ? 0x21 : 0x11, 0, 0]);
  fixedPart.writeUInt16BE(addressBlock.length, 2);
  return Buffer.concat([signature, fixedPart, addressBlock]);
}

test('v2 PROXY gives the visitor address and where the SSH stream starts', () => {
  const header = proxyV2({ address: '203.0.113.7', port: 51234 });
  assert.deepEqual(parseProxyHeader(Buffer.concat([header, SSH_VERSION_LINE])), {
    kind: 'header',
    length: header.length,
    source: { address: '203.0.113.7', port: 51234 },
  });
});

test('v2 IPv6 addresses come out compressed, as Node reports them', () => {
  const header = proxyV2({ address: '2001:db8:0:0:0:0:0:1', port: 443 });
  const parsed = parseProxyHeader(header);
  assert.equal(parsed.kind === 'header' && parsed.source?.address, '2001:db8::1');
});

test('v2 LOCAL (a relay health check) is a header without a source', () => {
  assert.deepEqual(parseProxyHeader(proxyV2('local')), { kind: 'header', length: 16 });
});

test('v1 PROXY lines are understood too', () => {
  const line = 'PROXY TCP4 203.0.113.7 10.0.0.5 51234 22\r\n';
  assert.deepEqual(parseProxyHeader(Buffer.from(line + 'SSH-2.0-x\r\n')), {
    kind: 'header',
    length: line.length,
    source: { address: '203.0.113.7', port: 51234 },
  });
  assert.deepEqual(parseProxyHeader(Buffer.from('PROXY UNKNOWN\r\n')), { kind: 'header', length: 15 });
});

test('a header split across packets waits for the rest', () => {
  const header = proxyV2({ address: '203.0.113.7', port: 51234 });
  for (const cutAt of [1, 12, 15, header.length - 1]) {
    assert.deepEqual(parseProxyHeader(header.subarray(0, cutAt)), { kind: 'incomplete' }, `cut at ${cutAt}`);
  }
  assert.deepEqual(parseProxyHeader(Buffer.from('PROXY TCP4 203.0')), { kind: 'incomplete' });
});

test('anything else is invalid, so it cannot pass as a relayed connection', () => {
  const invalidInputs = [
    SSH_VERSION_LINE, // a client talking to the server directly
    Buffer.from('PROXY TCP4 not-an-ip 10.0.0.5 1 22\r\n'),
    Buffer.from('PROXY TCP4 203.0.113.7 10.0.0.5 99999 22\r\n'),
    Buffer.from(`PROXY ${'x'.repeat(200)}`),
  ];
  for (const invalidBytes of invalidInputs) {
    assert.equal(parseProxyHeader(invalidBytes).kind, 'invalid', invalidBytes.toString('latin1'));
  }
});
