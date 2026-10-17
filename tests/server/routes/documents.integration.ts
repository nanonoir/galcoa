import { randomUUID } from "node:crypto";

import { beforeAll, expect, it } from "vitest";

import { createDocumentHttpHandler } from "@/lib/documents/http";
import { createDocumentStore } from "@/lib/documents/persistence/store";
import { verifySession } from "@/lib/supabase/auth";

import { anonClient, createTestUser, readLocalStack, type TestUser } from "../rls/harness";

let a: TestUser;
let b: TestUser;
beforeAll(async () => {
  const stack = readLocalStack();
  a = await createTestUser(stack, "f4-http-a");
  b = await createTestUser(stack, "f4-http-b");
});

function deps(client: TestUser["client"]) {
  return { trustedOrigins: () => ["https://galcoa.test"], async getContext() {
    const session = await verifySession(client);
    return { session, storeForUser: (id: string) => createDocumentStore({ verifiedUserId: id, session: client }) };
  } };
}
function request(body: unknown) {
  return new Request("https://galcoa.test/api/documents", { method: "POST", headers: {
    "Content-Type": "application/json", Origin: "https://galcoa.test",
  }, body: JSON.stringify(body) });
}

it("HTTP real de dominio + Auth/RPC locales: crear, mensaje, reabrir, replay y B aislado", async () => {
  const created = await createDocumentHttpHandler(deps(a.client), "create")(request({ title: "HTTP ficticio", idempotencyKey: randomUUID() }));
  expect(created.status).toBe(200);
  const doc = (await created.json()).result.id;
  const body = { content: " Original HTTP ficticio ", declaredEventDate: { kind: "unknown" }, idempotencyKey: randomUUID() };
  const append = createDocumentHttpHandler(deps(a.client), "append");
  const recorded = await append(request(body), doc);
  expect(recorded.status).toBe(200);
  const message = (await recorded.json()).result;
  const replayed = await append(request(body), doc);
  expect(await replayed.json()).toMatchObject({ replayed: true, result: { messageId: message.messageId } });
  const reopened = await createDocumentHttpHandler(deps(a.client), "messages")(new Request("https://galcoa.test"), doc);
  expect((await reopened.json()).result).toEqual([message]);
  expect((await createDocumentHttpHandler(deps(b.client), "get")(new Request("https://galcoa.test"), doc)).status).toBe(404);
  expect((await createDocumentHttpHandler(deps(b.client), "append")(request(body), doc)).status).toBe(404);
});

it("Auth real sin sesión rechaza antes de persistir", async () => {
  const response = await createDocumentHttpHandler(deps(anonClient(readLocalStack())), "create")(
    request({ title: "No persistir", idempotencyKey: randomUUID() }),
  );
  expect(response.status).toBe(401);
});
