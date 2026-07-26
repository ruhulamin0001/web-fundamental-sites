#!/usr/bin/env node
/**
 * Scaffold a new domain entry in config/domains.json, then regenerate the
 * Caddyfile. Fill in the real copy afterwards — this just gets the structure in.
 *
 *   node scripts/add-domain.mjs example.co.uk "Example Brand" "#7c3aed"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const [domain, brand, color] = process.argv.slice(2);
if (!domain) {
  console.error('Usage: node scripts/add-domain.mjs <domain> [brand] [#hexcolor]');
  process.exit(1);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const path = root + 'config/domains.json';
const config = JSON.parse(readFileSync(path, 'utf8'));

if (config.domains.some((d) => d.domain === domain)) {
  console.error(`"${domain}" already exists in config.`);
  process.exit(1);
}

const name = brand || domain.split('.')[0];
config.domains.push({
  domain,
  brand: name,
  primaryColor: color || '#1d4ed8',
  accentColor: '#0ea5e9',
  status: 'draft',
  hero: {
    eyebrow: 'TODO tagline',
    title: `${name} — one-line promise here`,
    subtitle: 'TODO: two sentences on what this site is for and who it helps.',
    primaryCta: { label: 'Get in touch', href: '/contact/' },
    secondaryCta: { label: 'Learn more', href: '#services' },
  },
  features: [
    { icon: 'spark', title: 'TODO', body: 'TODO' },
    { icon: 'shield', title: 'TODO', body: 'TODO' },
    { icon: 'flow', title: 'TODO', body: 'TODO' },
  ],
  services: [{ title: 'TODO', body: 'TODO' }],
  about: { title: 'About', body: 'TODO' },
  cta: { title: 'TODO', body: 'TODO', button: { label: 'Email us', href: `mailto:info@${domain}` } },
  seo: { description: `TODO meta description for ${name}.`, keywords: [] },
  gscVerification: '',
});

writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log(`Added ${domain}. Now edit config/domains.json (search "TODO").`);
execSync('node scripts/gen-caddy.mjs', { cwd: root, stdio: 'inherit' });
