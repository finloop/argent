import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesGoal, describeToText } from "./goal.ts";

const TREE = `
window
  tablist
    tab "Home" [selected]
    tab "Movies"
  row
    button "Play" [focused] frame=[0.1,0.2,0.3,0.4]
    button "More info"
  text "Network settings"
`;

test("contains_text matches a substring on any line", () => {
  assert.equal(matchesGoal(TREE, { contains_text: "Network" }), true);
  assert.equal(matchesGoal(TREE, { contains_text: "Nonexistent" }), false);
});

test("scalar keys must hold on the SAME line", () => {
  // "Play" is focused → ok
  assert.equal(matchesGoal(TREE, { contains_text: "Play", focused: true }), true);
  // "Movies" exists but is not focused; no single line has both
  assert.equal(matchesGoal(TREE, { contains_text: "Movies", focused: true }), false);
});

test("role + selected on the same tab line", () => {
  assert.equal(matchesGoal(TREE, { role: "tab", selected: true }), true);
});

test("any_of / all_of compose", () => {
  assert.equal(
    matchesGoal(TREE, { any_of: [{ contains_text: "Watch" }, { contains_text: "Play" }] }),
    true
  );
  assert.equal(
    matchesGoal(TREE, { all_of: [{ contains_text: "Play" }, { contains_text: "Movies" }] }),
    true
  );
  assert.equal(
    matchesGoal(TREE, { all_of: [{ contains_text: "Play" }, { contains_text: "Nope" }] }),
    false
  );
});

test("describeToText pulls from {description} and {source} shapes", () => {
  assert.equal(describeToText({ description: "hello" }), "hello");
  assert.equal(describeToText({ source: "<xml/>" }), "<xml/>");
  assert.equal(describeToText("plain"), "plain");
});
