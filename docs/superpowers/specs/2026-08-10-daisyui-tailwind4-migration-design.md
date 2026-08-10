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

### Component Architecture

Split the single `App.tsx` (568 lines) into a clean component tree with separation of concerns:

```
packages/frontend/src/
├── main.tsx
├── App.tsx                    (shell: layout, token state, topbar, tabs, view switching)
├── styles.css                 (Tailwind + daisyUI entry)
├── api.ts                     (unchanged)
├── components/
│   ├── TokenModal.tsx         (token entry modal overlay with validation)
│   ├── DashboardView.tsx      (dashboard tab: health, metrics, db stats, latest jobs)
│   ├── JobsView.tsx           (import log tab: job list + selected job detail)
│   ├── SyncView.tsx           (manual sync trigger form)
│   └── AlertBanner.tsx        (reusable error/success alert)
├── lib/
│   ├── token.ts               (readStoredToken, storeToken)
│   ├── errors.ts              (toErrorMessage, isAuthError, toTokenPromptMessage)
│   └── format.ts              (formatTimestamp)
```

**Component responsibilities:**

| Component | Props | Description |
|---|---|---|
| `App` | (none) | Top-level shell. Owns auth token, view state, data fetching. Renders Topbar, Tabs, TokenModal, and the active view. |
| `TokenModal` | `tokenDraft`, `onTokenDraftChange`, `onSave`, `errorMessage` | Full-screen modal requiring admin token input. |
| `DashboardView` | `health`, `dbStats`, `stats`, `latestJobs`, `busy` | Dashboard tab content. Contains `StatusCard` and `MetricCard` as inline sub-components (small, only used here). |
| `JobsView` | `jobs`, `selectedJobId`, `selectedJob`, `onSelectJob` | Import log with scrollable job list and detail panel. |
| `SyncView` | `syncForm`, `onSyncFormChange`, `onSubmit`, `busy` | Manual sync trigger form. |
| `AlertBanner` | `type` ("error" \| "success"), `message` | Alert with daisyUI `alert` component. |

**Inline vs. separate file rule:**
- `StatusCard` and `MetricCard` — inline in `DashboardView.tsx` (small, single consumer)
- `JobDetail` panel — inline in `JobsView.tsx` (only used by JobsView, moderate complexity)
- Everything else — own file

### What's removed
- Entire `styles.css` (461 lines)
- All CSS custom properties (colors handled by daisyUI theme)
- Custom `@keyframes` (replaced by daisyUI/Tailwind animations)
- Google Fonts import (nord uses system fonts; can add back via Tailwind if needed)
