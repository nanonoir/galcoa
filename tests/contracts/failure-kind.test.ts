import { describe, expect, it } from "vitest";

import { failureKind } from "@/features/documents/containers/failure-kind";

describe("failureKind (MVP-116)", () => {
  it.each([
    ["NO_SESSION", "unauthenticated"],
    ["NOT_AVAILABLE", "not_found"],
    ["TECHNICAL_FAILURE", "technical"],
    ["INVALID_INPUT", "technical"],
    ["", "technical"],
  ])("%s → %s", (code, expected) => {
    expect(failureKind({ code })).toBe(expected);
  });
});
