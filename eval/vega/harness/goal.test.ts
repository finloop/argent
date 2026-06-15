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

// Parent-focus + child-text: [focused] on the button, label on a child line. Also a
// phantom [focused] node (the search overlay) whose subtree lacks the target text.
const NESTED = `
button id="14" [focused,selected]
  text "Search"
button id="1064" [focused]
  text "Log out"
`;

test("focused matches when the label is a child of the focused element", () => {
  assert.equal(matchesGoal(NESTED, { contains_text: "Log out", focused: true }), true);
});

test("focused does not match a focused node whose subtree lacks the text", () => {
  // "Search" is under the focused overlay node, "Log out" under the other — neither focused
  // node has BOTH, so a wrong pairing must not match.
  assert.equal(matchesGoal(NESTED, { contains_text: "Settings", focused: true }), false);
});

test("describeToText pulls from {description} and {source} shapes", () => {
  assert.equal(describeToText({ description: "hello" }), "hello");
  assert.equal(describeToText({ source: "<xml/>" }), "<xml/>");
  assert.equal(describeToText("plain"), "plain");
});
