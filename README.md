# City Lady

A pixel art noir game. Vela collects debts across ten districts of a night city. Each debtor has hidden traits. You pick the tactic.

## Play

- Walk with A and D or the arrow keys. Hold Shift to run.
- Press E at a door to enter a shop.
- Press Tab to open the ledger.
- In a duel, press 1 to 7 to pick a tactic. Press S to take an offer.
- Press V to turn the analog look on or off. Press M to mute.

## Systems

- Each night has a quota and a clock. Walking uses time. Negotiation uses time.
- Each debtor has five traits: pride, fear, greed, heart and logic. Read shows one trait.
- Tactics chain into combos. A repeated tactic is weaker.
- Paid debtors give gossip. A secret unlocks Leverage. A hardship makes Charm and Offer stronger.
- Pressure adds heat. At full heat a patrol stops Vela. She loses one hour.
- Fear and grace change how debtors react. They also decide the ending.
- The surplus buys perks between nights.

## AI judge

The worker asks TypeSafe Jev for typed judgments:

- A Choice question picks the debtor's counter-move from the moves the rules allow. The game blends the probabilities with a rules model.
- For "Say it" lines, Jev returns the tactic, the fit with the debtor, the use of intel and an abuse check.

The worker builds every question. The browser sends only game state. A Turnstile check issues a signed session cookie. The judge endpoint needs that cookie and has a rate limit. If the judge is not available, the game uses local rules.

## Develop

```bash
npm install
npx wrangler dev --port 8787
npx vite
```

Vite serves the game on port 5199. Vite sends `/api` to wrangler on port 8787. Put local secrets in `.dev.vars`:

```
TYPESAFE_API_KEY=...
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
SESSION_SECRET=...
```

Dev URLs: `/?district=3` starts a district. `/?vela=1` opens the sprite viewer.

## Deploy

1. Create a Turnstile widget for your domain.
2. Copy `wrangler.jsonc` to `wrangler.production.jsonc`. Git ignores that file.
3. In `wrangler.production.jsonc`, add a `routes` entry for your custom domain. Set `TURNSTILE_SITE_KEY` to the site key of your widget.
4. Set the secrets: `npx wrangler secret put TYPESAFE_API_KEY -c wrangler.production.jsonc`. Do the same for `TURNSTILE_SECRET_KEY` and `SESSION_SECRET`.
5. Run `npm run deploy`.

## Assets

| Asset | Source | Tool |
| --- | --- | --- |
| Skylines, shopfronts, portraits, cinematics | Qwen-Image 2.1 on ComfyUI | `tools/comfy.py`, `tools/pixelize.py` |
| Vela sprite atlas (54 frames) | GPT Image 2.5 Sunburst | `tools/atlas.py` |
| Pedestrian atlas (8 characters, 64 frames) | GPT Image 2.5 Sunburst | `tools/npc_atlas.py` |
| Music (4 songs) | YuE2 on ComfyUI | `tools/comfy.py` |
| Sound effects and ambience | ElevenLabs | `tools/sfx.py` |
| Voice (101 lines) | Gemini TTS | `tools/voice.py` |

Raw renders stay in `art/raw`. Git ignores that folder.

Tool settings: `tools/comfy.py` reads `COMFY_HOST` and `COMFY_OUTPUT`. `tools/voice.py` reads `GEMINI_TTS_SCRIPT`, the path to a Gemini TTS renderer. `tools/atlas.py` and `tools/npc_atlas.py` need `scipy`.
