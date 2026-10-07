# Germline

A personal, ad-free take on the play loop of the mobile game *Cell Survivor*:
a segmented virus train crawls down a winding track toward your cell, and you
shoot it apart before the head reaches your membrane.

Play it at **https://nickcason.github.io/germline/** — on iPhone, open it in
Safari and use *Share → Add to Home Screen* for the full-screen app. It works
offline once installed; progress is saved on the device (Settings has a backup
code for moving it between devices).

## How a run works

- The train is a virus head pulling 100+ segments, each with its own HP. Front
  segments are soft, the tail is brutal.
- The tail is pushed forward constantly. Every segment you kill yanks the front
  of the train backwards to close the gap — that is the only thing holding the
  head back.
- Teal chest segments open a pick of three upgrade cards; gold chests roll
  better rarities. Cards add weapons (cotton swab, acupuncture, bubbles, snot,
  meteors, towers, scalpels…) or boost the ones you have.
- Clear 100% to win. Reach the membrane and you can revive (3 per run), which knocks
  the train far back down the track.

- **Aim:** auto mode tracks the front of the train; flip the crosshair button
  to manual and touch anywhere on the train to target it (release to lock on).
- **Picks:** 6 rerolls per run, and each reroll on the same chest rolls rarer
  cards; 2 "take all 3" per run; 3 revives per run.
- **Power-ups** (borrowed from Zuma/Luxor): segments light up with Freeze,
  Reverse, Bomb, Lightning, Rapid fire or a coin bag. Pop them before they fade.
- **Evolutions** (Survivor.io style): upgrade a weapon enough while owning its
  partner and a one-time legendary transformation appears.
- **Devil's bargains** (Archero style): gold chests sometimes offer a big boon
  with a catch.
- **Costumes:** seven looks for the hero, each with a perk and its own
  ultimate, charged by kills and fired from the HUD.

Between runs, coins buy hero stats and shards level up weapons. Weapon levels
3 and 6 add that weapon's epic and legendary cards to the chest pool. Clearing
a chapter unlocks the next one, a new weapon, and hard mode for that chapter.
Endless mode opens after chapter 2: the train never ends, chase a best score.

All audio (music and effects) is synthesized in the browser, with separate
toggles and volumes in Settings and on/off switches in the pause menu.

## Development

```sh
npm install
npm run dev      # vite dev server
npm test         # unit tests
npm run sim      # balance report: a bot plays chapters at a few power levels
npm run build    # production build into dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

The simulation (`src/game`) is deterministic and has no DOM dependencies, so
the same code runs in the browser and in the headless balance simulator
(`src/sim`).
