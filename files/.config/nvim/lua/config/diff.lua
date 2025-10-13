return {
  -- Provides a mergetool.
  -- Call :DiffConflicts to convert a file containing conflict markers into a two-way diff.
  {
    "whiteinge/diffconflicts",
    cmd = { "DiffConflicts", "DiffConflictsWithHistory" }
  },
  {
    "rafikdraoui/jj-diffconflicts",
    cmd = "JJDiffConflicts"
  }
}
