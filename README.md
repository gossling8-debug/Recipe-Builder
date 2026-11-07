# Recipe Builder

Scan a recipe card with your phone and get an easy-to-follow recipe. You still get the usual
ingredient list, and every instruction step also shows the amount of each ingredient right
where it's added, so you don't have to flip back and forth between the steps and the list:

> **1** Cream **the butter** `1 cup` and **sugar** `1 cup (of the 1 1/2 cups)` until fluffy.

## Features

- **Scan with the camera** or pick photos (up to 4, e.g. front and back of a card).
- **Claude reads the card** (handwriting included) and links each ingredient to the steps that use it,
  including split ingredients ("divided" → `1/2 cup`, then `remaining`).
- **Double-check notes** when something on the card was smudged or had to be guessed, plus
  the original photo one tap away.
- **Cooking aids**: check off ingredients, tap ingredients inside a step to cross them off as you add
  them, tap steps to mark them done, and the screen stays on while a recipe is open. Progress is kept
  until you tap "Start over".
- **Resize a recipe** (½× to 3×): amounts in the list and in every step update, including metric
  conversions, while package sizes like "2 (8 oz) blocks" stay as they are.
- **Edit a recipe** to fix anything misread. Steps use `[ingredient: amount]` tags.
- **Favorites**: star a recipe (on the recipe or straight from the list); starred recipes are pinned
  at the top of the list.
- **Share** a recipe (at the chosen size) or the shopping list through the phone's share sheet;
  falls back to copying the text.
- **Shopping list** (with a Walmart button on each item that opens a Walmart search for it, e.g. for a
  Walmart+ order): add recipes at any size; matching ingredients are added up (1 cup + 2 cups sugar
  → 3 cups), items can be ticked off, and the list can be shared.
- **Tags, filters and sorting**: Claude suggests tags when scanning; edit them in the editor; filter
  the list by Favorites or any tag and sort by newest or A–Z.
- **Text size**: Standard, Large or Largest, in Settings.
- **Add from anywhere**: scan card photos, paste a recipe web address (Claude reads the page and skips
  the story and ads), or paste/type the text.
- **Cooking mode**: one step at a time in large text, the ingredients that step needs, one-tap timers
  for any time a step mentions (with a chime), and big Back/Next buttons or swipes.
- **Cost control**: choose the recipe reader in Settings (Best / Balanced / Budget), see what each
  recipe cost to read and a monthly spending total.
- **Share your version**: shared links include the substitutes you chose.
- **Pantry**: ticking shopping-list items adds them (tap "Change" to enter the package you bought, e.g.
  "4 lb bag"); "I made this" or finishing in cooking mode subtracts what the recipe used. The next
  shopping list shows "≈ 3½ lb left — enough" or "buy ≈ ½ cup more", and moves items you already have
  into their own section. Cups/tbsp/ml, oz/lb/g and package sizes like "2 (8 oz) blocks" are
  understood, and common staples convert between cups and pounds.
- **Plan a meal time**: pick when you want to eat; the app says when to start (from your own past
  times for that recipe, else the recipe's stated times, else an estimate from its steps), adds a
  calendar reminder (alerts 15 min before and at start time) and shows a banner if the app is open.
  After cooking, confirm how long it really took so the next plan is accurate.
- **Conversions** at the bottom of a recipe when an ingredient comes in other forms: fresh garlic ↔
  jarred minced ↔ garlic powder, onion ↔ dried minced ↔ powder, fresh ↔ dried herbs, ginger, lemon/lime
  juice, salted ↔ unsalted butter, and DIY buttermilk — worked out for the recipe's amount and size.
- **Allergies & ingredients to avoid** (Settings): common allergens plus your own words. Recipes are
  flagged, the list can be filtered to "Fits my avoid list", and each recipe can ask Claude for
  substitutes rated Nearly identical / Close / Noticeably different, saved with the recipe.
- **Library saved on your phone**, with search, and it works offline once loaded.
- **Backup / restore** to a file, because clearing the site's data in your browser erases saved recipes.

## How it works

A web app (PWA) you add to your home screen: React + TypeScript, built with Vite.

- `src/lib/claude.ts` sends the photos to the Claude API (`claude-opus-5-5`) with a structured-output
  schema (`src/lib/schema.ts`), so the reply is always a valid recipe object.
- Recipes are stored in IndexedDB (`src/lib/db.ts`); the app asks the browser for persistent storage.
- There is no server. Each person enters their own Anthropic API key in Settings, and it is stored only
  on that phone. Each scan costs roughly 5–15 cents in API usage.

## Cloud backup (optional)

Recipes can be backed up and synced across devices with a free Firebase project (Spark plan, no card).
Each person signs in with email and password; the phone's own storage stays the main copy, so the app
works offline, and the newest version of each recipe wins when devices sync. `firestore.rules` lets a
signed-in user read and write only `users/{their uid}/…`. The Anthropic API key is never uploaded.

Setup: create a Firebase project and a web app, put its config in `src/lib/firebaseConfig.ts`, enable
Authentication → Email/Password, create a Firestore database, and publish `firestore.rules`.

To test locally with the Firebase emulators (needs Java):

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-recipe-builder
VITE_FIREBASE_EMULATOR=1 npm run dev
```

## Develop

```bash
npm install
npm run dev     # local dev server
npm test        # unit tests
npm run build   # production build in dist/
```

## Deploy

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`.
Turn it on once in **Settings → Pages → Build and deployment → Source: GitHub Actions**.
