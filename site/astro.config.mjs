import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// DOMAIN is injected by scripts/deploy-site.sh so one template serves every domain.
const domain = process.env.DOMAIN;
if (!domain) {
  throw new Error('DOMAIN env var is required. Run via ../scripts/deploy-site.sh <domain>');
}

export default defineConfig({
  site: `https://${domain}`,
  outDir: `./dist/${domain}`,
  integrations: [sitemap()],
  build: { inlineStylesheets: 'always' },
  compressHTML: true,
});
