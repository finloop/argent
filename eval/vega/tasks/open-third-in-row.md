---
id: open-third-in-row
max_steps: 24
max_seconds: 150
# PROVISIONAL — validate against the live Kepler app before trusting numbers (plan step 3).
# Deeper navigation than open-first-detail: requires counting across a row.
goal:
  any_of:
    - contains_text: "Play"
    - contains_text: "Watch"
  role: button
---
From the home screen, move along the first content row to the third item and open its
detail page. You are done when the third title's detail page is shown with a Play/Watch
action available.
