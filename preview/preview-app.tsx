import { useState } from "react";

import { Button } from "@/components/ui/button";

import { previewEntries, type LocalHandlers } from "./registry";

/** Arnés del preview: banner de datos ficticios, selector de escenarios y eventos locales. */
export function PreviewApp() {
  const [entryId, setEntryId] = useState(previewEntries[0].id);
  const entry = previewEntries.find((e) => e.id === entryId) ?? previewEntries[0];
  const [scenarioId, setScenarioId] = useState(entry.scenarios[0].id);
  const [events, setEvents] = useState<string[]>([]);

  const log = (message: string) => setEvents((current) => [message, ...current].slice(0, 20));
  const handlers: LocalHandlers = {
    onCreate: () => log("onCreate()"),
    onOpen: (documentId) => log(`onOpen("${documentId}")`),
    onRetry: () => log("onRetry()"),
    log,
  };

  const selectEntry = (id: string) => {
    const next = previewEntries.find((e) => e.id === id) ?? previewEntries[0];
    setEntryId(next.id);
    setScenarioId(next.scenarios[0].id);
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <div role="note" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
        <strong>Datos ficticios — preview local.</strong> No es la aplicación: no hay sesión, servidor ni persistencia, y el estado se pierde al
        recargar.
      </div>

      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Preview de presentación</h1>
        {previewEntries.length > 1 && (
          <div role="group" aria-label="Componente" className="flex flex-wrap gap-2">
            {previewEntries.map((e) => (
              <Button key={e.id} size="sm" variant={e.id === entry.id ? "default" : "outline"} aria-pressed={e.id === entry.id} onClick={() => selectEntry(e.id)}>
                {e.label}
              </Button>
            ))}
          </div>
        )}
        <div role="group" aria-label="Escenario" className="flex flex-wrap gap-2">
          {entry.scenarios.map((s) => (
            <Button key={s.id} size="sm" variant={s.id === scenarioId ? "default" : "outline"} aria-pressed={s.id === scenarioId} onClick={() => setScenarioId(s.id)}>
              {s.label}
            </Button>
          ))}
        </div>
      </header>

      <main data-testid="preview-stage" className="rounded-xl border p-4">
        {entry.render(scenarioId, handlers)}
      </main>

      <aside aria-labelledby="events-title" className="text-sm">
        <h2 id="events-title" className="font-medium">
          Eventos locales de demostración
        </h2>
        <p className="text-xs text-muted-foreground">Solo registran la llamada al callback; no abren, crean ni finalizan nada real.</p>
        <ul aria-live="polite" className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {events.length === 0 ? <li className="text-muted-foreground">Sin eventos</li> : events.map((e, i) => <li key={`${events.length - i}`}>{e}</li>)}
        </ul>
      </aside>
    </div>
  );
}
