# Notes Immersive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/_authenticated/notas` occupy the full authenticated content area with an immersive shell variant and a floating/collapsible dock over the canvas.

**Architecture:** Add route-level shell metadata so `AppShell` can switch between the current centered layout and an immersive full-height layout. Then migrate the notes route to declare the immersive variant and replace the current top-center toolbar/top bar with a dock-and-panel UI that overlays the canvas without reintroducing framed spacing.

**Tech Stack:** React, TanStack Router, TypeScript, Tailwind CSS, React Flow, Node test runner

---

## File Map

- Modify: `src/components/AppShell.tsx`
  - Add route-level shell variant support and immersive content wrapper behavior.
- Modify: `src/routes/_authenticated.notas.tsx`
  - Declare immersive shell metadata and align the suspense fallback with the new full-page notes layout.
- Modify: `src/components/notes/NotesCanvasPage.tsx`
  - Remove the in-page top bar and host the new floating notes dock over the full-height canvas.
- Modify: `src/components/canvas/CanvasToolbar.tsx`
  - Replace the centered toolbar strip with a compact dock + contextual panel API.
- Modify: `tests/navigation-performance.test.mjs`
  - Add regression checks for immersive shell metadata and the notes-specific shell layout.

## Task 1: Add Immersive Shell Variant Support

**Files:**
- Modify: `tests/navigation-performance.test.mjs`
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Write the failing regression tests for immersive shell routing**

```js
test("notes route declares the immersive shell variant", () => {
  const notesRoute = readProjectFile("./src/routes/_authenticated.notas.tsx");

  assert.match(notesRoute, /shellVariant:\s*"immersive"/);
});

test("app shell reads route-level shell variant metadata", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(appShellSource, /type AppShellStaticData = \{[\s\S]*shellVariant\?:\s*"default"\s*\|\s*"immersive"/);
  assert.match(appShellSource, /const shellVariant = useMatches\(/);
});
```

- [ ] **Step 2: Run the navigation regression suite and verify it fails for the missing shell variant**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: FAIL because the notes route does not yet declare `shellVariant: "immersive"` and `AppShell` does not yet read that metadata.

- [ ] **Step 3: Implement the shell variant metadata flow in `AppShell`**

```tsx
type AppShellStaticData = {
  shellTitle?: string;
  shellVariant?: "default" | "immersive";
};

const shellVariant = useMatches({
  select: (matches) => {
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const variant = (matches[index].staticData as AppShellStaticData | undefined)?.shellVariant;
      if (variant) return variant;
    }
    return "default" as const;
  },
});

const isImmersive = shellVariant === "immersive";
```

```tsx
<main className="ml-60 flex-1">
  <div
    className={
      isImmersive
        ? "relative h-screen overflow-hidden"
        : "relative mx-auto max-w-[1400px] px-8 py-8"
    }
  >
    <PendingIndicator />
    {!isImmersive && shellTitle && (
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{shellTitle}</h1>
        <div className="relative">
          <NotificationBell />
        </div>
      </div>
    )}
    {children}
  </div>
</main>
```

- [ ] **Step 4: Re-run the navigation regression suite and verify it passes**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: PASS for the new shell variant assertions and the existing persistent-shell assertions.

## Task 2: Switch `notas` to the immersive route surface

**Files:**
- Modify: `tests/navigation-performance.test.mjs`
- Modify: `src/routes/_authenticated.notas.tsx`

- [ ] **Step 1: Write the failing regression test for the notes route fallback/layout contract**

```js
test("notes route renders with immersive fallback layout", () => {
  const notesRoute = readProjectFile("./src/routes/_authenticated.notas.tsx");

  assert.match(notesRoute, /shellVariant:\s*"immersive"/);
  assert.doesNotMatch(notesRoute, /border-b border-border px-6 py-3/);
  assert.match(notesRoute, /Carregando canvas\.\.\./);
});
```

- [ ] **Step 2: Run the targeted test file and verify the new fallback assertion fails**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: FAIL because the fallback still renders the old framed header strip.

- [ ] **Step 3: Declare the immersive shell metadata and simplify the route fallback**

```tsx
export const Route = createFileRoute("/_authenticated/notas")({
  staticData: {
    shellVariant: "immersive",
  },
  component: NotesRoute,
});
```

```tsx
function NotesRouteFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando canvas...
    </div>
  );
}
```

- [ ] **Step 4: Re-run the navigation regression suite and verify it passes**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: PASS with the notes route now opting into the immersive shell and no longer rendering the framed fallback header.

## Task 3: Replace the notes top chrome with a floating dock

**Files:**
- Modify: `src/components/canvas/CanvasToolbar.tsx`
- Modify: `src/components/notes/NotesCanvasPage.tsx`
- Test: `tests/navigation-performance.test.mjs`

- [ ] **Step 1: Write the failing regression tests for the dock-based notes UI**

```js
test("notes canvas page no longer renders the old top bar", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");

  assert.doesNotMatch(notesCanvasPage, /border-b border-border px-6 py-3/);
  assert.doesNotMatch(notesCanvasPage, /\+ Nova Nota/);
});

test("canvas toolbar exposes a dock layout instead of a centered strip", () => {
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.doesNotMatch(toolbarSource, /left-1\/2 -translate-x-1\/2/);
  assert.match(toolbarSource, /left-4 top-4/);
});
```

- [ ] **Step 2: Run the navigation regression suite and verify it fails for the old notes chrome**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: FAIL because `NotesCanvasPage` still renders the top bar and `CanvasToolbar` is still centered.

- [ ] **Step 3: Refactor the notes page and toolbar to the dock model**

```tsx
type CanvasToolbarProps = {
  canCreateNote: boolean;
  isDrawing: boolean;
  isErasing: boolean;
  color: string;
  strokeWidth: number;
  onCreateNote: () => void;
  onToggleDraw: () => void;
  onToggleErase: () => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
};
```

```tsx
<CanvasToolbar
  canCreateNote={!loading && Boolean(canvas)}
  isDrawing={isDrawingMode}
  isErasing={isErasingMode}
  color={drawColor}
  strokeWidth={drawWidth}
  onCreateNote={handleAddNote}
  onToggleDraw={() => {
    setIsDrawingMode((current) => !current);
    setIsErasingMode(false);
  }}
  onToggleErase={() => {
    setIsErasingMode((current) => !current);
    setIsDrawingMode(false);
  }}
  onColorChange={setDrawColor}
  onWidthChange={setDrawWidth}
/>
```

```tsx
return (
  <div className="relative h-full bg-background text-foreground">
    <CanvasToolbar ... />
    {loading ? (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Carregando canvas...
      </div>
    ) : loadError ? (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
        <p className="text-destructive">Erro ao carregar o canvas.</p>
        <button
          onClick={loadCanvas}
          className="text-xs text-muted-foreground underline hover:text-foreground"
        >
          Tentar novamente
        </button>
      </div>
    ) : (
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={(_event, node) => handleNodeDragStop(node)}
        onConnect={handleConnect}
        onEdgeClick={handleEdgeClick}
        connectionMode={ConnectionMode.Loose}
        defaultEdgeOptions={{ type: "smoothstep" }}
        nodeTypes={nodeTypes}
        nodesDraggable={!isDrawingMode && !isErasingMode}
        panOnDrag={!isDrawingMode && !isErasingMode}
        panOnScroll={!isDrawingMode && !isErasingMode}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
    )}
    <DrawingLayer
      drawings={drawings}
      isDrawing={isDrawingMode}
      isErasing={isErasingMode}
      color={drawColor}
      strokeWidth={drawWidth}
      onPathComplete={handlePathComplete}
      onPathDelete={handlePathDelete}
    />
  </div>
);
```

The dock implementation should:

- anchor to the top-left corner with `left-4 top-4`
- keep a compact icon rail always visible
- open a contextual panel beside the rail for draw/erase options
- expose the create-note action from the rail or panel without restoring a page header

- [ ] **Step 4: Run the regression tests and verify the dock assertions pass**

Run: `node --test tests/navigation-performance.test.mjs`
Expected: PASS with the old notes top bar removed and the toolbar no longer centered.

- [ ] **Step 5: Run the production build smoke test**

Run: `npm run build`
Expected: PASS with the immersive shell and notes dock compiling successfully.

## Task 4: Final verification and cleanup

**Files:**
- Verify only

- [ ] **Step 1: Run the full regression commands used for this change**

Run: `node --test tests/auth-ssr.test.mjs tests/navigation-performance.test.mjs`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Manual verification checklist**

Run these checks locally in the browser:

- Navigate `Dashboard -> Notas` and confirm the route fills the full content area beside the app sidebar.
- Confirm the global shell title/notificações header does not render on `notas`.
- Confirm the notes dock floats over the canvas and can collapse back to the compact rail.
- Confirm `Nova nota`, desenho, borracha, cor, and stroke width still work.
- Confirm leaving `notas` and returning to another authenticated page still shows the default shell header/layout.

- [ ] **Step 3: Commit the implementation**

```bash
git add src/components/AppShell.tsx src/routes/_authenticated.notas.tsx src/components/notes/NotesCanvasPage.tsx src/components/canvas/CanvasToolbar.tsx tests/navigation-performance.test.mjs
git commit -m "feat: make notes route immersive"
```
