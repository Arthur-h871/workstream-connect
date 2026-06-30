import { createFileRoute } from "@tanstack/react-router";
import { Suspense, lazy } from "react";

const NotesCanvasPage = lazy(() =>
  import("@/components/notes/NotesCanvasPage").then((module) => ({
    default: module.NotesCanvasPage,
  })),
);

export const Route = createFileRoute("/_authenticated/notas")({
  staticData: {
    shellVariant: "immersive",
  },
  component: NotesRoute,
});

function NotesRoute() {
  return (
    <Suspense fallback={<NotesRouteFallback />}>
      <NotesCanvasPage />
    </Suspense>
  );
}

function NotesRouteFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
      Carregando canvas...
    </div>
  );
}
