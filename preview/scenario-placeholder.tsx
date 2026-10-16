import { Button } from "@/components/ui/button";

export interface PlaceholderCallback {
  name: string;
  run: () => void;
}

/**
 * Marcador del preview: vuelca el escenario como JSON para que quien implemente
 * la presentación vea los datos reales de su contrato. NO es la UI del producto
 * ni cuenta como implementada (MVP-111…115 la reemplazan al conectar su entrada).
 */
export function ScenarioPlaceholder({ title, data, callbacks = [] }: { title: string; data: unknown; callbacks?: readonly PlaceholderCallback[] }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <p role="status" className="rounded-md border border-dashed px-3 py-2 text-sm">
        <strong>Placeholder de escenario:</strong> {title}. Muestra el contrato como JSON; la presentación final aún no está implementada.
      </p>
      <pre data-testid="scenario-json" className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
        {JSON.stringify(data, null, 2)}
      </pre>
      {callbacks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {callbacks.map((c) => (
            <Button key={c.name} size="sm" variant="outline" onClick={c.run}>
              {c.name}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
