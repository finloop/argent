---
id: search-nyla
max_steps: 45
max_seconds: 240
# Validated live on com.amazondeveloper.keplervideoapp.main: opening Search and typing
# "Nyla" on the on-screen keyboard surfaces a "Nyla - (02:36)" result card. The goal asserts
# that result row — the " - (mm:ss)" suffix is the result-card format, absent from the search
# query field (which shows just "Nyla") and from a fresh home screen — so it confirms the
# search RESULT appeared, not merely that the query was typed.
# Longest task: keyboard navigation dominates (A–Z grid, one letter at a time).
goal:
  contains_text: "Nyla - (02:36)"
---
Open the Search screen, then use the on-screen keyboard to type the query "Nyla". You are
done when the search results show the "Nyla" video — a result card titled "Nyla" with its
duration.
