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
- **Shopping list**: add recipes at any size; matching ingredients are added up (1 cup + 2 cups sugar
  → 3 cups), items can be ticked off, and the list can be shared.
- **Tags, filters and sorting**: Claude suggests tags when scanning; edit them in the editor; filter
  the list by Favorites or any tag and sort by newest or A–Z.
- **Text size**: Standard, Large or Largest, in Settings.
- **Library saved on your phone**, with search, and it works offline once loaded.
- **Backup / restore** to a file, because clearing the site's data in your browser erases saved recipes.

## How it works

A web app (PWA) you add to your home screen: React + TypeScript, built with Vite.

- `src/lib/claude.ts` sends the photos to the Claude API (`claude-opus-5-5`) with a structured-output
  schema (`src/lib/schema.ts`), so the reply is always a valid recipe object.
- Recipes are stored in IndexedDB (`src/lib/db.ts`); the app asks the browser for persistent storage.
- There is no server. Each person enters their own Anthropic API key in Settings, and it is stored only
  on that phone. Each scan costs roughly 5–15 cents in API usage.

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
