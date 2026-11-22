#!/usr/bin/env node
// Live TLS check for wiremark.net (wiremark/ops#23).
//
// On 2026-11-22 the apex served GitHub's *.github.io certificate after the
// apex and www moved to DNS-only, and nothing noticed. This check connects to
// every IPv4 address of each host with SNI and fails when the certificate
// does not cover the host, is not trusted, or expires within --min-days
// (default 14).
//
// Usage:
//   node scripts/check-tls.mjs [--min-days N] [host ...]   default: the CNAME
//                                                          host and www.<host>
//   node scripts/check-tls.mjs --self-test                 offline rule tests
//
// Plain Node, no dependencies. Exit 0 healthy, 1 a host failed, 2 usage error.

import dns from 'node:dns/promises';
import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 15000;

// Decide whether one presented certificate is acceptable for host.
// cert: { subjectaltname, subject, valid_to } as node:tls returns it;
// trustError: the chain verification error, or null when trusted.
export function evaluate(host, cert, trustError, now, minDays) {
  const problems = [];
  if (!cert || !cert.valid_to) return { ok: false, problems: ['no certificate presented'] };
  const mismatch = tls.checkServerIdentity(host, cert);
  if (mismatch) problems.push('does not cover ' + host + ' (' + (cert.subjectaltname || 'no SAN') + ')');
  if (trustError) problems.push('not trusted: ' + trustError);
  const expires = new Date(cert.valid_to);
  if (Number.isNaN(expires.getTime())) {
    problems.push('unreadable expiry ' + cert.valid_to);
  } else {
    const days = Math.floor((expires.getTime() - now.getTime()) / DAY_MS);
    if (days < minDays) problems.push('expires in ' + days + ' days (' + expires.toISOString().slice(0, 10) + '), minimum ' + minDays);
  }
  return { ok: problems.length === 0, problems };
}

function fetchCert(host, address) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: address, port: 443, servername: host, rejectUnauthorized: false, timeout: TIMEOUT_MS });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      const trustError = socket.authorized ? null : String(socket.authorizationError || 'unknown');
      socket.end();
      resolve({ cert, trustError });
    });
    socket.once('timeout', () => { socket.destroy(); reject(new Error('timed out after ' + TIMEOUT_MS + ' ms')); });
    socket.once('error', reject);
  });
}

async function checkHost(host, minDays, now) {
  let addresses;
  try { addresses = await dns.resolve4(host); }
  catch (err) { return [{ host, address: '-', ok: false, problems: ['DNS A lookup failed: ' + (err.code || err.message)] }]; }
  const results = [];
  for (const address of addresses.sort()) {
    try {
      const { cert, trustError } = await fetchCert(host, address);
      const verdict = evaluate(host, cert, trustError, now, minDays);
      results.push({ host, address, subject: cert && cert.subject ? cert.subject.CN : '?', validTo: cert && cert.valid_to, ...verdict });
    } catch (err) {
      results.push({ host, address, ok: false, problems: ['TLS connect failed: ' + (err.code || err.message)] });
    }
  }
  return results;
}

function selfTest() {
  const now = new Date('2026-11-22T12:00:00Z');
  const good = { subject: { CN: 'wiremark.net' }, subjectaltname: 'DNS:wiremark.net, DNS:www.wiremark.net', valid_to: 'Feb 20 13:39:37 2027 GMT' };
  const githubIo = { subject: { CN: '*.github.io' }, subjectaltname: 'DNS:*.github.io, DNS:github.io, DNS:*.githubusercontent.com', valid_to: 'Dec 29 23:44:45 2026 GMT' };
  const cases = [
    ['apex covered', 'wiremark.net', good, null, true],
    ['www covered', 'www.wiremark.net', good, null, true],
    ['github.io certificate on apex', 'wiremark.net', githubIo, null, false],
    ['expires within 14 days', 'wiremark.net', { ...good, valid_to: 'Dec 1 00:00:00 2026 GMT' }, null, false],
    ['already expired', 'wiremark.net', { ...good, valid_to: 'Nov 1 00:00:00 2026 GMT' }, 'CERT_HAS_EXPIRED', false],
    ['untrusted chain', 'wiremark.net', good, 'SELF_SIGNED_CERT_IN_CHAIN', false],
    ['no certificate', 'wiremark.net', {}, null, false],
  ];
  let failed = 0;
  for (const [name, host, cert, trust, want] of cases) {
    const got = evaluate(host, cert, trust, now, 14);
    const pass = got.ok === want;
    if (!pass) failed++;
    console.log((pass ? 'ok    ' : 'FAIL  ') + name + (got.problems.length ? ' (' + got.problems.join('; ') + ')' : ''));
  }
  console.log('self-test: ' + cases.length + ' cases, ' + failed + ' failed');
  return failed ? 1 : 0;
}

async function main(argv) {
  if (argv[0] === '--self-test') return selfTest();
  if (argv[0] === '-h' || argv[0] === '--help') { console.log('usage: check-tls.mjs [--min-days N] [host ...] | --self-test'); return 0; }
  let minDays = 14;
  const hosts = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-days') {
      minDays = Number(argv[++i]);
      if (!Number.isInteger(minDays) || minDays < 0) { console.error('check-tls: --min-days needs a whole number'); return 2; }
    } else hosts.push(argv[i]);
  }
  if (!hosts.length) {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const apex = fs.readFileSync(path.join(root, 'CNAME'), 'utf8').trim();
    if (!apex) { console.error('check-tls: CNAME is empty and no host was given'); return 2; }
    hosts.push(apex, 'www.' + apex);
  }
  const now = new Date();
  let failed = 0;
  for (const host of hosts) {
    for (const r of await checkHost(host, minDays, now)) {
      console.log((r.ok ? 'ok    ' : 'FAIL  ') + r.host + ' @ ' + r.address +
        (r.subject ? '  CN=' + r.subject : '') + (r.validTo ? '  expires ' + r.validTo : '') +
        (r.problems.length ? '  ' + r.problems.join('; ') : ''));
      if (!r.ok) failed++;
    }
  }
  console.log('check-tls: ' + hosts.join(', ') + ': ' + (failed ? failed + ' failed' : 'all ok') + ' (minimum ' + minDays + ' days)');
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; })
    .catch(err => { console.error('check-tls: ' + ((err && err.stack) || err)); process.exitCode = 2; });
}
