# Theme Development Best Practices

## CSS Organization
- Group related styles together (Editor, UI, Sidebar, etc.)
- Use comments to separate major sections
- Keep specificity low for easy customization

## Obsidian CSS Variables
Always prefer Obsidian's built-in CSS variables over hardcoded values:

```css
/* Good */
.theme-dark {
  --my-accent: var(--interactive-accent);
  background-color: var(--background-primary);
  color: var(--text-normal);
}

/* Avoid */
.theme-dark {
  background-color: #2d2d30;
  color: #cccccc;
}
```

## Responsive Design
```css
/* Mobile-first approach */
.my-component {
  width: 100%;
}

@media (min-width: 768px) {
  .my-component {
    width: 50%;
  }
}
```

## Dark/Light Mode Support
```css
/* Support both themes */
.theme-dark .my-element {
  background: var(--background-primary);
}

.theme-light .my-element {
  background: var(--background-secondary);
}
```