# Over My Home

A small, mobile-first local-sky instrument that shows live aircraft which may be audible near a location anywhere in the world.

## What it does

1. Accepts a postcode, ZIP code, town or place name.
2. Keeps the existing Postcodes.io path for valid UK postcodes and uses OpenStreetMap Nominatim for other worldwide location searches.
3. Converts the chosen location to an approximate latitude and longitude.
4. Requests current nearby aircraft from the Airplanes.live point-and-radius API.
5. Calculates horizontal and straight-line distance using the reported altitude.
6. Places qualifying aircraft on an SVG sky radar centred on the chosen location.
7. Preserves a complete accessible aircraft list beneath the graphic.
8. Identifies an aircraft as military only when the provider supplies the military database flag.
9. Labels ADS-B, MLAT and other position sources without treating them as equally exact.
10. Projects radar symbols once per second from reported speed and track, then corrects them with real data every three minutes, or every minute while confirmed military aircraft are present.
11. Pauses movement and automatic requests while the browser tab is hidden.

The accessible aircraft cards remain snapshots of the last real provider response. Only the graphical radar positions are extrapolated between corrections. Radar movement represents functional position data, so it continues when the visitor requests reduced decorative motion.

The result is an **audibility estimate**, not a measured claim. Aircraft type, engine power, weather, buildings and background noise all affect what a person can hear.

## Worldwide location lookup

Version 0.3 removes the UK-only input restriction.

- Valid UK postcodes still use Postcodes.io, preserving the previous lookup path.
- Other postal codes, ZIP codes, towns and place names use OpenStreetMap Nominatim.
- Ambiguous numeric postal codes or place names should include the country.
- There is no autocomplete or bulk geocoding.
- Worldwide geocoder results may be cached at the Cloudflare edge for up to 24 hours to reduce repeated upstream requests.
- Requests to the public Nominatim service are identified as Over My Home and rate-spaced within each running worker instance.
- `GEOCODER_BASE_URL` can point the backend at another Nominatim-compatible service without changing the frontend.

The public Nominatim service is suitable only while Over My Home remains a moderate-use application within its published usage policy. A higher-volume deployment should switch `GEOCODER_BASE_URL` to a suitable hosted or self-managed geocoder.

## Data-use boundary

Over My Home is a free, non-commercial project. Its Airplanes.live integration must not be used for a paid product, advertising product, subscription service or other commercial purpose without obtaining suitable permission from Airplanes.live.

Airplanes.live currently documents a rate limit of one API request per second. Over My Home uses a short shared edge cache and adaptive client refresh intervals to avoid unnecessary repeated upstream requests.

Airplanes.live provides no uptime guarantee. Its public API may change, become restricted or require contributor access later.

## Stack

- Static HTML, CSS and JavaScript
- Responsive SVG sky radar
- Cloudflare Pages Functions
- Airplanes.live REST API
- Postcodes.io for UK postcodes
- OpenStreetMap Nominatim for worldwide location lookup
- Node's built-in test runner

There are no frontend dependencies and no build step.

## Run tests

```bash
npm test
```

## Local preview

A plain static preview works with:

```bash
npm run serve
```

The live `/api/aircraft` endpoint requires Cloudflare Pages Functions. For a full local run, install Wrangler and use:

```bash
npx wrangler pages dev .
```

## Deploy to Cloudflare Pages

The production Pages project is connected to `armpitpete/over-my-home`.

- Production branch: `main`
- Framework preset: `None`
- Build command: `exit 0`
- Build output directory: `.`
- Root directory: blank
- Functions directory: detected automatically from `functions/`

No provider credentials are required for the default free, non-commercial configuration. `GEOCODER_BASE_URL` is optional and can be used to switch to another Nominatim-compatible geocoder.

## Privacy

- The location search is submitted to the app endpoint to perform the lookup.
- Valid UK postcodes are sent to Postcodes.io; other worldwide searches are sent to the configured geocoder.
- The location is stored in the visitor's own browser for convenience.
- Worldwide geocoding results may be cached at the Cloudflare edge for up to 24 hours. The cache is not associated with an account or user identity.
- This code does not create accounts, analytics records or stored location histories.
- Cloudflare and upstream APIs may retain ordinary request logs under their own policies.

## Current boundary

Version 0.3 intentionally does not include:

- a conventional street map;
- location autocomplete;
- bulk geocoding;
- flight origin or destination claims;
- aircraft photographs;
- sound recording or microphone access;
- notifications;
- stored location histories;
- guessed military status;
- commercial use.
