#!/usr/bin/env node
/**
 * Build every domain in config/domains.json into site/dist/<domain>.
 * Used inside the Docker build. Runs astro build once per domain.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const config = JSON.parse(readFileSync(new URL('./config/domains.json', import.meta.url), 'utf8'));
const domains = config.domains.map((d) => d.domain);

if (domains.length === 0) {
  console.error('No domains in config/domains.json');
  process.exit(1);
}

console.log(`Building ${domains.length} site(s): ${domains.join(', ')}\n`);

for (const domain of domains) {
  console.log(`\n=== ${domain} ===`);
  execSync('npx astro build', {
    cwd: new URL('./site', import.meta.url),
    stdio: 'inherit',
    env: { ...process.env, DOMAIN: domain },
  });
}
console.log('\nAll sites built.');
