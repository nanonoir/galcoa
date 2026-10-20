import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentTitleEditor } from "./document-title-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const id = "dc6e5bb1-c726-45bb-a048-97810495992b";
const ok = () => vi.fn(async () => Response.json({ outcome: "completed" }));

async function edit(text: string, key = "{Enter}") {
  await userEvent.click(screen.getByRole("button", { name: "Renombrar documento" }));
  const input = screen.getByLabelText("Título del documento");
  await userEvent.clear(input);
  if (text) await userEvent.type(input, text);
  await userEvent.keyboard(key);
}

describe("DocumentTitleEditor", () => {
  beforeEach(() => refresh.mockClear());

  it("muestra el título como h1 con botón para renombrar", () => {
    render(<DocumentTitleEditor documentId={id} title="Mi doc" />);
    expect(screen.getByRole("heading", { level: 1, name: "Mi doc" })).toBeTruthy();
  });

  it("Enter guarda por PATCH y refresca solo tras el éxito", async () => {
    const fetchImpl = ok();
    render(<DocumentTitleEditor documentId={id} title="Mi doc" fetchImpl={fetchImpl as never} />);
    await edit("Nuevo");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/documents/${id}`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ title: "Nuevo" });
  });

  it("Escape cancela sin llamar al servidor", async () => {
    const fetchImpl = ok();
    render(<DocumentTitleEditor documentId={id} title="Mi doc" fetchImpl={fetchImpl as never} />);
    await edit("Otro", "{Escape}");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Mi doc" })).toBeTruthy();
  });

  it("título vacío o sin cambios no llama al servidor", async () => {
    const fetchImpl = ok();
    render(<DocumentTitleEditor documentId={id} title="Mi doc" fetchImpl={fetchImpl as never} />);
    await edit("");
    expect((await screen.findByRole("alert")).textContent).toMatch(/entre 1 y 200/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("tras un 503 no refresca, conserva el título y permite reintentar con éxito", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ outcome: "completed" }));
    render(<DocumentTitleEditor documentId={id} title="Mi doc" fetchImpl={fetchImpl as never} />);
    await edit("Nuevo");
    expect((await screen.findByRole("alert")).textContent).toMatch(/no se guardó/);
    expect(refresh).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([[409, /finalizado/], [500, /No se pudo guardar/]])("error %s: alerta accesible, sin refresh ni éxito falso", async (status, text) => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status }));
    render(<DocumentTitleEditor documentId={id} title="Mi doc" fetchImpl={fetchImpl as never} />);
    await edit("Nuevo");
    expect((await screen.findByRole("alert")).textContent).toMatch(text);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Título del documento")).toBeTruthy();
  });
});
