# Multi-Domain Web Stack — Runbook

One Astro template → many domains → served by a single Caddy container on your
Hostinger VPS, deployed from GitHub. Each domain gets a live HTTPS site, domain
email forwarding into Gmail, and Google Search Console verification.

Infra this is built for: **Hostinger VPS `srv1569293.hstgr.cloud`**, Docker
Manager, GitHub connected.

Currently configured: **1 domain** (`adminruhulamin.co.uk`, status `live`).
Add the rest to `config/domains.json` — everything else is automatic.

---

## Layout

```
stack/
  config/domains.json      <- SINGLE source of truth: VPS, email, every domain + its content
  site/                    <- shared Astro template (DOMAIN env picks which site)
  build-all.mjs            <- builds every domain into site/dist/<domain>
  Dockerfile               <- stage 1 build all sites, stage 2 serve with Caddy
  docker-compose.yml       <- what Hostinger Docker Manager runs
  caddy/Caddyfile          <- AUTO-GENERATED, do not hand-edit
  scripts/
    gen-caddy.mjs          <- regenerate Caddyfile from config
    add-domain.mjs         <- scaffold a new domain entry
    cf-setup.mjs           <- Cloudflare: DNS + Email Routing + GSC record
  .github/workflows/       <- CI (build check) + Deploy (Hostinger redeploy)
```

**Design:** the sites are static, so one small container serves all 8 with
near-zero RAM. Content is data (`config/domains.json`), not code — you fill in
copy later without touching a single template.

---

## First-time setup (once)

### 1. Push this to GitHub

```bash
cd stack
git init && git add . && git commit -m "Multi-domain stack"
git branch -M main
git remote add origin git@github.com:YOURNAME/ruhul-sites.git
git push -u origin main
```

### 2. Deploy on Hostinger

Hostinger hPanel → VPS → **Docker Manager** → **Create project** → point it at
this GitHub repo (it reads `docker-compose.yml`). It builds the image and starts
the `ruhul-sites` container on ports 80/443.

> You already have an `adminruhulamin` project running. Either replace it with
> this multi-site project, or keep it — but only ONE container can hold ports
> 80/443. This stack is designed to be the single one.

### 3. Cloudflare — DNS + email (per domain)

```bash
export CF_API_TOKEN='your-token'
node scripts/cf-setup.mjs adminruhulamin.co.uk --dry-run   # preview
node scripts/cf-setup.mjs adminruhulamin.co.uk             # apply
```

Creates proxied `A` records → your VPS, enables Email Routing (adds MX/SPF),
and forwards `info@ admin@ support@ hello@` + catch-all to your Gmail.

**API token scopes** (Cloudflare → My Profile → API Tokens → Custom token):
Zone·Read, DNS·Edit, Email Routing Rules·Edit, all zones.

### 4. Two manual clicks that have no API

1. **Verify the email destination.** Cloudflare emails
   `ruhulsedu001@gmail.com` a confirmation link. Until you click it, **no mail is
   delivered.** This is the #1 cause of "email isn't working."
2. **SSL mode → Full (strict).** Cloudflare → domain → SSL/TLS → Overview.

   | Mode | Result |
   |---|---|
   | Flexible | `ERR_TOO_MANY_REDIRECTS` — redirect loop |
   | **Full (strict)** | **Correct** — Caddy serves a real Let's Encrypt cert |

---

## Adding a domain (the whole point)

```bash
node scripts/add-domain.mjs example.co.uk "Example Brand" "#7c3aed"
# edit config/domains.json — replace every "TODO"
node scripts/gen-caddy.mjs          # already run by add-domain, but safe to repeat
git commit -am "Add example.co.uk" && git push   # CI builds, Hostinger redeploys
node scripts/cf-setup.mjs example.co.uk           # DNS + email
# then: SSL Full(strict) + verify email destination (destination is one-time only)
```

Under two minutes per domain after the first.

---

## Google Search Console (per domain)

1. <https://search.google.com/search-console> → Add property → **Domain**
   (covers www + non-www + http + https in one).
2. Copy the `google-site-verification=...` TXT value.
3. Add it and re-run:

```bash
export GSC_TXT='google-site-verification=xxxx'
node scripts/cf-setup.mjs example.co.uk
```

4. Click **Verify** in GSC, then **Sitemaps** → submit `sitemap-index.xml`.
5. Paste the value into `config/domains.json` → `gscVerification` so the
   meta-tag fallback ships too.

---

## Replying *from* your domain in Gmail

**Cloudflare Email Routing is receive-only — no outbound SMTP.** So `info@` can
receive but can't send. Add a free relay:

| Service | Free tier |
|---|---|
| **Brevo** | 300 emails/day |
| **Resend** | 3,000/month |
| **Zoho Mail** | Full mailbox, 1 domain |

Then Gmail → Settings → Accounts → *Send mail as* → add the address via the
relay's SMTP (port 587). Add the relay's SPF/DKIM in Cloudflare DNS or replies
land in spam.

---

## Local development

```bash
cd site
npm install
DOMAIN=adminruhulamin.co.uk npm run dev      # preview one site at localhost:4321
node ../build-all.mjs                         # build every site
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_TOO_MANY_REDIRECTS` | SSL = Flexible | Set Full (strict) |
| Site loads, no email | Destination not verified | Click Cloudflare's Gmail link |
| Replies go to spam | No SPF/DKIM for relay | Add relay DNS records |
| GSC "verification failed" | DNS not propagated | Wait 5–10 min, retry |
| 502 from Cloudflare | Container down | Docker Manager → logs |
| CI fails on "Caddyfile stale" | Forgot to regenerate | `node scripts/gen-caddy.mjs` + commit |

---

## Notes

- **Never commit `node_modules/`** — `.gitignore` and `.dockerignore` cover it.
- Certs persist in the `caddy_data` volume across rebuilds — no Let's Encrypt
  rate-limit surprises.
- `config/domains.json` is the only file you routinely touch. Templates,
  Docker, and Caddy all read from it.
