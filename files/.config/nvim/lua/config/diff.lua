-- Provides a mergetool.
-- Call :DiffConflicts to convert a file containing conflict markers into a two-way diff.
return {
  "whiteinge/diffconflicts",
  cmd = { "DiffConflicts", "DiffConflictsWithHistory" }
}
