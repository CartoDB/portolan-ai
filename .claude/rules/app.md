---
paths:
  - "src/app/**"
---

# App Pages

## Entry Point

`index.html` → `src/main.tsx` (`<BrowserRouter basename="/portolan-ai">`) → `src/App.tsx` (React Router). Routes: `/` (catalog picker home), `/:slug` (explore dashboard), `/:slug/chat` (chat). The catalog `slug` (`madrid`/`finland`/`south-africa`) resolves via `resolveCatalog(slug)`, an unknown slug renders a not-found card. Theme detection script + `crypto.randomUUID` polyfill in `index.html`. Fonts: Quicksand (local woff2 via `@font-face` in `globals.css`) + DM Mono (`@fontsource/dm-mono` imported in `main.tsx`), fully self-hosted, no CDN.

## `globals.css`

Tailwind v4 theme variables (light + dark). Brand colors: portolan-blue, portolan-cyan, portolan-green in `@theme inline`. Dashboard grid touch-action rules. No TipTap CSS.

## `explore/page.tsx` (main UI, route `/:slug`)

- Resolves `catalog` from `useParams().slug`, loads its dataset index via `useCatalogIndex(catalog)`, bootstraps via `usePageBootstrap(catalog, datasets)`
- TamboProvider with `tools={buildTools(catalog.slug)}`, `contextHelpers` (`buildContextHelpers(geo, catalog, datasets)`) and `initialSuggestions` (`buildInitialSuggestions(geo, catalog, datasets)`)
- `listResources`/`getResource` on TamboProvider exposes active dashboard panels as `panel://` resources for @-mentions
- `useMcpServers()` passes MCP server config to TamboProvider, `<TamboMcpProvider>` wraps children for MCP hooks
- `useGeoIP()` provides user location for environment context (date/timezone/location), not for suggestions
- `MentionChips` above textarea renders `@panel:Component("title")` mentions as colored pills
- `DashboardCanvas` `onMentionPanel` prop inserts `@panel:` mention into chat via `useTamboThreadInput`
- MobileBottomSheet: swipeable drawer, auto-expand on send, auto-collapse on dashboard render
- SessionHistory: thread list with auto-names, new thread button
- `useReplayQueries(messages)` re-runs runSQL tool calls from restored threads
- Thread URLs: `useUrlParamsSync()` syncs `?thread=` (`thr_` prefix) + `?q=`
- Settings (theme, query limit) via `<SettingsButton />` gear icon, all controls in popover

## `chat/page.tsx` (route `/:slug/chat`)

- Same catalog resolution as explore: `resolveCatalog(slug)`, `useCatalogIndex`, `usePageBootstrap`, `buildTools(slug)`. Not-found card when the slug is unknown
- `ChatInner` inside TamboProvider + `TamboMcpProvider`. `useTambo()` for messages, `useReplayQueries()` for thread restore, `useUrlParamsSync()` for `?thread=`/`?q=`
- `MessageThreadFull` with `initialSuggestions` prop for catalog-specific chips
- `<SettingsButton />` in header for theme + query limit
- GeoMap renders at `h-[420px]` inline (no dashboard panels)

## `page.tsx`

Landing page (catalog picker). Lists `CATALOGS` as cards linking to `/:slug`. No tech branding visible.
