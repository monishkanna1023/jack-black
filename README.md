# Basic Strategy Trainer

An interactive trainer for blackjack basic strategy. The chart is transcribed cell by cell in `public/js/strategy.js`. It's an installable web app (PWA): it works offline and can be added to your phone's home screen.

## Run it locally

Opening `public/index.html` directly works, but offline mode and installing need the app served over HTTP:

```sh
python3 -m http.server 8765 --directory public
# then open http://localhost:8765
```

## Host it on Netlify

Only the `public/` folder gets published to the site. The tests and this README stay in the repo and aren't served.

- **Drag and drop (easiest):** go to https://app.netlify.com/drop and drag the `public` folder onto the page.
- **CLI:** `npx netlify-cli deploy --prod` from this folder. `netlify.toml` already points at `public/`.
- **Git:** push this folder to GitHub and import the repo in Netlify. The settings are read from `netlify.toml`.

Netlify serves over HTTPS, which installing the app requires.

**Updating a Drop site:** open the project in Netlify, go to **Deploys**, and drag the `public` folder onto that page. Dropping it on app.netlify.com/drop again creates a new site with a new address.

**The "Powered by Netlify" badge:** Netlify adds this badge to new Free-plan sites. The `Content-Security-Policy` in `public/_headers` only lets the site's own scripts run, and Netlify's docs say that stops the badge from rendering. You can also try turning it off under Project configuration → General → Powered by Netlify badge, though on the Free plan that setting may be locked.

### Other free hosts (no badge)

- **Cloudflare Pages:** Workers & Pages → Create → Pages → upload the `public` folder. It reads the same `_headers` file.
- **GitHub Pages:** needs a public GitHub repo. It ignores `_headers`, but the app works without it.

### Install on your phone

- **iPhone (Safari):** Share → Add to Home Screen
- **Android (Chrome):** the Install button in the app, or ⋮ → Install app
- **Desktop Chrome/Edge:** the Install button in the header

### Updating after a deploy

Installed copies pick up a new deploy the next time they're opened (and show it on the launch after that). To force everyone onto a fresh copy right away, bump `VERSION` in `public/sw.js`. If you add a new file, add it to `ASSETS` in `public/sw.js` too, so it's available offline.

## Tabs

- **Chart**: the full chart. Tap any cell for an example hand, what the chart says, the move under your table rules, and a rule of thumb.
- **Drill**: random spots from the chart, with instant feedback. "Focus on weak spots" brings up the hands you miss more often.
- **Fill the Chart**: fill a blank table in from memory. You can retry just your mistakes.
- **Play**: single-deck blackjack with a coach that checks every decision (Coach or Strict mode).
- **Progress**: a heatmap of your accuracy for every chart cell, your weakest spots and your quiz best scores.

**Table rules** (top right): DAS, late surrender, doubling restrictions, dealer H17/S17, 3:2 or 6:5 payouts.

Keyboard (desktop): `H` hit · `S` stand · `D` double · `P` split · `R` surrender · `Space` next hand / deal · `I`/`N` insurance · `?` hint · `1`–`4` in Fill the Chart.

## Code

```
public/            ← the website (deploy this folder)
  index.html
  manifest.json    PWA manifest
  sw.js            service worker (offline cache)
  _headers         Netlify headers
  icons/           app icons
  css/styles.css
  js/strategy.js   the chart, transcribed cell by cell, plus the decision engine
  js/game.js       single-deck game engine
  js/cards.js      cards, hand totals, shoe
  js/tab-*.js      one file per tab
tests/             node --test tests/engine.test.js
netlify.toml
```
