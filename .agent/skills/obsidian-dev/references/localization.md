# Localization Best Practices

## Getting Obsidian's UI Language

**Always use `getLanguage()`** (exported from `obsidian`) to get the current Obsidian interface language. This is the official API recommended by Obsidian's plugin review process.

```ts
import { getLanguage } from "obsidian";

const lang = getLanguage();
const t = createTranslator(lang);
```

**Do NOT use:**
- `localStorage.getItem("language")` — deprecated for plugin review; use `getLanguage()` instead
- `navigator.language` — reflects OS/browser language, not Obsidian's setting
- `window.i18next?.language` — accesses Obsidian internals, may break across versions
- `moment.locale()` — reflects date locale, not UI language

## i18n Pattern Used in This Project

The project uses a simple key-value translator with a Chinese (`ZH_CN`) source-of-truth and an English (`EN_US`) fallback map.

```ts
// i18n.ts
export type I18nKey = keyof typeof ZH_CN;

const ZH_CN = {
  myKey: "中文文本",
  // ...
} as const;

const EN_US: Record<I18nKey, string> = {
  myKey: "English text",
  // ...
};

export function createTranslator(localeHint: string): (key: I18nKey) => string {
  const normalized = localeHint.toLowerCase();
  const messages = normalized.startsWith("zh") ? ZH_CN : EN_US;
  return (key) => messages[key] ?? EN_US[key];
}
```

### Rules

1. **ZH_CN is the source of truth** — `I18nKey` is derived from `ZH_CN`'s keys via `keyof typeof ZH_CN`.
2. **EN_US must be `Record<I18nKey, string>`** — TypeScript will error if any key is missing from EN_US.
3. **Add keys to both objects** — always add a new key to ZH_CN first, then EN_US.
4. Language detection: `localeHint.toLowerCase().startsWith("zh")` → Chinese; everything else → English.

## Where `createTranslator` Is Called

- **`src/main.ts`** — plugin-level translator, passed to `LinkEditManager` and `PopoverEditor` via constructor
- **`src/linkActions.ts`** — module-level `const t`, used for Notice messages

Both must use `getLanguage()`:

```ts
// main.ts
private readonly translate = createTranslator(
  getLanguage()
);

// linkActions.ts (module-level)
const t = createTranslator(
  getLanguage()
);
```
