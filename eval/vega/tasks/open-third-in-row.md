---
id: open-third-in-row
max_steps: 24
max_seconds: 150
# Validated live on com.amazondeveloper.keplervideoapp.main: the third item in the first
# home row opens the "Promises of Tomorrow" detail page. The goal asserts that page via the
# header title plus the stable Play-Movie action test id (present only on a movie detail
# page), so it cannot match the title appearing on a card elsewhere.
goal:
  all_of:
    - contains_text: "Promises of Tomorrow"
    - contains_text: "details-action-play-movie-btn"
---
From the home screen, move focus into the first content row, step right to the third item,
and open it by pressing select. You are done when that item's detail page is shown — the
page header displays the title and a "Play Movie" button is available.
