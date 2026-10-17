"use client";

import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_TITLE = 200;

type Props = {
  documentId: string;
  title: string;
  /** Inyectable para pruebas. */
  fetchImpl?: typeof fetch;
};

function messageFor(status: number): string {
  if (status === 409) return "El documento ya está finalizado: no se puede renombrar.";
  if (status === 401) return "Tu sesión expiró. Volvé a ingresar.";
  if (status === 400) return "El título debe tener entre 1 y 200 caracteres.";
  if (status === 404) return "No se encontró el documento.";
  return "No se pudo guardar el título. Reintentá.";
}

/** Título editable del documento (demo P3). Sin éxito optimista: refresca tras confirmar el servidor. */
export function DocumentTitleEditor({ documentId, title, fetchImpl }: Props) {
  const router = useRouter();
  const errorId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  function start() {
    cancelled.current = false;
    setDraft(title);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    cancelled.current = true;
    setEditing(false);
    setError(null);
  }

  async function save() {
    if (saving || cancelled.current) return;
    const next = draft.trim();
    if (next === title) return setEditing(false);
    if (next.length < 1 || next.length > MAX_TITLE) return setError(messageFor(400));
    setSaving(true);
    setError(null);
    try {
      const response = await (fetchImpl ?? fetch)(`/api/documents/${documentId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!response.ok) return setError(messageFor(response.status));
      setEditing(false);
      router.refresh();
    } catch {
      setError(messageFor(0));
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="page-title">{title}</h1>
        <Button type="button" variant="ghost" size="icon" aria-label="Renombrar documento" onClick={start}>
          <Pencil aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-1" noValidate>
      <Input
        autoFocus
        value={draft}
        maxLength={MAX_TITLE}
        disabled={saving}
        aria-label="Título del documento"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="h-auto text-2xl font-medium tracking-tight md:text-3xl"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => void save()}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {saving ? "Guardando…" : "Enter para guardar, Esc para cancelar."}
      </p>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
