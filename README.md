# ENSPEC All Energy 2026 Scanner

Offline-first business-card and conference-badge scanner for **All Energy 2026**.
It is a React, Vite and TypeScript PWA deployed with Cloudflare Pages. Staff can
capture cards during unreliable event Wi-Fi, review the extracted details, and
automatically save them to the same Odoo Mailing Contacts area used by Nathan's
existing `/allenergy` form.

## Architecture

```text
iPhone PWA
  |-- camera / badge scanner
  |-- IndexedDB offline queue
  |-- POST /api/extract -- Cloudflare Function -- Gemini
  `-- POST /api/sync ---- Cloudflare Function -- Odoo mailing.contact
```

Odoo and Gemini secrets live only in encrypted Cloudflare Pages settings. They
are never sent to the browser or stored in an Odoo Website Page.

## Local development

```bash
npm install
npm run dev
npm test
npm run build
```

Camera access and the service worker require HTTPS outside localhost. Use
Wrangler Pages development for local end-to-end work involving Pages Functions.

## Cloudflare configuration

Build settings:

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: empty

Encrypted variables and secrets:

- `GEMINI_API_KEY`
- `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` (optional)
- `ODOO_URL` - `https://enspec.odoo.com`
- `ODOO_DATABASE` - ENSPEC's Odoo database name
- `ODOO_USERNAME` - dedicated least-privilege scanner integration user
- `ODOO_API_KEY` - API key generated for that user
- `ODOO_MAILING_LIST_ID` - `5` for **All Energy 2026**
- `ODOO_EVENT_NAME` - optional; defaults to `All Energy 2026`
- `SCANNER_ALLOWED_ORIGIN` - final scanner origin, such as `https://cards.enspec.com`

Protect the production Pages application with Cloudflare Access for ENSPEC staff.

## Odoo destination

The existing website page at `/allenergy` remains Nathan's form and is not
created, edited or published by this project. The scanner writes server-side to:

- model: `mailing.contact`
- mailing list: **All Energy 2026** (id `5`)
- integration account: a dedicated user limited to the permissions required to
  search, create and update mailing contacts

The UTM campaign and unpublished `/all-energy-2026` shell created during the
earlier CRM prototype are not used by this integration and are left untouched.

## Odoo delivery

`POST /api/sync` validates the contact and requires its `Idempotency-Key` header
to match the local scan id. The server authenticates using encrypted Cloudflare
secrets, searches `mailing.contact` for a durable scanner marker, and then:

- creates a contact when that scan has never been delivered;
- updates the same contact after a retry or edit;
- assigns the contact to the All Energy 2026 mailing list;
- returns the confirmed Odoo contact id to the PWA;
- never marks a local scan as synced unless Odoo confirms the operation.

Field mapping:

| Scanner | Odoo `mailing.contact` |
| --- | --- |
| Name | `name` |
| Job title | `x_studio_job_title` |
| Company | `company_name` |
| Email | `email` |
| Phone | `mobile` |
| Notes, website, capture metadata and scanner marker | `x_studio_notes` |
| All Energy 2026 mailing-list membership | `list_ids` |

The first release does not attach the card image to Odoo. The image remains in
the device's local backup/export so sync payloads stay small and reliable.

## Offline behaviour

| Action | Offline | Online |
| --- | --- | --- |
| Open cached application | Yes | Yes |
| Capture and save card locally | Yes | Yes |
| Gemini extraction | Queued | Yes |
| Odoo delivery | Queued | Yes |

iOS does not provide reliable closed-app background sync. Pending work flushes
when the app opens, returns to the foreground, receives an online event, or when
staff press **Sync now**.

## Controlled release checklist

- [x] Match Nathan's `/allenergy` form model and fields
- [x] Resolve the All Energy 2026 mailing list id (`5`)
- [ ] Create a dedicated Odoo integration user and API key
- [ ] Configure encrypted Cloudflare secrets
- [ ] Protect the deployment with Cloudflare Access
- [ ] Deploy a non-production preview
- [ ] Verify one approved test contact and edit/retry without duplication
- [ ] Remove the test contact only if an authorised Odoo owner asks for it
- [ ] Test capture, offline storage and reconnection on one iPhone
- [ ] Promote the approved preview to production
