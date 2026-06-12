---
paths:
  - "src/components/tambo/**"
---

# Tambo Components

## queryId-driven (zero tokens to LLM)

**GeoMap** (`geo-map.tsx` + `geo-map-deckgl.tsx`): Generic deck.gl map, 6 layer types (h3, a5, scatterplot, geojson, arc, wkb). Auto-detects from column names + wkbArrays presence. Detection priority: a5 (`pentagon`/`a5_cell`/`a5_index`) → h3 (`hex`/`h3_index`) → wkb (auto-detected GEOMETRY) → arc → scatterplot → geojson. **Catalog data renders via the wkb path**: Portolan catalog datasets are vector features (native GEOMETRY in a regional CRS), so `runQuery` auto-detects the geometry, reprojects to EPSG:4326, and the map renders the WKB. The h3/a5 layer types remain available for any query that emits `hex`/`pentagon` columns, but catalog datasets are not DGGS-indexed. Basemap: always forced to `auto` (follows user's theme, AI basemap prop is ignored to prevent stale dark/light from old threads). AI can update props (zoom, pitch, bearing, colorScheme, layerType) at runtime via `withTamboInteractable`. Pitch (0-85): 0=top-down, 45-60=cinematic 3D. Bearing (-180 to 180): camera rotation. Both default to extruded-based values (45/-15 when extruded, 0/0 otherwise) if not set by AI. Supports multi-layer via `layers` array prop (max 5). Each layer has `id`, `queryId`, `layerType`, `pentagonColumn`, columns, `colorScheme`, `opacity`, `visible`. Floating layer control panel (top-left) always shown when any layers exist (single or multi-layer), for toggle/opacity/reorder. Single-layer maps synthesize a `LayerEntry` from direct props. Persists to localStorage. Uses 5 fixed `useQueryResult` hook slots for React rules compliance. `LayerConfig` in deckgl has per-layer `id`, `colorScheme`, `opacity`, `minVal`, `maxVal`, `columnArrays`, `arrowIPC`, `wkbArrays`, `columnMapping` (includes `pentagonColumn`).

**Map viewport persistence** (`geo-map.tsx` + `geo-map-deckgl.tsx`):
- User pan/zoom/tilt persisted to localStorage: `geomap-viewport:{threadId}:{queryId}` (single layer) or `geomap-viewport:{threadId}:{layerIds}` (multi-layer). Thread-scoped (via `useTambo().currentThreadId`) because queryIds (`qr_N`) are session counters that would otherwise collide across sessions.
- `programmaticMoveRef` in DeckGLMap suppresses saves during AI flyTo, auto-fitBounds, and external flyTo. Only user gestures are saved.
- `onViewStateChange` extended to include `pitch` and `bearing` (not just lat/lng/zoom).
- On mount: saved viewport overrides AI props. `fitBounds` suppressed when saved viewport exists.
- **AI camera precedence**: a ref in GeoMap tracks the AI camera props (latitude/longitude/zoom/pitch/bearing). When any of them changes, the saved viewport is cleared (state + localStorage) so the AI update reaches DeckGLMap. Without this, one user gesture would shadow every later AI camera change forever.
- **Pitch/bearing-only updates**: DeckGLMap effect 5b eases the camera to new pitch/bearing when they change WITHOUT a lat/lng/zoom change (AI setting `extruded` or `pitch` alone, or the prop arriving late during streaming). The flyTo effect early-returns in that case, so without 5b the camera stayed flat until a remount (the old "unhide turned my map 3D" bug). Guards: skips when a programmatic move is in flight, and when the camera is already within 0.5°.
- Layer overrides persisted: `geomap-layers:{threadId}:{queryId|layerIds}` as slim `LayerOverride` entries (`{ id, visible, opacity }` + array order ONLY), merged field-wise onto the live AI layers each render. AI styling (colorScheme, columns, layerType) is never stored, so AI restyles always apply. Overrides for removed layers are dropped; layers the AI adds later keep their own settings.

**Map interactivity** (`geo-map-deckgl.tsx`):
- **Hover tooltip** (desktop): `onHover` on all layers → `extractHoverProps()` extracts up to 6 key-value pairs → `MapTooltip` renders floating card with `bg-card/95 backdrop-blur-sm`. Repositions to stay within map bounds. Cursor changes to `crosshair` on feature hover.
- **Tap tooltip** (mobile): `makeClickHandler` wraps layer `onClick`. On touch devices, click also sets `hoverInfo` to show tooltip. Tooltip dismisses on `movestart` (pan/zoom).
- **Right-click context menu**: `onContextMenu` on wrapper div → if hovering a feature, shows dropdown with "Copy record" (JSON to clipboard). Dismisses on click anywhere or map move.
- **Fly-to consumer**: `useFlyToVersion()` + `consumeFlyTo()` - listens for external fly-to requests (e.g. DataTable "Zoom to record") and calls `mapRef.flyTo()`. Sets `programmaticMoveRef` to suppress viewport save.
- `HoverInfo` type: `{ x, y, object, layerType }`. `extractHoverProps()` handles GeoArrow (Arrow table `getChild` + `toJSON()` fallback for StructRow), and standard (JS object) layers. Skips `__geo_wkb`, `geom`, `geometry` from tooltip display.

**Geometry auto-detection**: When `StoredQuery.wkbArrays` is present (auto-extracted by `runQuery()` from GEOMETRY columns), `transformQueryToLayer()` takes the WKB fast path, bypassing GeoJSON parsing and routing directly to `buildGeoArrowTables()` zero-copy rendering. Lat/lng from the auto-injected centroid columns provide bounds. Works with GeoParquet, native Parquet geometry (Format 2.11+), and DuckDB GEOMETRY columns.

**GeoArrow rendering** (`geo-map-deckgl.tsx`): Four paths:
1. **Cell ID path** (H3/A5): Standard deck.gl `H3HexagonLayer` / `A5Layer` - GPU-native polygon generation from cell IDs. No GeoArrow, no geometry data needed.
2. **WKB path** (preferred for geometry): `wkbArrays → buildGeoArrowTables() → GeoArrowScatterplotLayer/PathLayer/PolygonLayer`. Zero-copy binary → Arrow. Used automatically when GEOMETRY columns detected. Spatial analysis results (ST_Buffer, ST_Intersects, spatial joins) auto-route here.
3. **Point/Arc path**: `columnArrays → buildGeoArrowPointTable()/buildGeoArrowArcTable()`. Interleaves lat/lng into FixedSizeList(2) geometry.
4. **Fallback**: Standard deck.gl layers with JS object data when Arrow data unavailable.

**H3Map** (`h3-map.tsx`): Backward-compat alias → `GeoMap` with `layerType="h3"`.

**Graph** (`graph.tsx`): queryId + xColumn + yColumns + chartType + xLabel + yLabel → Recharts. 10 chart types: bar, line, area, pie, scatter, radar, radialBar, treemap, composed (bar+line overlay), funnel. Cross-filter consume/emit. AI can update chartType, axes, labels at runtime. Y-axis auto-formats (5000→5k). Long labels truncated with SVG `<title>` hover. Legend renders at top. Always set xLabel/yLabel. Consumes time filter: shows reference line at current timestamp.

**TimeSlider** (`time-slider.tsx`): queryId + timestampColumn (default `time_label`) → extracts unique sorted timestamps from query result. Play/pause/prev/next controls with custom slider. Auto-converts UTC timestamps to user's local timezone via `formatLocal()`. Emits `TimeFilter` via `setTimeFilter()` on index change, clears on unmount. Cross-filters GeoMap (spatial snapshot at selected timestamp) + Graph (reference line). Props: `queryId`, `timestampColumn`, `title`, `autoplay`, `intervalMs`, `timezone`. Prevents pointer events from bubbling (drag handlers). Use for any timestamped dataset, render GeoMap + TimeSlider + Graph + DataTable together for time playback. Wrapped with `withTamboInteractable`.

**DataTable** (`data-table.tsx`): queryId → auto-derive cols/rows. Paginated 20/page. Cross-filter consume/emit. AI can update visibleColumns, title at runtime. Click row → expands action bar: **Zoom to record** (flies map to row's lat/lng or H3 hex centroid via `requestFlyTo()`) + **Copy record** (JSON to clipboard). Expanded row collapses on re-click or page change. **CSV export**: Download button in footer exports full query result via `exportQueryToCSV()` from `services/export.ts`.

All use `useQueryResult(queryId)`, `withTamboInteractable` (propsSchema only), `useInDashboardPanel()`.

**setState rules for interactable components**:
- Do NOT use `useTamboComponentState`, `useTamboInteractable()`, or `useTamboCurrentComponent()` **inside a `withTamboInteractable`-wrapped component body**. All cause "setState during render" errors.
- `useTamboInteractable()` IS allowed in PARENT components that mount interactables (e.g. `DashboardCanvas`). That's the supported pattern for the "Edit with AI" selection API.
- NEVER call setState directly in render body. Always use `useEffect` or callbacks. Example: data-table pagination reset uses `useEffect(safePage)`, not inline `if (safePage !== page) setPage()`.
- Dashboard toggleMaximize uses `queueMicrotask()` to defer setState.
- Thread reset in DashboardCanvas uses `useEffect(currentThreadId)` not render-body setState.
- Root cause: `withTamboInteractable` re-registers with `TamboRegistryProvider` during render; any setState that triggers mount/unmount of wrapped components during that cycle causes the React warning.

**Render-loop safeguards (React minified error #185)**:
- Never spread a non-memoized array into a `useMemo`/`useEffect` dep list (`...queryResults`). Wrap the array in `useMemo` so slot count + each element are stable. Unstable deps force memos to recompute every render and cascade through `useTimeFilter` / `useCrossFilter` subscribers.
- `useEffect` blocks that call `setState(new Map())` or `setState([...])` unconditionally churn allocations even when the logical value is unchanged. Use functional updates with equality checks: `setX((prev) => equal(prev, next) ? prev : next)`.
- Pub/sub emitters (`setTimeFilter`, `setCrossFilter` in `query-store`) MUST value-check before emitting. A no-op emit wakes every subscriber, and subscribers that re-derive via `useMemo` (GeoMap's `layerConfigs`, Graph's `resolvedData`) produce new references that propagate cascades. Rule: mutate `currentX` + `emit()` only when the new payload differs from the stored one.
- Dashboard panels read component name from `content.name` (SDK raw content block), NOT `content.componentName` (only set on `withTamboInteractable` config + `TamboCurrentComponent` hook). Reading the wrong field makes `INTERACTABLE_NAMES.has(...)` silently return false and hides the "Edit with AI" pencil.

## Inline props (AI sends values directly)

StatsCard, StatsGrid, InsightCard, DatasetCard, QueryDisplay, DataCard.

## Sizing

All viz components use `useInDashboardPanel()` to detect context:
- **In dashboard panels**: `h-full` - fills the panel container (definite height from grid layout or touch `h-[280px]`/`h-[420px]`)
- **In chat (inline)**: fixed height. GeoMap `h-[420px]`, Graph `h-[320px]`
- Inner layout: `flex flex-col`, header/footer `flex-shrink-0`, content `flex-1 min-h-0`
- Graph: compact `p-2 sm:p-4` padding, smart X-axis (auto-rotate at >10 or long labels), legend at top, Y-axis auto-format (5k). Default zoom: 1 (world view)
- Textarea: `min-h-[44px]` on mobile, `sm:min-h-[82px]` on desktop

## Dashboard (`dashboard-canvas.tsx`)

- Panel header: `[grip] [title] ... [@] [edit] [maximize] [close]`. Title from `content.props.title`.
- **Mention in chat (@ button)**: Shown on ALL panels when `onMentionPanel` prop is provided. Adds a one-shot context attachment (`useTamboContextAttachment`) carrying the panel snapshot (`buildPanelSnapshot` in `panel-store.ts`: componentName, title, queryId, row count, columns, 3 sample rows). Writes NOTHING into the textarea. Opens chat sidebar and mobile sheet. A `panelId → attachmentId` ref map dedupes repeat clicks; the SDK auto-clears attachments after send. Panel info synced to `panel-store.ts` for `listResources`/`getResource` on TamboProvider.
- **Edit with AI (Pencil button)**: Only shown on interactable panels (GeoMap, Graph, DataTable, TimeSlider). Clicking marks the component as `isSelected` via `useTamboInteractable().setInteractableSelected()`. The AI sees `isSelected: true` in its context and focuses its next response on that component. Selection is one-shot (auto-cleared after AI responds via `isIdle` transition). Toggle: click again to deselect. Visual: `border-primary ring-1 ring-primary/30` on the panel, `bg-primary/15 text-primary` on the button.
- Panel ID dedup: `Set<string>` with `compIdx` suffix for collisions.
- Desktop: `react-grid-layout`, rowHeight 80px. `panelHeight()`: maps=10 (2× other panels), graphs=5, tables=5, QueryDisplay/InsightCard/DatasetCard=3, StatsGrid/StatsCard=2, default=4. All panels full-width (`w: 12`). Component name read from Tambo's `content.name` (SDK field), NOT `content.componentName`. Maps forced to minimum `panelHeight()` even with saved layouts.
- **Compact components**: `isCompactComponent()` identifies StatsGrid, StatsCard, InsightCard, DatasetCard, QueryDisplay, DataCard. These get `h-auto` on touch. Note: panelHeight differs per type (see above), not all get 2 rows.
- Touch: `@dnd-kit/sortable`, TouchSensor (1.2s delay). Grip-only drag. Maps same height as others (`h-[280px]`), compact `h-auto`.
- Maximized panel: `fixed inset-0 z-40 bg-background`, covers all floating UI. Minimize via `queueMicrotask` to avoid setState-during-render.
- Thread reset: `useEffect(currentThreadId)` loads order/layouts/dismissed from localStorage. NEVER in render body.
- **Persisted state (all per-thread in localStorage)**:
  - Panel order: `panel-order-${threadId}` - saved immediately on reorder
  - Panel layouts (sizes/positions): `panel-layouts-${threadId}` - debounced 500ms save on resize/drag
  - Dismissed panels: `panel-dismissed-${threadId}` - saved immediately on dismiss
- Maximized state is NOT persisted (transient UX action). Auto-scrolls to latest.

## Message Input (`message-input.tsx`)

- Plain native `<textarea>` only. No TipTap/rich-text. No overlay-based highlighting (CSS Custom Highlight API doesn't support textarea).
- Types inline: `ImageItems`, `getImageItems()`, `TamboEditor`, `ResourceItem`, `PromptItem`.
- Compound component: `MessageInput.Textarea`, `.SubmitButton`, `.Toolbar`, etc.
- `invalid_previous_run` error → auto `startNewThread()`, preserves user text for resend.
- **MentionChips** (`mention-chips.tsx`): Shared component rendering mention chips as colored pills above the textarea. `@panel` (portolan-green) for dashboard panels. Driven by state (`MentionChipItem[]` built from context attachments), NOT by parsing input text. There is no regex and no text token; the textarea stays purely the user's words. Click chip → `onRemove(attachmentId)` → `removeContextAttachment`. Used in the explore (`/:slug`) input.

## Auto-scroll (`scrollable-message-container.tsx`)

- Ref-based stick-to-bottom (no state re-triggers). Instant `scrollTop` during streaming (no smooth-scroll lag). Smooth scroll on non-streaming content changes.
- **User scroll-up**: pauses auto-scroll (ignores programmatic scroll events via `programmaticScrollRef`).
- **Resume**: re-enables on new user message (detects `role === "user"` + count increase) or when user manually scrolls to bottom.
- Matches ChatGPT/Claude app behavior.

## UPDATE vs CREATE NEW

- **Default: Always CREATE NEW** components with fresh queryId. Every new question gets its own panels, building up a dashboard history.
- **Only UPDATE existing** (`update_component_props`) when: (1) the user clicked the "Edit with AI" pencil button on a panel (component has `isSelected: true`), AND (2) their message modifies that panel (zoom, pitch, colors, chart type, filter, hide columns). Changing `queryId` works when updating.
- If no component is selected, always create new panels, even for "show me X instead" or "change this to Y".

## Chat

- `message.tsx`: checks `[data-canvas-space="true"]` → "Rendered in dashboard" or inline.
- `thread-content.tsx`: `isGenerating = !isIdle` (covers isWaiting + isStreaming).
- `message-suggestions.tsx`: `useTamboSuggestions()` + initial suggestions when thread empty. Chips: single horizontal row with `overflow-x-auto scrollbar-none`, `whitespace-nowrap shrink-0` per chip, arrow icon for click affordance. Auto-submit on click. Positioned ABOVE input in both chat (`/:slug/chat`) and explore (`/:slug`).
- `message-thread-full.tsx`: accepts `initialSuggestions` prop for catalog-specific chips.
- `elicitation-ui.tsx`: Tambo elicitation for human-in-the-loop forms. Single-entry mode (boolean/enum) auto-submits on click. Multi-entry mode shows Submit button.

## Mobile Bottom Sheet (`explore/page.tsx`)

- `MobileBottomSheet`: `fixed inset-x-0 bottom-0 z-30`. No hardcoded `max-h` when collapsed, sizes to content dynamically. `top-0` when expanded (full screen).
- Suggestion chips above input bar, always visible in collapsed state.
- Floating toolbar removed. All settings (theme, cross-filter, query limit) consolidated into `<SettingsButton />` gear icon popover (portal to document.body to avoid header backdrop-blur transparency).
