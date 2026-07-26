#!/usr/bin/env node
/**
 * Cloudflare setup for one domain — DNS, Email Routing and the Google Search
 * Console verification record, in a single idempotent run.
 *
 *   export CF_API_TOKEN=...            # required
 *   export GSC_TXT="google-site-verification=..."   # optional, from GSC step
 *   node scripts/cf-setup.mjs adminruhulamin.co.uk
 *   node scripts/cf-setup.mjs adminruhulamin.co.uk --dry-run
 *
 * API token needs these permissions (Cloudflare -> My Profile -> API Tokens ->
 * Create Token -> Custom token):
 *   Zone / Zone        / Read
 *   Zone / DNS         / Edit
 *   Zone / Email Routing Rules / Edit
 *   Zone Resources: Include -> All zones
 *
 * Safe to re-run: every write checks for an existing record first.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const TOKEN = process.env.CF_API_TOKEN;
const GSC_TXT = process.env.GSC_TXT || '';
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const domain = args.find((a) => !a.startsWith('--'));

const c = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', b: '\x1b[34m', d: '\x1b[2m', x: '\x1b[0m' };
const ok = (m) => console.log(`${c.g}  ok${c.x}   ${m}`);
const skip = (m) => console.log(`${c.d}  skip${c.x} ${m}`);
const step = (m) => console.log(`\n${c.b}==>${c.x} ${m}`);
const warn = (m) => console.log(`${c.y}  warn${c.x} ${m}`);

function die(msg) {
  console.error(`${c.r}error${c.x} ${msg}`);
  process.exit(1);
}

if (!TOKEN) die('CF_API_TOKEN is not set.');
if (!domain) die('Usage: node scripts/cf-setup.mjs <domain> [--dry-run]');

const configPath = fileURLToPath(new URL('../config/domains.json', import.meta.url));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const site = config.domains.find((d) => d.domain === domain);
if (!site) die(`"${domain}" is not in config/domains.json`);

const VPS_IP = config.vps.ip;
if (!VPS_IP || VPS_IP.startsWith('REPLACE')) {
  die('Set the real VPS IP in config/domains.json -> vps.ip');
}

async function cf(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const detail = (body.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`${options.method || 'GET'} ${path} -> ${res.status} ${detail || res.statusText}`);
  }
  return body.result;
}

/* ------------------------------------------------------------------ zone */
step(`Looking up zone for ${domain}`);
const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`);
if (!zones.length) die(`Zone "${domain}" not found on this Cloudflare account.`);
const zone = zones[0];
ok(`zone ${zone.id} (status: ${zone.status})`);
if (zone.status !== 'active') {
  warn(`Zone is "${zone.status}" — nameservers may not have propagated yet.`);
}

/* ------------------------------------------------------------------- dns */
step('DNS records');
const existingDns = await cf(`/zones/${zone.id}/dns_records?per_page=200`);

async function upsertRecord(record) {
  const match = existingDns.find(
    (r) => r.type === record.type && r.name === record.name.replace(/^@$/, domain)
  );
  const label = `${record.type.padEnd(5)} ${record.name} -> ${record.content}`;

  if (match && match.content === record.content && match.proxied === record.proxied) {
    skip(`${label} (already correct)`);
    return;
  }
  if (DRY_RUN) {
    console.log(`${c.y}  would ${match ? 'update' : 'create'}${c.x} ${label}`);
    return;
  }
  if (match) {
    await cf(`/zones/${zone.id}/dns_records/${match.id}`, {
      method: 'PATCH',
      body: JSON.stringify(record),
    });
    ok(`updated ${label}`);
  } else {
    await cf(`/zones/${zone.id}/dns_records`, {
      method: 'POST',
      body: JSON.stringify(record),
    });
    ok(`created ${label}`);
  }
}

// Proxied A records: Cloudflare terminates TLS, Caddy holds a real LE cert on
// the origin, so SSL mode must be Full (strict).
await upsertRecord({ type: 'A', name: domain, content: VPS_IP, proxied: true, ttl: 1 });
await upsertRecord({ type: 'A', name: `www.${domain}`, content: VPS_IP, proxied: true, ttl: 1 });

if (GSC_TXT) {
  await upsertRecord({ type: 'TXT', name: domain, content: GSC_TXT, proxied: false, ttl: 1 });
} else {
  warn('GSC_TXT not set — skipping Google Search Console verification record.');
  warn('Get it from search.google.com/search-console -> Add property -> Domain.');
}

/* --------------------------------------------------------- email routing */
step('Email Routing');
let routingEnabled = false;
try {
  const settings = await cf(`/zones/${zone.id}/email/routing`);
  routingEnabled = settings.enabled === true;
  ok(`Email Routing status: ${settings.status || (routingEnabled ? 'enabled' : 'disabled')}`);
} catch {
  warn('Email Routing has never been initialised on this zone.');
}

if (!routingEnabled) {
  if (DRY_RUN) {
    console.log(`${c.y}  would enable${c.x} Email Routing (adds MX + SPF records)`);
  } else {
    await cf(`/zones/${zone.id}/email/routing/enable`, { method: 'POST' });
    ok('Email Routing enabled (MX + SPF records added automatically)');
  }
}

const forwardTo = config.email.forwardTo;
step(`Forwarding rules -> ${forwardTo}`);

// The destination address must be verified once, by clicking a link Cloudflare
// emails to it. Until then, rules exist but mail is not delivered.
try {
  const accountId = zone.account.id;
  const destinations = await cf(`/accounts/${accountId}/email/routing/addresses?per_page=100`);
  const dest = destinations.find((d) => d.email === forwardTo);
  if (!dest) {
    if (!DRY_RUN) {
      await cf(`/accounts/${accountId}/email/routing/addresses`, {
        method: 'POST',
        body: JSON.stringify({ email: forwardTo }),
      });
    }
    warn(`Verification email sent to ${forwardTo} — CLICK IT or nothing will be delivered.`);
  } else if (!dest.verified) {
    warn(`${forwardTo} is added but NOT VERIFIED. Check that inbox and click the link.`);
  } else {
    ok(`${forwardTo} is verified`);
  }
} catch (e) {
  warn(`Could not check destination address: ${e.message}`);
}

const existingRules = DRY_RUN ? [] : await cf(`/zones/${zone.id}/email/routing/rules?per_page=100`).catch(() => []);

for (const prefix of config.email.addresses) {
  const address = `${prefix}@${domain}`;
  const already = existingRules.some((r) =>
    (r.matchers || []).some((m) => m.type === 'literal' && m.value === address)
  );
  if (already) {
    skip(`${address}`);
    continue;
  }
  if (DRY_RUN) {
    console.log(`${c.y}  would create${c.x} ${address} -> ${forwardTo}`);
    continue;
  }
  await cf(`/zones/${zone.id}/email/routing/rules`, {
    method: 'POST',
    body: JSON.stringify({
      name: `Forward ${address}`,
      enabled: true,
      matchers: [{ type: 'literal', field: 'to', value: address }],
      actions: [{ type: 'forward', value: [forwardTo] }],
    }),
  });
  ok(`${address} -> ${forwardTo}`);
}

if (config.email.catchAll && !DRY_RUN) {
  await cf(`/zones/${zone.id}/email/routing/rules/catch_all`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Catch-all',
      enabled: true,
      matchers: [{ type: 'all' }],
      actions: [{ type: 'forward', value: [forwardTo] }],
    }),
  }).then(() => ok(`catch-all *@${domain} -> ${forwardTo}`))
    .catch((e) => warn(`catch-all failed: ${e.message}`));
}

/* ----------------------------------------------------------------- done */
console.log(`
${c.g}Cloudflare configured for ${domain}${c.x}

Manual steps that have no API:
  1. SSL/TLS -> Overview -> set encryption mode to ${c.y}Full (strict)${c.x}
     Anything else will cause a redirect loop.
  2. Verify ${forwardTo} by clicking Cloudflare's email (once per account only).
  3. Gmail -> Settings -> Accounts -> "Send mail as" to reply FROM your domain.
     Cloudflare does not do outbound SMTP — see README.md.
`);
