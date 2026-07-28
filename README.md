# 👑 The Royal Date Bureau

A ridiculous, hand-drawn, **fully serverless** date-booking kingdom for one princess and one
extremely hopeful suitor. Static HTML/CSS/JS — no backend, no database, no build step.

## How two people share data without a server

Everything lives inside the URL:

1. **She** opens *Princess Mode*, taps her free days, sets time slots + demands
   → gets a **Royal Decree link** (`#/book/<encoded>`).
2. She sends that link to him.
3. **He** opens it, waits in a queue behind ~5,000 desperate men, passes the vibe check,
   and books a slot → gets a **Receipt link** (`#/booked/<encoded>`).
4. He sends it back. Certificate. Confetti. Date confirmed.

The availability and the booking are base64-encoded JSON in the hash fragment, so nothing
is ever uploaded anywhere. Her choices are also cached in `localStorage` so she can edit
them later on the same device.

## Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Open the royal gates"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then **Settings → Pages → Source: Deploy from a branch → `main` / `root`**.
Live in about a minute at `https://<you>.github.io/<repo>/`.

Works from a subfolder too — links are built from the current path, no config needed.

## Run locally

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Files

| File | What's in it |
|---|---|
| `index.html` | Page shell, SVG symbol defs, animated castle background |
| `styles.css` | The whole cartoon design system — thick outlines, offset shadows, responsive layout |
| `app.js` | Hash router, hand-built calendar, queue animation, reel, link encoding |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |

## Everything is handmade

No UI libraries, no icon packs, no charting deps. The calendar (Monday-first month maths,
leading blanks, past-day locking, month navigation) is written from scratch, the suitor
faces are generated procedurally as SVG, and the confetti, stamps, wobble filter and
floating hearts are plain SVG/CSS animations. Respects `prefers-reduced-motion`.

## Customising

Open `app.js` and edit the arrays near the top:

- `SLOTS` — the time slots she can offer
- `PLANS` — date ideas he can pick
- `RULES` — her non-negotiable demands
- `RIVALS` / `STAMPS` — the rejected suitors in the reel
- `QUIZ` — the vibe-check questions
- `QUEUE_LINES` / `DENIALS` — the loading and rejection jokes

Colours live at the top of `styles.css` as CSS custom properties.
