import { describe, it, expect } from "vitest";
import {
  isBindingTimeout,
  isInternalInstanceHandleError,
  COMPONENT_TREE_UNRESPONSIVE_HINT,
  INSPECT_ELEMENT_UNSUPPORTED_HINT,
} from "../src/utils/debugger/vega-cdp";

describe("isBindingTimeout", () => {
  it("matches the component-tree binding-timeout signature", () => {
    expect(isBindingTimeout(new Error("Binding response for requestId=abc-123 timed out"))).toBe(
      true
    );
  });

  it("ignores unrelated CDP errors", () => {
    expect(isBindingTimeout(new Error("CDP request Runtime.evaluate (id=4) timed out"))).toBe(
      false
    );
    expect(isBindingTimeout(new Error("connection closed"))).toBe(false);
  });
});

describe("isInternalInstanceHandleError", () => {
  it("matches the inspector TypeError seen on Vega Hermes", () => {
    expect(
      isInternalInstanceHandleError(
        "TypeError: Cannot read property '_internalInstanceHandle' of undefined"
      )
    ).toBe(true);
  });

  it("does not match unrelated inspector errors", () => {
    expect(isInternalInstanceHandleError("No component found at point")).toBe(false);
  });
});

describe("Vega-aware hints", () => {
  it("point users to debugger-evaluate instead of a raw timeout/TypeError", () => {
    expect(COMPONENT_TREE_UNRESPONSIVE_HINT).toMatch(/debugger-evaluate/);
    expect(COMPONENT_TREE_UNRESPONSIVE_HINT).toMatch(/Vega/);
    expect(INSPECT_ELEMENT_UNSUPPORTED_HINT).toMatch(/debugger-evaluate/);
    expect(INSPECT_ELEMENT_UNSUPPORTED_HINT).toMatch(/Vega/);
  });
});
