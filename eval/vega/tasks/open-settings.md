---
id: open-settings
max_steps: 25
max_seconds: 120
# Validated live on com.amazondeveloper.keplervideoapp.main: the Settings screen shows a
# "Log out" button, which appears ONLY on Settings (not home/search/detail), so it reliably
# verifies the screen was reached. Focus is intentionally NOT asserted: v0.10.0-vega's
# describe does not report focus state at all, so a focus-based goal would be unachievable on
# that arm and incomparable across versions. Reaching Settings is the navigation task.
goal:
  contains_text: "Log out"
---
From the home screen, navigate to and open the Settings screen. You are done when the
Settings screen is shown — the "Log out" button is visible.