# Over My Home

A small, mobile-first local-sky instrument that shows live aircraft which may be audible near a UK postcode.

## What it does

1. Converts a UK postcode to an approximate latitude and longitude with Postcodes.io.
2. Requests current nearby aircraft from the Airplanes.live point-and-radius API.
3. Calculates horizontal and straight-line distance using the reported altitude.
4. Places qualifying aircraft on an SVG sky radar centred on the postcode.
5. Preserves a complete accessible aircraft list beneath the graphic.
6. Identifies an aircraft as military only when the provider supplies the military database flag.
7. Labels ADS-B, MLAT and other position sources without treating them as equally exact.
8. Checks the app endpoint every 60 seconds while the page is open; upstream Airplanes.live responses are cached for five minutes to protect the provider's request budget.

The result is an **audibility estimate**, not a measured claim. Aircraft type, engine power, weather, buildings and background noise all affect what a person can hear.

## Data-use boundary

Over My Home is a free, non-commercial project. Its Airplanes.live integration must not be used for a paid product, advertising product, subscription service or other commercial purpose without obtaining suitable permission from Airplanes.live.

Airplanes.live currently documents a free allowance of 500 API requests per day. The five-minute edge cache reduces repeated upstream requests, but this remains a low-traffic public beta rather than a guaranteed high-volume service.

Airplanes.live provides no uptime guarantee. Its public API may change, become restricted or require contributor access later.

## Stack

- Static HTML, CSS and JavaScript
- Responsive SVG sky radar
- Cloudflare Pages Functions
- Airplanes.live REST API
- Postcodes.io
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

No environment variables or provider credentials are required for the current Airplanes.live integration.

## Privacy

- The postcode is submitted to the app endpoint to perform the lookup.
- The postcode is stored only in the visitor's own browser for convenience.
- This code does not create accounts, analytics records or a postcode database.
- Cloudflare and upstream APIs may retain ordinary request logs under their own policies.

## Current boundary

Version 0.2 intentionally does not include:

- a conventional street map;
- flight origin or destination claims;
- aircraft photographs;
- sound recording or microphone access;
- notifications;
- stored location histories;
- guessed military status;
- commercial use.
