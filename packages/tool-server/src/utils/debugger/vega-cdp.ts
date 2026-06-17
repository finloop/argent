/**
 * Shared failure-handling for the CDP-injected discovery tools
 * (`debugger-component-tree`, `debugger-inspect-element`).
 *
 * These tools have no `capability` block — they're host-side CDP and gate-open on
 * every platform — but their injected scripts use constructs (bare `global`, some
 * iterators) that certain Hermes builds reject. The prime example is Vega
 * (Fire TV) Hermes (RN 0.72): the component-tree binding times out, and the
 * inspector throws a `_internalInstanceHandle` TypeError. On Vega the CDP
 * connection is addressed by Metro's logicalDeviceId (e.g. "0"), not the
 * `amazon-…` serial, so we can't gate by device id; instead we recognise the
 * failure signatures and return a clean, actionable message pointing at
 * `debugger-evaluate`, rather than a raw timeout / TypeError.
 */

/** The component-tree binding times out when the runtime can't run the script. */
export function isBindingTimeout(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Binding response for requestId=.* timed out/.test(msg);
}

/** The inspector throws this reading `_internalInstanceHandle` of an absent instance. */
export function isInternalInstanceHandleError(text: string): boolean {
  return text.includes("_internalInstanceHandle");
}

export const COMPONENT_TREE_UNRESPONSIVE_HINT =
  "Error: the component-tree script did not respond (the runtime binding timed out). " +
  "If the app is mid-navigation or Metro is busy, retry. This tool is also unsupported on " +
  "Vega (Fire TV): its injected script uses constructs (bare `global`, some iterators) that " +
  "Vega's Hermes rejects. Use `debugger-evaluate` (with `globalThis`) to read runtime state, " +
  "or `describe` for the element tree. See the argent-vega skill.";

export const INSPECT_ELEMENT_UNSUPPORTED_HINT =
  "Could not inspect a component at this point: the inspector returned no instance " +
  "(`getInspectorDataForViewAtPoint` -> undefined `_internalInstanceHandle`). Tap a point " +
  "directly over a component, or — on Vega (Fire TV), where this tool is unsupported — use " +
  "`describe` for the element tree and `debugger-evaluate` to read state. See the argent-vega skill.";
