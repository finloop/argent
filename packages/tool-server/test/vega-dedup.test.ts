import { describe, it, expect } from "vitest";
import { vegaSerialMatchesAdbSerial, filterVvdShadowsFromAndroid } from "../src/utils/vega-devices";

describe("vegaSerialMatchesAdbSerial", () => {
  it("matches a Vega serial to its adb-reported hardware serial across prefixes", () => {
    // `vega device list` reports `amazon-<id>`; adb reports the bare id.
    expect(vegaSerialMatchesAdbSerial("amazon-4a27df03c9777152", "4a27df03c9777152")).toBe(true);
    expect(vegaSerialMatchesAdbSerial("amazon-4a27df03c9777152", "emulator-4a27df03c9777152")).toBe(
      true
    );
  });

  it("does not match unrelated serials (genuine Android emulator)", () => {
    expect(vegaSerialMatchesAdbSerial("amazon-4a27df03c9777152", "EMU30X9KQ")).toBe(false);
    expect(vegaSerialMatchesAdbSerial("amazon-4a27df03c9777152", "")).toBe(false);
  });

  it("rejects too-short serials to avoid trivial substring collisions", () => {
    expect(vegaSerialMatchesAdbSerial("amazon-abc", "abc")).toBe(false);
  });
});

describe("filterVvdShadowsFromAndroid", () => {
  const android = [
    { serial: "emulator-5554" }, // the VVD shadow
    { serial: "emulator-5556" }, // a genuine standalone Android emulator
  ];

  it("drops only the rows whose adb serial was resolved to a VVD", () => {
    const out = filterVvdShadowsFromAndroid(android, new Set(["emulator-5554"]));
    expect(out).toEqual([{ serial: "emulator-5556" }]);
  });

  it("leaves the list untouched when no VVD shadows were resolved", () => {
    expect(filterVvdShadowsFromAndroid(android, new Set())).toEqual(android);
  });
});
