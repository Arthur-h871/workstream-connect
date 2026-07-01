# Canvas Component Patterns

## React Flow nodes
- Node components receive `id`, `data`, `selected` from `NodeProps`
- Cast `data` via `data as unknown as YourDataType` — NodeProps requires `Record<string,unknown>` index signature
- Use `nopan nodrag` classes on interactive elements (buttons, textareas, dropdowns) so React Flow does not intercept mouse events
- `NodeResizer` accepts `isVisible={selected}` to show only when node is selected

## Auth in canvas components
- Canvas components live deep in the tree but can call `useRouteContext({ from: "/_authenticated" })` directly — no prop drilling needed
- Returns `{ profile }` with `profile.id` and `profile.organization_id`

## Autocomplete / mention dropdowns in nodes
- Wrap textarea + dropdown together in a `relative` container div
- Dropdown uses `absolute z-50` positioning to layer over canvas
- Add `nopan nodrag` to the dropdown root so React Flow does not capture pointer events
- Keyboard handler uses `window.addEventListener("keydown", ...)` — works even when textarea has focus inside a node
- Debounce search at 200ms to avoid excessive requests while typing
- Use `selectionStart` from the textarea event to find cursor position for accurate mention detection

## Task mention token format
- Token format: `[[@task:{id}:{title}]]`
- Stored as plain text in note content — visual rendering as badges is a future phase
- Trigger: `//` followed by optional word characters (`/\/\/(\w*)$/`)

## todo block pattern
- Content shape: `{ items: Array<{ id, text, checked, task_id, task_type }> }` — full array stored in JSONB
- Checking an item calls `onTaskStatusChange(task_id, task_type, "completed")`; unchecking calls with `"in_progress"`
- Items are managed in local state; debounced save (800ms) writes via `onItemsChange(blockId, items)`
- New item IDs use `crypto.randomUUID()`; no external dependency required
- Timer cleanup on unmount: `useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current) }, [])`
- `handleTodoTaskStatus` in the route wraps `updateTaskStatus` fire-and-forget (unlike `handleStatusChange` which also updates the block content — todo node owns its own content update via `handleItemsChange`)

## Edge / connection pattern
- Import `addEdge`, `ConnectionMode`, `type Edge`, `type Connection` from `@xyflow/react`
- `useEdgesState<Edge>([])` restores `setEdges` (third destructured value)
- Load edges in parallel with blocks: `Promise.all([getBlocks(c.id), getConnections(c.id)])`
- Edge style uses `var(--copper)` CSS variable (defined in `:root` as `#EA580C`) — do NOT hardcode hex
- `handleConnect` is `async`; creates DB record first, then calls `setEdges(eds => addEdge({...connection, id: conn.id, ...}, eds))`
- `handleEdgeClick` deletes on click: fire-and-forget DB delete + local filter
- `ConnectionMode.Loose` enables connecting to any handle without requiring exact handle IDs
- Node handle visibility: `className="opacity-0 hover:opacity-100"` — no changes needed with `ConnectionMode.Loose`

## Drawing layer pattern (Fase 8)
- `DrawingLayer` is an SVG overlay — render it OUTSIDE `<ReactFlow>` but inside the same `relative` container so pixel coordinates match the screen (not the panned/zoomed flow viewport)
- When `isDrawing` is false, apply `pointer-events-none z-0`; when true, `cursor-crosshair z-10` — this lets React Flow handle interactions normally when draw mode is off
- Stroke points are accumulated in a `useRef<string[]>` (not state) to avoid re-renders per mouse-move; only `setCurrentPath` triggers re-render for the live preview
- `getSVGPoint` uses `getBoundingClientRect()` offset instead of SVG CTM transforms — correct because the SVG fills 100% of its positioned container with no internal viewBox transform
- Disabling React Flow interaction during draw mode: `nodesDraggable={!isDrawingMode}`, `panOnDrag={!isDrawingMode}`, `panOnScroll={!isDrawingMode}`
- `CanvasToolbar` uses `absolute top-3 left-1/2 -translate-x-1/2 z-20` — floats above both ReactFlow and DrawingLayer
- `handlePathComplete` is `useCallback` depending on `[canvas, drawColor, drawWidth]` — must re-bind when color/width change so the correct values are captured in the closure

## task_ref block pattern
- Content shape: `{ task_id, task_type, title, status }` — full object stored in JSONB
- `toNode` in the route dispatches on `block.type` to build correct data shape per node type
- `onStatusChange` receives `title` so `updateBlock` can reconstruct the full content without an extra fetch
- `updateTaskStatus` uses the typed `supabase` client directly (not the `db` any-alias) because `personal_tasks` / `org_tasks` exist in generated types
- Status cycle: queued → in_progress → completed → queued; local state is updated immediately, DB write is fire-and-forget (`.catch(console.error)`)
- `handleStatusChange` fires `updateTaskStatus` + `updateBlock` in parallel via `Promise.all`
