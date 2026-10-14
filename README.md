# Alpha Prediction

Alpha Prediction is a live cricket AI dashboard for ongoing T20, ODI/One-Day,
Hundred and Test matches.

## What it shows

- match winner probability
- current score and run rate
- required run rate when a target exists
- future over score forecasts
- final score range
- wicket probability
- prediction confidence

## Live data

The app polls multiple public score feeds (ESPNcricinfo, CricketData,
Cricbuzz, and structured Indian domestic widgets) and keeps the dashboard
updated automatically. Discovery retains every returned match; there is no
arbitrary five-match or first-page cap. Only matches that are actually live
are shown, and the dashboard exposes received, active, displayed, format and
last-update diagnostics so provider coverage can be distinguished from Alpha
filtering.

Regional competitions are only available when an upstream score provider
publishes them. A league that is absent from all configured feeds cannot be
recovered by frontend code.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
