import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads config/domains.json and returns the entry for process.env.DOMAIN,
 * filled out with safe defaults so a half-written domain still builds.
 *
 * NOTE: resolve against process.cwd(), NOT import.meta.url. During `astro build`
 * the SSR entrypoint is emitted into dist/, so import.meta.url points at dist/
 * and the relative path breaks in the "generating static routes" phase.
 * cwd is stable because deploy always builds from site/.
 */
const candidates = [
  resolve(process.cwd(), '../config/domains.json'), // building from site/
  resolve(process.cwd(), 'config/domains.json'),    // building from stack/
];

const configPath = candidates.find((p) => existsSync(p));
if (!configPath) {
  throw new Error(
    `config/domains.json not found. Looked in:\n  ${candidates.join('\n  ')}\n` +
    `cwd is ${process.cwd()} — run the build from the site/ directory.`
  );
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));

const domain = process.env.DOMAIN;
const raw = config.domains.find((d) => d.domain === domain);

if (!raw) {
  throw new Error(
    `Domain "${domain}" not found in config/domains.json.\n` +
    `Known: ${config.domains.map((d) => d.domain).join(', ') || '(none)'}`
  );
}

const defaults = config.defaults ?? {};

// Fill missing pieces so the template never crashes on a partial config.
export const siteData = {
  domain: raw.domain,
  brand: raw.brand ?? raw.domain,
  primaryColor: raw.primaryColor ?? '#1d4ed8',
  accentColor: raw.accentColor ?? raw.primaryColor ?? '#0ea5e9',
  status: raw.status ?? 'draft',
  locale: raw.locale ?? defaults.locale ?? 'en-GB',
  author: raw.author ?? defaults.author ?? raw.brand ?? raw.domain,
  hero: raw.hero ?? {
    eyebrow: '',
    title: raw.brand ?? raw.domain,
    subtitle: raw.seo?.description ?? '',
    primaryCta: { label: 'Get in touch', href: '/contact/' },
    secondaryCta: null,
  },
  features: raw.features ?? [],
  services: raw.services ?? [],
  about: raw.about ?? null,
  cta: raw.cta ?? null,
  seo: {
    description: raw.seo?.description ?? '',
    keywords: raw.seo?.keywords ?? [],
  },
  gscVerification: raw.gscVerification ?? '',
};

export const emailConfig = config.email;
export const contactEmail = `${config.email.addresses[0]}@${domain}`;
export const allAddresses = config.email.addresses.map((a) => `${a}@${domain}`);
