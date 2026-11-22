#!/usr/bin/env node
// Public-surface gate for wiremark.net (wiremark/ops#21).
//
// wiremark.net is the only public Wiremark surface: a static site about the
// product's features. Every Wiremark app is reachable only over our private
// network (Ziti). This gate fails when the published files contain anything a
// feature site must not:
//
//   password-input   an <input type="password">
//   form             any <form> (a static feature site posts nowhere)
//   internal-host    internal hostnames or cluster names
//   price            currency amounts or billing periods (/mo, per month, ...)
//   app-link-note    a link to app.wiremark.net without the private-network
//                    note ("private network") right next to it
//   subdomain-link   any *.wiremark.net name other than app.wiremark.net
//
// Usage:
//   node scripts/check-public-surface.mjs [dir]   scan dir (default _site)
//   node scripts/check-public-surface.mjs --self-test
//       run the rules against tests/public-surface/: every bad-<rule>*.html
//       must trip <rule>, every good*.html must pass.
//
// Plain Node, no dependencies. Exit 0 clean, 1 violations, 2 usage/IO error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXT = new Set(['.html', '.htm', '.xml', '.txt', '.css', '.js', '.mjs', '.json', '.svg', '.webmanifest', '']);
const HTML_EXT = new Set(['.html', '.htm']);
const NOTE_WINDOW = 300; // characters around an app link that must hold the note

// Internal hostnames and cluster names. Prose such as "our private network
// (Ziti)" is allowed; a Ziti hostname is not.
const INTERNAL_HOSTS = [
  /focuscell\.org/i,
  /focuspass\.com/i,
  /developerdojo\.org/i,
  /\b[a-z0-9-]+\.ziti\b/i,                // service.ziti, app.wiremark.ziti
  /\bziti[a-z0-9-]*\.[a-z][a-z0-9-]*\./i, // ziti-controller.example.org
  /\bbuck-lab\b/i,                        // cluster context
  /\bomlab\b/i,
  /\btalos-[a-z0-9-]+/i,                  // cluster node names
  /\.svc\.cluster\.local\b/i,
  /\bhhw-[a-z0-9]{6,}\b/i,                // agent hosts
];

const PRICE = [
  /[$€£¥]\s?\d/,                                   // $19, € 9
  /\b\d+(?:[.,]\d+)?\s?(?:USD|EUR|GBP|dollars?|euros?)\b/i,
  /\/\s?(?:mo|month|yr|year|user|seat)\b/i,        // /mo, /user/mo, / year
  /\bper\s+(?:month|year|user|seat)\b/i,
  /\bbilled\s+(?:monthly|annually|yearly)\b/i,
];

const SUBDOMAIN = /\b((?:[a-z0-9-]+\.)+)wiremark\.net\b/gi;
const APP_HREF = /<a\b[^>]*\bhref\s*=\s*["']?https?:\/\/app\.wiremark\.net[^>]*>/gi;

function lineOf(text, index) {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
function excerpt(text, index, len = 90) {
  return text.slice(Math.max(0, index - 20), index + len).replace(/\s+/g, ' ').trim();
}
const blank = m => m.replace(/[^\n]/g, ' '); // keep line numbers stable

// Drop executable scripts, styles and comments (vendored JS uses "$1"
// replacement tokens) but keep JSON-LD, which search engines read as content.
function pageContent(html) {
  return html
    .replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, blank)
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, blank)
    .replace(/<!--[\s\S]*?-->/g, blank);
}

export function scanText(rel, text) {
  const ext = path.extname(rel).toLowerCase();
  const found = [];
  const add = (rule, idx, msg) => found.push({ file: rel, line: lineOf(text, idx), rule, msg: msg || excerpt(text, idx) });

  for (const re of INTERNAL_HOSTS) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags + 'g'))) add('internal-host', m.index, m[0]);
  }
  for (const m of text.matchAll(SUBDOMAIN)) {
    const host = (m[1] + 'wiremark.net').toLowerCase();
    if (host !== 'app.wiremark.net') add('subdomain-link', m.index, host);
  }

  if (!HTML_EXT.has(ext)) return found;
  const html = pageContent(text);

  for (const m of html.matchAll(/<input\b[^>]*\btype\s*=\s*["']?password\b[^>]*>/gi)) add('password-input', m.index);
  for (const m of html.matchAll(/<form\b[^>]*>/gi)) add('form', m.index);
  for (const m of html.matchAll(/\bformaction\s*=/gi)) add('form', m.index);
  for (const re of PRICE) {
    for (const m of html.matchAll(new RegExp(re.source, re.flags + 'g'))) add('price', m.index);
  }
  for (const m of html.matchAll(APP_HREF)) {
    const close = html.indexOf('</a>', m.index);
    const end = close < 0 ? m.index + m[0].length : close + 4;
    const around = html.slice(Math.max(0, m.index - NOTE_WINDOW), end + NOTE_WINDOW).replace(/<[^>]+>/g, ' ');
    if (!/private\s+network/i.test(around)) {
      add('app-link-note', m.index, 'link to app.wiremark.net without a "private network" note within ' + NOTE_WINDOW + ' characters');
    }
  }
  return found;
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile()) out.push(p);
  }
  return out;
}

export function scanDir(dir) {
  const violations = [];
  let scanned = 0;
  for (const p of walk(dir)) {
    if (!TEXT_EXT.has(path.extname(p).toLowerCase())) continue;
    scanned++;
    violations.push(...scanText(path.relative(dir, p), fs.readFileSync(p, 'utf8')));
  }
  return { scanned, violations };
}

function report(violations) {
  for (const v of violations) console.log(v.file + ':' + v.line + '  ' + v.rule + '  ' + v.msg);
}

function selfTest(root) {
  const dir = path.join(root, 'tests', 'public-surface');
  if (!fs.existsSync(dir)) { console.error('self-test: missing ' + dir); return 2; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort();
  let failed = 0;
  for (const f of files) {
    const got = scanText(f, fs.readFileSync(path.join(dir, f), 'utf8'));
    const want = /^bad-([a-z-]+?)(?:-\d+)?\.html$/.exec(f);
    if (want) {
      const hit = got.some(v => v.rule === want[1]);
      console.log((hit ? 'ok    ' : 'FAIL  ') + f + ' must trip ' + want[1] +
        (hit ? '' : ' (got: ' + (got.map(v => v.rule).join(', ') || 'nothing') + ')'));
      if (!hit) failed++;
    } else if (/^good/.test(f)) {
      console.log((got.length ? 'FAIL  ' : 'ok    ') + f + ' must pass');
      if (got.length) { report(got); failed++; }
    } else {
      console.log('FAIL  ' + f + ' is neither bad-<rule>.html nor good*.html');
      failed++;
    }
  }
  console.log('self-test: ' + files.length + ' fixtures, ' + failed + ' failed');
  return failed ? 1 : 0;
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (argv[0] === '--self-test') return selfTest(root);
  if (argv[0] === '-h' || argv[0] === '--help') { console.log('usage: check-public-surface.mjs [dir] | --self-test'); return 0; }
  const dir = path.resolve(argv[0] || '_site');
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error('check-public-surface: ' + dir + ' is not a directory (run sh scripts/build-site.sh first)');
    return 2;
  }
  const { scanned, violations } = scanDir(dir);
  report(violations);
  const byRule = {};
  for (const v of violations) byRule[v.rule] = (byRule[v.rule] || 0) + 1;
  console.log('check-public-surface: ' + scanned + ' files scanned, ' + violations.length + ' violations' +
    (violations.length ? ' ' + JSON.stringify(byRule) : ''));
  return violations.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (err) { console.error('check-public-surface: ' + ((err && err.stack) || err)); process.exitCode = 2; }
}
