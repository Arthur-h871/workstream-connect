# Notes Immersive Layout Design

## Context

The `/_authenticated/notas` route currently renders inside the default authenticated shell content container. That container adds a centered max-width layout, page padding, and a route header. This works for standard pages, but it is the wrong fit for a canvas-first experience like `notas`.

The result is a nested-page feeling: the notes canvas looks like a smaller window inside the main page instead of occupying the full usable application area beside the primary app sidebar.

## Goal

Make `notas` an immersive route that keeps the primary application sidebar but owns the full remaining viewport area. Inside that area, the notes experience should be composed of:

- the primary application sidebar
- a notes-specific floating and collapsible internal dock
- the notes canvas occupying the rest of the page without extra white space or centered framing

## Non-Goals

- Redesigning the visual language of the whole application shell
- Changing the notes data model or persistence flow
- Reworking React Flow interactions beyond what is necessary to support the new layout
- Introducing new backend APIs

## Chosen Direction

We will implement the equivalent of visual option `B`: a compact floating dock anchored inside the notes page, with a contextual panel that opens beside it when needed.

This keeps the canvas as the primary focus while preserving quick access to notes-specific tools.

## Proposed Architecture

### 1. Add an immersive shell variant

The authenticated shell should support route-level layout variants through route static metadata. Standard routes keep the current centered container and top header. The `notas` route opts into an immersive variant.

The immersive variant must:

- keep the fixed primary sidebar untouched
- remove the global route header for that page
- remove the centered `max-width` content wrapper
- remove the generic top/bottom content padding that creates the current framed look
- provide a full-height content region for the route body

This should be controlled by route metadata, not by ad hoc checks on pathname.

### 2. Let `notas` own the page chrome inside the content area

Once `notas` is marked immersive, the route becomes responsible for its own internal UI chrome.

The page should render:

- a full-height canvas container
- a floating notes dock positioned over the canvas near the top-left of the content area
- a contextual panel that expands from that dock

The page should no longer render a separate in-page top bar that recreates the old shell framing.

### 3. Replace the current top-center toolbar with a dock-based control model

The existing `CanvasToolbar` is a centered floating strip. It should be replaced by a more structured notes dock that supports:

- always-visible compact icon rail
- open/close behavior for the contextual panel
- mode toggles for cursor, draw, and erase
- drawing controls such as color and stroke width inside the panel
- primary actions like creating a note from the dock/panel instead of a dedicated page header button

The dock should be visually lightweight and should not claim permanent canvas width when collapsed.

## Detailed Behavior

### Shell behavior

- `/_authenticated/notas` sets route metadata such as `shellVariant: "immersive"`
- the authenticated shell reads that metadata and changes only the content wrapper behavior
- the primary sidebar remains persistent and unchanged
- notification bell and standard page title are hidden on this route

### Notes page behavior

- the notes page fills the full available height of the shell content region
- the canvas becomes the base layer of the route
- the internal dock overlays the canvas
- the contextual panel opens beside the dock instead of pushing layout
- closing the panel leaves only the compact dock visible

### Dock behavior

- default state: compact icon rail visible
- selecting a tool opens the contextual panel
- selecting the active tool again can collapse the panel
- draw/erase modes remain mutually exclusive
- the create-note action remains available even when the contextual panel is collapsed

## Component Boundaries

### `AppShell`

Responsibilities:

- read route shell metadata
- render standard or immersive content container
- keep the primary application sidebar persistent

Should not:

- contain notes-specific conditionals by route pathname
- own notes tool UI

### `/_authenticated/notas`

Responsibilities:

- declare immersive shell metadata
- render the route-specific notes experience

### Notes route UI components

Suggested split:

- `NotesCanvasPage`
  - owns route layout and data loading
- `NotesDock`
  - compact icon rail and open/close state
- `NotesDockPanel`
  - contextual controls for selected dock section

This keeps the route shell concern separate from the page-specific controls.

## Error and Loading States

- immersive loading fallback for `notas` must also use the full-page canvas layout style
- load errors should appear centered inside the canvas area without restoring the old framed page layout
- dock controls that depend on canvas readiness should be visibly disabled while loading

## Testing Strategy

### Manual checks

- navigate into `notas` from another authenticated route
- confirm the route occupies the full content area without centered framing
- confirm the global shell header does not render on `notas`
- confirm the primary sidebar remains visible and stable
- confirm the dock floats over the canvas and collapses cleanly
- confirm create note, draw mode, erase mode, color selection, and stroke width still work

### Automated checks

- route/layout test proving `notas` declares the immersive shell variant
- shell test proving immersive routes do not render the standard page header wrapper
- regression test ensuring standard authenticated routes still use the default shell layout

## Risks

- if the shell variant API is too route-specific, it may become another special-case escape hatch
- if the immersive content region height is not defined carefully, the canvas can end up with double scroll or clipped controls
- moving primary actions from the page header into the dock can create discoverability regressions if the default dock state is too subtle

## Recommendation

Implement the immersive shell variant first, then refactor the notes page onto the new full-height surface, and only then replace the existing toolbar with the dock/panel structure.

That order minimizes layout confusion and makes it easier to verify whether each change fixed the intended problem before the next layer is added.
