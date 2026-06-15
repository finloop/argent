---
id: open-first-detail
max_steps: 20
max_seconds: 120
# PROVISIONAL — validate against the live Kepler app before trusting numbers (plan step 3).
goal:
  any_of:
    - contains_text: "Play"
    - contains_text: "Watch"
  role: button
---
From the home screen, open the detail page of the very first item in the first content row.
You are done when that title's detail page is shown with a Play/Watch action available.
