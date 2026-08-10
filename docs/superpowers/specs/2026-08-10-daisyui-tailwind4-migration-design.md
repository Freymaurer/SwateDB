# daisyUI + Tailwind CSS v4 Migration

## Goal
Replace the hand-written custom CSS in `packages/frontend` with Tailwind CSS v4 utility classes and daisyUI 5 components, using the `nord` theme.

## Current State
- **Build:** Vite 5 + React 18 + TypeScript
- **Styling:** 461-line `styles.css` with CSS custom properties and class-based selectors
- **Components:** Single `App.tsx` (568 lines) with inline sub-components
- **Deps:** No CSS framework, no PostCSS, no Tailwind

## Design

### Dependencies
Install as devDependencies:
- `tailwindcss` (v4)
- `@tailwindcss/vite` (Vite plugin, no PostCSS needed for v4)
- `daisyui` (v5)

### Configuration
1. **vite.config.ts** — Add `@tailwindcss/vite` plugin
2. **CSS entry** — Replace `styles.css` with a minimal Tailwind v4 entry file:
   ```css
   @import "tailwindcss";
   @plugin "daisyui" {
     themes: nord --default;
   }
   ```
3. **Docker / nginx** — No config changes needed (CSS is built by Vite)

### Component Migration (App.tsx)
Replace all CSS classes with Tailwind utilities and daisyUI components:

| Current CSS class | daisyUI / Tailwind replacement |
|---|---|
| `.app-shell` | `<div class="min-h-screen flex flex-col">` |
| `.topbar` | `<header class="navbar bg-base-100 shadow-sm">` |
| `.tabs` / `.tab` | `<div class="tabs tabs-box">` / `<a class="tab">` |
| `.panel` | `<div class="card bg-base-100 shadow-sm">` |
| `.metric-card` | `<div class="stat bg-base-200 rounded-box p-4">` |
| `.job-row` | `<div class="card bg-base-200">` |
| `.primary-button` / `.ghost-button` | `<button class="btn btn-primary">` / `<button class="btn btn-ghost">` |
| `.alert` | `<div class="alert alert-error">` / `<div class="alert alert-success">` |
| `.token-overlay` | `<dialog class="modal modal-open">` |
| `.sync-form` | `<form class="card bg-base-200 p-6">` |
| Ambient blobs | Tailwind `animate-pulse` + `bg-primary/10 blur-3xl` placed absolutely |

### What's removed
- Entire `styles.css` (461 lines)
- All CSS custom properties (colors handled by daisyUI theme)
- Custom `@keyframes` (replaced by daisyUI/Tailwind animations)
- Google Fonts import (nord uses system fonts; can add back via Tailwind if needed)
