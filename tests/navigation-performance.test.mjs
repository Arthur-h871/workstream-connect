import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const projectRoot = new URL("../", import.meta.url);

function readProjectFile(relativePath) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

test("authenticated layout owns the persistent AppShell", () => {
  const authenticatedLayout = readProjectFile("./src/routes/_authenticated.tsx");

  assert.match(authenticatedLayout, /import\s+\{\s*AppShell\s*\}\s+from\s+"@\/components\/AppShell"/);
  assert.match(authenticatedLayout, /<AppShell[\s\S]*<Outlet \/>[\s\S]*<\/AppShell>/);
});

test("authenticated child routes no longer render AppShell directly", () => {
  const childRoutes = [
    "./src/routes/_authenticated.dashboard.tsx",
    "./src/routes/_authenticated.admin.membros.tsx",
    "./src/routes/_authenticated.apontamentos.tsx",
    "./src/routes/_authenticated.perfil.tsx",
    "./src/routes/_authenticated.settings.developer.tsx",
    "./src/routes/_authenticated.tarefas.tsx",
    "./src/routes/_authenticated.tarefas-org.tsx",
    "./src/routes/_authenticated.tarefas-org_.$projectId.tsx",
  ];

  for (const routePath of childRoutes) {
    const source = readProjectFile(routePath);
    assert.doesNotMatch(source, /import\s+\{\s*AppShell\s*\}\s+from\s+"@\/components\/AppShell"/);
    assert.doesNotMatch(source, /<AppShell[\s\S]*<\/AppShell>/);
  }
});

test("router enables preload reuse for authenticated navigation", () => {
  const routerSource = readProjectFile("./src/router.tsx");

  assert.doesNotMatch(routerSource, /defaultPreloadStaleTime:\s*0/);
  assert.match(routerSource, /defaultPreloadStaleTime:\s*\d+/);
});

test("sidebar navigation links opt into intent-based preloading", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(appShellSource, /<Link[\s\S]*preload="intent"/);
});

test("notes route declares the immersive shell variant", () => {
  const notesRoute = readProjectFile("./src/routes/_authenticated.notas.tsx");

  assert.match(notesRoute, /shellVariant:\s*"immersive"/);
  assert.match(
    notesRoute,
    /function NotesRoute\(\)\s*\{[\s\S]*<Suspense fallback=\{<NotesRouteFallback \/>\}>[\s\S]*<NotesCanvasPage \/>[\s\S]*<\/Suspense>/,
  );
  assert.match(
    notesRoute,
    /function NotesRouteFallback\(\)\s*\{[\s\S]*className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground"[\s\S]*Carregando canvas\.\.\./,
  );
  assert.doesNotMatch(notesRoute, /<h1 className="text-lg font-semibold">Notas<\/h1>/);
  assert.doesNotMatch(notesRoute, /border-b border-border px-6 py-3/);
});

test("app shell reads route-level shell variant metadata", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(
    appShellSource,
    /type AppShellStaticData = \{[\s\S]*shellVariant\?:\s*"default"\s*\|\s*"immersive"/,
  );
  assert.match(appShellSource, /const shellVariant = useMatches\(/);
});

test("app shell uses a full-height full-width wrapper in immersive mode", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(
    appShellSource,
    /className=\{\s*isImmersive\s*\?\s*"relative h-screen w-full overflow-hidden"\s*:\s*"relative mx-auto max-w-\[1400px\] px-8 py-8"/,
  );
});

test("app shell removes the default header only in immersive mode", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(appShellSource, /const isImmersive = shellVariant === "immersive"/);
  assert.match(
    appShellSource,
    /!\s*isImmersive &&\s*\([\s\S]*<div className="mb-8 flex items-center justify-between">[\s\S]*shellTitle \?\s*\([\s\S]*<h1 className="text-2xl font-semibold tracking-tight">\{shellTitle\}<\/h1>[\s\S]*\)\s*:\s*\([\s\S]*<div \/>[\s\S]*\)[\s\S]*<div className="relative">\{notificationBell\}<\/div>[\s\S]*\)/,
  );
});

test("immersive shell keeps notifications accessible via overlay bell", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.match(appShellSource, /const notificationBell = <NotificationBell \/>;/);
  assert.match(
    appShellSource,
    /isImmersive\s*\?\s*\([\s\S]*<div className="pointer-events-none fixed right-6 top-6 z-40">[\s\S]*<div className="pointer-events-auto relative">\{notificationBell\}<\/div>[\s\S]*<\/div>[\s\S]*\)\s*:\s*null/,
  );
});

test("notification optimistic rollback preserves concurrent notification updates", () => {
  const appShellSource = readProjectFile("./src/components/AppShell.tsx");

  assert.doesNotMatch(appShellSource, /const previous = notifications/);
  assert.doesNotMatch(appShellSource, /setNotifications\(previous\)/);
  assert.match(
    appShellSource,
    /catch\s*\{\s*setNotifications\(\(prev\)\s*=>[\s\S]*n\.id === id && n\.read_at === optimisticReadAt/,
  );
  assert.match(
    appShellSource,
    /catch\s*\{\s*setNotifications\(\(prev\)\s*=>[\s\S]*n\.read_at === optimisticReadAt \? \{ \.\.\.n, read_at: undefined \} : n/,
  );
});

test("notes canvas page no longer renders the old top bar", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");

  assert.doesNotMatch(notesCanvasPage, /border-b border-border px-6 py-3/);
  assert.doesNotMatch(notesCanvasPage, /<h1 className="text-lg font-semibold">Notas<\/h1>/);
  assert.doesNotMatch(notesCanvasPage, /\+ Nova Nota/);
  assert.match(notesCanvasPage, /className="relative h-full bg-background text-foreground"/);
});

test("canvas toolbar exposes a corner dock instead of a centered strip", () => {
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.doesNotMatch(toolbarSource, /left-1\/2 -translate-x-1\/2/);
  assert.match(toolbarSource, /left-4 top-4/);
  assert.match(toolbarSource, /absolute/);
  assert.match(toolbarSource, /z-20/);
  assert.match(toolbarSource, /data-dock-rail/);
  assert.match(toolbarSource, /data-dock-panel/);
  assert.match(toolbarSource, /panelOpen/);
});

test("notes canvas page creates notes via CanvasToolbar instead of a header button", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.match(notesCanvasPage, /<CanvasToolbar[\s\S]*onCreateNote=\{handleAddNote\}/);
  assert.match(notesCanvasPage, /canCreateNote=\{!loading && Boolean\(canvas\)\}/);
  assert.match(notesCanvasPage, /canUseCanvasTools=\{!loading && !loadError && Boolean\(canvas\)\}/);
  assert.doesNotMatch(notesCanvasPage, /<button[\s\S]*\+ Nova Nota[\s\S]*<\/button>/);
  assert.match(toolbarSource, /onCreateNote:\s*\(\)\s*=>\s*void/);
});

test("notes canvas page centers new notes using the immersive canvas viewport bounds", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");

  assert.match(notesCanvasPage, /const viewportRef = useRef<HTMLDivElement \| null>\(null\);/);
  assert.match(
    notesCanvasPage,
    /const viewportRect = viewportRef\.current\?\.getBoundingClientRect\(\);[\s\S]*const center = screenToFlowPosition\(\{[\s\S]*x:\s*\(viewportRect\?\.left \?\? 0\) \+ \(viewportRect\?\.width \?\? window\.innerWidth\) \/ 2,[\s\S]*y:\s*\(viewportRect\?\.top \?\? 0\) \+ \(viewportRect\?\.height \?\? window\.innerHeight\) \/ 2,[\s\S]*\}\);/,
  );
  assert.doesNotMatch(notesCanvasPage, /screenToFlowPosition\(\{\s*x:\s*window\.innerWidth \/ 2,\s*y:\s*window\.innerHeight \/ 2\s*\}\)/);
  assert.match(notesCanvasPage, /<div ref=\{viewportRef\} className="relative h-full bg-background text-foreground">/);
});

test("notes canvas page keeps draw and erase mutually exclusive", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");

  assert.match(
    notesCanvasPage,
    /onToggleDraw=\{\(\)\s*=>\s*\{[\s\S]*setIsDrawingMode\(\(current\)\s*=>\s*!current\);[\s\S]*setIsErasingMode\(false\);[\s\S]*\}\}/,
  );
  assert.match(
    notesCanvasPage,
    /onToggleErase=\{\(\)\s*=>\s*\{[\s\S]*setIsErasingMode\(\(current\)\s*=>\s*!current\);[\s\S]*setIsDrawingMode\(false\);[\s\S]*\}\}/,
  );
});

test("notes canvas page exposes a pointer action to return to default interaction mode", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.match(notesCanvasPage, /<CanvasToolbar[\s\S]*onUsePointer=\{\(\)\s*=>\s*\{/);
  assert.match(
    notesCanvasPage,
    /onUsePointer=\{\(\)\s*=>\s*\{[\s\S]*setIsDrawingMode\(false\);[\s\S]*setIsErasingMode\(false\);[\s\S]*\}\}/,
  );
  assert.match(toolbarSource, /MousePointer/);
  assert.match(toolbarSource, /onUsePointer:\s*\(\)\s*=>\s*void/);
  assert.match(toolbarSource, /title="Modo selecao"/);
});

test("canvas toolbar keeps a visible rail and a collapsible side panel", () => {
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.match(
    toolbarSource,
    /<div className="absolute left-4 top-4 z-20 flex items-start gap-3">[\s\S]*<div[\s\S]*data-dock-rail[\s\S]*\{panelOpen && \(/,
  );
  assert.match(
    toolbarSource,
    /\{panelOpen && \([\s\S]*<div[\s\S]*data-dock-panel[\s\S]*className="min-w-\[240px\] rounded-2xl border border-border bg-surface\/95 p-4 shadow-lg backdrop-blur"/,
  );
  assert.match(toolbarSource, /setPanelOpen\(\(current\) => !current\)/);
});

test("canvas toolbar disables draw and erase interactions until the canvas is usable", () => {
  const notesCanvasPage = readProjectFile("./src/components/notes/NotesCanvasPage.tsx");
  const toolbarSource = readProjectFile("./src/components/canvas/CanvasToolbar.tsx");

  assert.match(toolbarSource, /canUseCanvasTools:\s*boolean/);
  assert.match(
    toolbarSource,
    /onClick=\{\(\) => \{[\s\S]*if \(!canUseCanvasTools\) return;[\s\S]*setPanelView\("draw"\);[\s\S]*onToggleDraw\(\);[\s\S]*\}\}/,
  );
  assert.match(
    toolbarSource,
    /onClick=\{\(\) => \{[\s\S]*if \(!canUseCanvasTools\) return;[\s\S]*setPanelView\("erase"\);[\s\S]*onToggleErase\(\);[\s\S]*\}\}/,
  );
  assert.match(
    toolbarSource,
    /disabled=\{!canUseCanvasTools\}[\s\S]*title=\{isDrawing \? "Sair do desenho" : "Desenhar"\}/,
  );
  assert.match(
    toolbarSource,
    /disabled=\{!canUseCanvasTools\}[\s\S]*title=\{isErasing \? "Sair da borracha" : "Borracha"\}/,
  );
  assert.match(notesCanvasPage, /canUseCanvasTools=\{!loading && !loadError && Boolean\(canvas\)\}/);
});
