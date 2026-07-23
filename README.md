# Over My Home

A small, mobile-first web app that lists live aircraft which may be audible near a UK postcode.

## What it does

1. Converts a UK postcode to an approximate latitude and longitude with Postcodes.io.
2. Requests current aircraft state vectors in a small OpenSky Network bounding box.
3. Calculates horizontal and straight-line distance using the reported aircraft altitude.
4. Lists aircraft inside the selected modelled hearing distance.
5. Refreshes every 15 seconds while the page is open.

The result is an **audibility estimate**, not a measured claim. Aircraft type, engine power, weather, buildings and background noise all affect what a person can hear.

## Stack

- Static HTML, CSS and JavaScript
- Cloudflare Pages Functions
- OpenSky Network REST API
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

Create a Pages project from this repository with:

- Build command: leave blank
- Build output directory: `.`
- Functions directory: detected automatically from `functions/`

### Recommended OpenSky authentication

OpenSky supports OAuth2 client credentials. Add these encrypted environment variables in Cloudflare Pages:

- `OPENSKY_CLIENT_ID`
- `OPENSKY_CLIENT_SECRET`

The app falls back to anonymous OpenSky access when the variables are absent, but anonymous access has a much smaller daily credit allowance.

## Privacy

- The postcode is submitted to the app endpoint to perform the lookup.
- The postcode is stored only in the visitor's own browser for convenience.
- This code does not create accounts, analytics records or a postcode database.
- Cloudflare and upstream APIs may retain ordinary request logs under their own policies.

## Current boundary

Version 0.1 intentionally does not include:

- a map;
- flight origin or destination claims;
- aircraft photographs;
- sound recording or microphone access;
- notifications;
- stored location histories.

Those features should be considered only after the live list is reliable.
