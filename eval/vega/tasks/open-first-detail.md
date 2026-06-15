---
id: open-first-detail
max_steps: 20
max_seconds: 120
# Validated live on com.amazondeveloper.keplervideoapp.main: the first item in the first
# home row ("Latest Hits") is "Empire"; opening it shows the "Empire" detail page. Goal
# asserts that page via the header title plus the Play-Movie action test id (present only on
# a movie detail page), so it can't match the title appearing on a card elsewhere.
goal:
  all_of:
    - contains_text: "Empire"
    - contains_text: "details-action-play-movie-btn"
---
From the home screen, open the detail page of the very first item in the first content row.
You are done when that item's detail page is shown — the page header displays the title and
a "Play Movie" button is available.
