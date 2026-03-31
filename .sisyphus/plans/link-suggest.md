# Link Destination Autocomplete Suggest

## TL;DR

> **Quick Summary**: Add a fuzzy autocomplete dropdown to the destination input field in the popover editor, powered by Obsidian's `AbstractInputSuggest`. Typing shows vault file suggestions; typing `#` switches to heading suggestions for the resolved file.
>
> **Deliverables**:
> - `src/linkSuggest.ts` — new `LinkDestinationSuggest` class
> - `src/settings.ts` — new `enableLinkSuggestions` setting (default true)
> - `src/i18n.ts` — new i18n keys (EN + ZH)
> - `src/settingTab.ts` — new toggle in General group
> - `src/popoverEditor.ts` — expose `destinationInputEl` getter
> - `src/linkEditManager.ts` — lifecycle integration (create/destroy suggest)
>
> **Estimated Effort**: Short
> **Parallel Execution**: NO — sequential (each step depends on previous)
> **Critical Path**: settings → i18n → settingTab → linkSuggest.ts → popoverEditor → linkEditManager

---

## Context

### Original Request
Add an autocomplete/suggest dropdown to the destination input field in the popover editor. Two modes: file mode (fuzzy search vault notes) and heading mode (after `#`, list headings of resolved file).

### Interview Summary
- **Link types in scope**: `wiki`, `markdown` only — NOT `url`, NOT image types
- **New setting**: `enableLinkSuggestions` (default `true`), independent from `validateInternalLinks`
- **Max suggestions**: 20
- **No image links**: Only note destinations
- **No block refs**: `^` support is explicitly out of scope
- **No "create new file"**: Suggest is read-only

### Metis Review
**Identified Gaps** (addressed):
- `isOpen` not public → use a `suggestActive` flag tracked via `onSelect` + custom close
- `AbstractInputSuggest` and `prepareFuzzySearch` are officially typed → confirmed safe to use
- Suggest lifecycle vs popover lifecycle → create on `show()`, destroy on `close()`/`discard()`
- Heading mode when file doesn't resolve → return empty array (no suggestions shown)
- `#` in filename → split on first `#` only, accepted limitation
- Rapid typing → use synchronous `getSuggestions` (no Promise), no stale-result risk
- `selectSuggestion` sets value + dispatches native `input` event manually → triggers existing `onDestinationInput` debounce (which then clears warning since value is now valid)

---

## Work Objectives

### Core Objective
When the user edits a non-image internal link destination, show a fuzzy-search dropdown over vault notes. After `#`, show headings. Selecting fills the input and clears any validation warning.

### Concrete Deliverables
- `src/linkSuggest.ts` with `LinkDestinationSuggest` class
- Setting `enableLinkSuggestions: boolean` (default `true`) wired end-to-end
- Suggest attached only for `wiki` and `markdown` link types

### Definition of Done
- [ ] Typing in destination input for a wiki/markdown link shows note suggestions
- [ ] Typing `file#` shows heading suggestions for that file
- [ ] Selecting a suggestion fills the input and dismisses the dropdown
- [ ] Enter/Escape in the popover do NOT fire while suggest dropdown is active
- [ ] Setting off → no dropdown appears, no listeners attached
- [ ] Image and URL link types → no dropdown

### Must Have
- Official `AbstractInputSuggest` API only — no DOM hacks into suggest internals
- `suggestActive` flag tracks whether the dropdown is showing, guarding Enter/Escape in popover
- Suggest instance destroyed when popover closes (no memory leak)
- `selectSuggestion` dispatches a native `input` event so existing validation flow triggers

### Must NOT Have
- Block reference (`^`) suggestions
- "Create new file" option in dropdown
- Suggest on display/alias input field
- Suggest on image link destinations
- Any coupling between `enableLinkSuggestions` and `validateInternalLinks` settings

---

## Execution Strategy

Sequential — each task depends on the previous.

```
Task 1: settings.ts — add enableLinkSuggestions
Task 2: i18n.ts — add i18n keys
Task 3: settingTab.ts — add toggle
Task 4: linkSuggest.ts — implement LinkDestinationSuggest
Task 5: popoverEditor.ts — expose destinationInputEl getter + suggestActive guard
Task 6: linkEditManager.ts — lifecycle integration
```

---

## TODOs

- [ ] 1. Add `enableLinkSuggestions` setting

  **What to do**:
  - In `src/settings.ts`, add `enableLinkSuggestions?: boolean` to `BetterLinksSettings`
  - Add `enableLinkSuggestions: true` to `DEFAULT_SETTINGS`

  **Must NOT do**:
  - Do not couple this setting with `validateInternalLinks` in any way

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 1
  - **Blocks**: Task 2, 3, 4, 6
  - **Blocked By**: None

  **References**:
  - `src/settings.ts` — follow existing optional boolean pattern (`edgeProtection?: boolean`, `validateInternalLinks?: boolean`)

  **Acceptance Criteria**:
  - [ ] `BetterLinksSettings` interface has `enableLinkSuggestions?: boolean`
  - [ ] `DEFAULT_SETTINGS.enableLinkSuggestions === true`
  - [ ] `tsc --noEmit` passes

  **Commit**: YES
  - Message: `feat(settings): add enableLinkSuggestions setting`
  - Files: `src/settings.ts`

---

- [ ] 2. Add i18n keys

  **What to do**:
  - In `src/i18n.ts`, add to both `ZH_CN` and `EN_US`:
    - `settingsEnableLinkSuggestionsName`
    - `settingsEnableLinkSuggestionsDesc`

  **ZH_CN values**:
  - Name: `"启用链接建议"`
  - Desc: `"在编辑内部链接目标时，显示库内笔记和标题的自动补全候选。"`

  **EN_US values**:
  - Name: `"Enable link suggestions"`
  - Desc: `"Show autocomplete suggestions for notes and headings when editing internal link destinations."`

  **Must NOT do**:
  - Do not add keys for image or URL link types

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 2
  - **Blocks**: Task 3
  - **Blocked By**: Task 1

  **References**:
  - `src/i18n.ts` — follow existing pattern (`settingsValidateInternalLinksName` / `settingsValidateInternalLinksDesc`)

  **Acceptance Criteria**:
  - [ ] Both `ZH_CN` and `EN_US` contain the two new keys
  - [ ] No TypeScript errors (the `I18nKey` type is derived from `ZH_CN` keys, `EN_US` must have all keys)

  **Commit**: YES (group with Task 1 or standalone)
  - Message: `feat(i18n): add enableLinkSuggestions keys`
  - Files: `src/i18n.ts`

---

- [ ] 3. Add toggle in settings tab

  **What to do**:
  - In `src/settingTab.ts`, in the `behaviorGroup` section, add a toggle after the `validateInternalLinks` toggle:
    ```ts
    behaviorGroup.addSetting((setting) => {
      setting
        .setName(t("settingsEnableLinkSuggestionsName"))
        .setDesc(t("settingsEnableLinkSuggestionsDesc"))
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.enableLinkSuggestions ?? true).onChange(async (value) => {
            this.plugin.settings.enableLinkSuggestions = value;
            await this.plugin.saveSettings();
          });
        });
    });
    ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 3
  - **Blocks**: Task 4
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/settingTab.ts:34-44` — the `edgeProtection` toggle as the pattern to follow

  **Acceptance Criteria**:
  - [ ] Settings tab renders the new toggle
  - [ ] `tsc --noEmit` passes

  **Commit**: Group with Tasks 1+2
  - Message: `feat(settings): add enableLinkSuggestions setting and UI`
  - Files: `src/settings.ts`, `src/i18n.ts`, `src/settingTab.ts`

---

- [ ] 4. Implement `LinkDestinationSuggest`

  **What to do**:
  - Create `src/linkSuggest.ts`
  - Define a union type:
    ```ts
    type FileSuggestion = { kind: "file"; file: TFile; match: SearchResult };
    type HeadingSuggestion = { kind: "heading"; file: TFile; heading: HeadingCache; match: SearchResult };
    export type LinkSuggestion = FileSuggestion | HeadingSuggestion;
    ```
  - Implement `LinkDestinationSuggest extends AbstractInputSuggest<LinkSuggestion>`:

  **Constructor signature**:
  ```ts
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private sourcePath: string,
    private onSuggestionSelected: () => void,  // called after selection to clear warning
  )
  ```

  **`getSuggestions(query: string): LinkSuggestion[]`**:
  - `const MAX_SUGGESTIONS = 20`
  - If query contains `#`:
    - Split on first `#`: `filePart = query.slice(0, idx)`, `headingQuery = query.slice(idx + 1)`
    - Resolve file: `const file = this.app.metadataCache.getFirstLinkpathDest(filePart, this.sourcePath)`
    - If no file: return `[]`
    - Get headings: `this.app.metadataCache.getFileCache(file)?.headings ?? []`
    - If `headingQuery` is empty: return all headings (up to MAX_SUGGESTIONS) mapped as `HeadingSuggestion` with `match: { score: 0, matches: [] }`
    - Else: `const search = prepareFuzzySearch(headingQuery)`, filter headings where `search(h.heading) !== null`, sort by score descending, slice to MAX_SUGGESTIONS
  - Else (file mode):
    - `const files = this.app.vault.getMarkdownFiles()`
    - If query is empty: return first MAX_SUGGESTIONS files sorted alphabetically as `FileSuggestion` with empty match
    - Else: `const search = prepareFuzzySearch(query)`, filter + sort + slice to MAX_SUGGESTIONS

  **`renderSuggestion(item: LinkSuggestion, el: HTMLElement)`**:
  - For `FileSuggestion`:
    - Show `item.file.path` (full vault-relative path for disambiguation)
    - If `item.match.matches.length > 0`: use `renderResults(el, item.file.path, item.match)`
    - Else: `el.setText(item.file.path)`
  - For `HeadingSuggestion`:
    - Show heading level prefix (`#`, `##`, etc.) + heading text
    - Render with highlights if match has matches

  **`selectSuggestion(item: LinkSuggestion, evt: MouseEvent | KeyboardEvent)`**:
  - Compute value:
    - `FileSuggestion` → `item.file.path` (without `.md` extension if Obsidian's wikilink format is active — use `shouldUseWikiLinkFormat(app)` imported from `linkActions.ts` to decide; if wikilink format: strip `.md`, else keep full path)
    - `HeadingSuggestion` → `filePart + "#" + item.heading.heading` (filePart is the part before `#` in the current input value)
  - Call `this.setValue(value)` to update input
  - Dispatch native `input` event: `inputEl.dispatchEvent(new Event("input", { bubbles: true }))`
  - Call `this.onSuggestionSelected()` — the manager clears warning state and cancels pending validation
  - Call `this.close()` to dismiss dropdown

  **Track dropdown state**:
  - Add `private _active = false`
  - Override `open()`: `this._active = true; super.open()`
  - Override `close()`: `this._active = false; super.close()`
  - Expose `get isActive(): boolean { return this._active }`

  **Must NOT do**:
  - No block reference (`^`) suggestions
  - No "create new file" option
  - Do not attach to any input other than `destinationInputEl`
  - Do not use `Promise` return from `getSuggestions` (keep synchronous to avoid stale results)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 4
  - **Blocks**: Tasks 5, 6
  - **Blocked By**: Task 3

  **References**:
  - `node_modules/obsidian/obsidian.d.ts:294` — `AbstractInputSuggest` full signature
  - `node_modules/obsidian/obsidian.d.ts:4868` — `prepareFuzzySearch`
  - `node_modules/obsidian/obsidian.d.ts:5074` — `renderResults`
  - `node_modules/obsidian/obsidian.d.ts:3040` — `HeadingCache` interface
  - `src/linkDetector.ts:131-133` — `isLikelyExternalDestination` (for reference, NOT used here)
  - `src/linkActions.ts` — `shouldUseWikiLinkFormat(app)` for deciding path format on selection

  **Acceptance Criteria**:
  - [ ] `tsc --noEmit` passes with no errors
  - [ ] `FileSuggestion` and `HeadingSuggestion` types defined and exported
  - [ ] `LinkDestinationSuggest` exported from file
  - [ ] `isActive` getter exists

  **Commit**: YES
  - Message: `feat: implement LinkDestinationSuggest with file and heading modes`
  - Files: `src/linkSuggest.ts`

---

- [ ] 5. Expose `destinationInputEl` from `PopoverEditor`

  **What to do**:
  - In `src/popoverEditor.ts`, add a public getter:
    ```ts
    get destinationInput(): HTMLInputElement {
      return this.destinationInputEl;
    }
    ```
  - In `keydownHandler` inside `attachGlobalListeners`, guard Enter/Escape using a flag provided by the manager:
    - Add a property `private isSuggestActive: (() => boolean) | null = null`
    - Add a public method `setSuggestActiveChecker(fn: () => boolean): void { this.isSuggestActiveChecker = fn }`
    - In the keydown handler: `if (this.isSuggestActiveChecker?.()) return;` — early return before checking Escape/Enter

  **Must NOT do**:
  - Do not expose the raw `rootEl` or other internals
  - Do not change any existing behavior when no checker is set

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 5
  - **Blocks**: Task 6
  - **Blocked By**: Task 4

  **References**:
  - `src/popoverEditor.ts:29-39` — class fields
  - `src/popoverEditor.ts:194-206` — `attachGlobalListeners` / `keydownHandler`

  **Acceptance Criteria**:
  - [ ] `popoverEditor.destinationInput` returns the input element
  - [ ] `setSuggestActiveChecker` registered, keydown blocked when checker returns `true`
  - [ ] When no checker set, existing Enter/Escape behavior unchanged
  - [ ] `tsc --noEmit` passes

  **Commit**: Group with Task 6
  - Message: `feat: integrate LinkDestinationSuggest into popover editor`

---

- [ ] 6. Lifecycle integration in `LinkEditManager`

  **What to do**:
  - In `src/linkEditManager.ts`:
    - Add `private suggest: LinkDestinationSuggest | null = null`
    - In `show(match, referenceEl)`:
      - After creating `activeSession`, check if suggest should be active:
        ```ts
        const shouldSuggest =
          (this.plugin.settings.enableLinkSuggestions ?? true) &&
          (match.type === "wiki" || match.type === "markdown");
        ```
      - If yes: create `new LinkDestinationSuggest(app, this.popoverEditor.destinationInput, match.sourcePath, () => { this.cancelPendingValidation(); this.setWarning(false); })`
      - Register the checker: `this.popoverEditor.setSuggestActiveChecker(() => this.suggest?.isActive ?? false)`
    - In `discardAndClose()`, `saveAndClose()`, `destroy()`: call `this.suggest?.close(); this.suggest = null` and reset checker `this.popoverEditor.setSuggestActiveChecker(null)`

  **Must NOT do**:
  - Do not create suggest for `imageWiki`, `imageMarkdown`, `url` types
  - Do not leave suggest instance alive after popover closes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential step 6
  - **Blocks**: nothing (final task)
  - **Blocked By**: Tasks 4, 5

  **References**:
  - `src/linkEditManager.ts:55-68` — `show()` method
  - `src/linkEditManager.ts:82-105` — `saveAndClose()` / `discardAndClose()`
  - `src/linkEditManager.ts:268-271` — `setWarning()`
  - `src/linkSuggest.ts` — `LinkDestinationSuggest` (created in Task 4)
  - `src/popoverEditor.ts` — `destinationInput` getter + `setSuggestActiveChecker` (Task 5)

  **Acceptance Criteria**:
  - [ ] Typing in destination input for `wiki`/`markdown` link type shows dropdown
  - [ ] Typing in destination input for `url`/`imageWiki`/`imageMarkdown` shows no dropdown
  - [ ] Selecting a suggestion fills the input and closes dropdown
  - [ ] After selection, validation warning is cleared
  - [ ] Enter/Escape while suggest dropdown is open do NOT trigger popover save/discard
  - [ ] Enter/Escape while suggest is closed still trigger popover save/discard
  - [ ] Opening popover twice in a row does not stack suggest instances
  - [ ] `tsc --noEmit` passes

  **Commit**: YES (with Task 5)
  - Message: `feat: integrate LinkDestinationSuggest into popover editor`
  - Files: `src/popoverEditor.ts`, `src/linkEditManager.ts`

---

## Final Verification

After all tasks complete:
- [ ] `pnpm build` passes cleanly
- [ ] All 6 link types tested manually: wiki ✓ suggest, markdown ✓ suggest, url ✗ no suggest, imageWiki ✗ no suggest, imageMarkdown ✗ no suggest
- [ ] Heading mode: type `notename#` → headings list appears
- [ ] Setting off: no dropdown for any type
- [ ] No console errors on open/close cycle

---

## Commit Strategy

1. `feat(settings): add enableLinkSuggestions setting and UI` — Tasks 1+2+3 — `src/settings.ts`, `src/i18n.ts`, `src/settingTab.ts`
2. `feat: implement LinkDestinationSuggest with file and heading modes` — Task 4 — `src/linkSuggest.ts`
3. `feat: integrate LinkDestinationSuggest into popover editor` — Tasks 5+6 — `src/popoverEditor.ts`, `src/linkEditManager.ts`
