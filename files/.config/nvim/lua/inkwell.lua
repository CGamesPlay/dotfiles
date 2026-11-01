-- Inkwell colorschemes (linen, cotton), built from the sRGB-clamped Inkwell
-- palettes. Every hue family has the same steps, from lightest (00) to
-- darkest (40); light and dark mode use the same family for each role but
-- different steps. The variant follows 'background'.

local M = {}

M.palettes = {
  linen = {
    neutral = { ["00"] = "#fffaf3", ["01"] = "#faf3ec", ["02"] = "#f6ede5", ["04"] = "#ece0d8", ["08"] = "#d8c7bf", ["12"] = "#c3afa7", ["16"] = "#ad9892", ["20"] = "#97817f", ["24"] = "#806c6d", ["28"] = "#68585e", ["32"] = "#51454f", ["36"] = "#3a3242", ["38"] = "#2e2a3c", ["39"] = "#292539", ["40"] = "#232136" },
    red = { ["01"] = "#fff2ea", ["02"] = "#ffeae1", ["04"] = "#ffd9cf", ["08"] = "#ffb6aa", ["12"] = "#ff9085", ["16"] = "#f86863", ["20"] = "#d85756", ["24"] = "#b9464a", ["28"] = "#9b353f", ["32"] = "#7e2434", ["36"] = "#5d1a2e", ["38"] = "#4c172b", ["39"] = "#44152a", ["40"] = "#3c1329" },
    orange = { ["01"] = "#fff2e6", ["02"] = "#ffebd9", ["04"] = "#ffdbbe", ["08"] = "#ffba85", ["12"] = "#ff963f", ["16"] = "#ee7800", ["20"] = "#d0640d", ["24"] = "#b35113", ["28"] = "#963e15", ["32"] = "#7a2d15", ["36"] = "#5b201b", ["38"] = "#4a1c1e", ["39"] = "#42191f", ["40"] = "#3a171f" },
    yellow = { ["01"] = "#fbf4e4", ["02"] = "#f7eed6", ["04"] = "#f0e2b9", ["08"] = "#e2ca78", ["12"] = "#d6b000", ["16"] = "#c09800", ["20"] = "#a98000", ["24"] = "#926a00", ["28"] = "#7a5600", ["32"] = "#624200", ["36"] = "#4a3004", ["38"] = "#3c2810", ["39"] = "#352413", ["40"] = "#2f2116" },
    green = { ["01"] = "#f6f6e8", ["02"] = "#edf1de", ["04"] = "#dae9c9", ["08"] = "#b1d99e", ["12"] = "#81ca71", ["16"] = "#6ab25b", ["20"] = "#5d994f", ["24"] = "#4c8143", ["28"] = "#396b39", ["32"] = "#235530", ["36"] = "#11402b", ["38"] = "#09352a", ["39"] = "#063029", ["40"] = "#032a28" },
    sky = { ["01"] = "#f3f6f0", ["02"] = "#e7f2ec", ["04"] = "#cee9e6", ["08"] = "#93d9de", ["12"] = "#32c9da", ["16"] = "#01b1c6", ["20"] = "#0098af", ["24"] = "#007f99", ["28"] = "#006783", ["32"] = "#00506e", ["36"] = "#003a59", ["38"] = "#002f4f", ["39"] = "#002a4a", ["40"] = "#002545" },
    blue = { ["01"] = "#f6f4f4", ["02"] = "#eeeef4", ["04"] = "#dce2f5", ["08"] = "#b7cafc", ["12"] = "#92b1ff", ["16"] = "#7899f0", ["20"] = "#6983d1", ["24"] = "#586db6", ["28"] = "#45579d", ["32"] = "#324287", ["36"] = "#212f6e", ["38"] = "#1a2660", ["39"] = "#162159", ["40"] = "#131d52" },
    violet = { ["01"] = "#fcf2f2", ["02"] = "#f9eaf1", ["04"] = "#f2daf0", ["08"] = "#e5b9f0", ["12"] = "#d796f3", ["16"] = "#c17dde", ["20"] = "#a869c1", ["24"] = "#8f56a8", ["28"] = "#764391", ["32"] = "#5e307c", ["36"] = "#452065", ["38"] = "#381a59", ["39"] = "#321753", ["40"] = "#2b134d" },
    pink = { ["01"] = "#fff1ee", ["02"] = "#ffe9e9", ["04"] = "#ffd7df", ["08"] = "#ffb0cf", ["12"] = "#fe85c2", ["16"] = "#e76bad", ["20"] = "#c95a97", ["24"] = "#ac4882", ["28"] = "#903770", ["32"] = "#74255f", ["36"] = "#56194e", ["38"] = "#461546", ["39"] = "#3f1242", ["40"] = "#37103e" },
  },
  cotton = {
    neutral = { ["00"] = "#fcffff", ["01"] = "#f5f9fe", ["02"] = "#eff3f8", ["04"] = "#e1e8eb", ["08"] = "#c8d0d3", ["12"] = "#afb9bc", ["16"] = "#98a1a6", ["20"] = "#818b91", ["24"] = "#6c747d", ["28"] = "#585f6a", ["32"] = "#454958", ["36"] = "#333546", ["38"] = "#2b2b3e", ["39"] = "#27263a", ["40"] = "#232136" },
    red = { ["01"] = "#f6f9fe", ["02"] = "#f7f1f4", ["04"] = "#f7e0e2", ["08"] = "#f5bfbd", ["12"] = "#f29c9a", ["16"] = "#e9797a", ["20"] = "#c8686b", ["24"] = "#a9575d", ["28"] = "#8b464f", ["32"] = "#6f3542", ["36"] = "#542435", ["38"] = "#481c2f", ["39"] = "#42172c", ["40"] = "#3c1329" },
    orange = { ["01"] = "#f6f9fd", ["02"] = "#f5f2f0", ["04"] = "#f2e4d7", ["08"] = "#edc6a4", ["12"] = "#e7a770", ["16"] = "#de883d", ["20"] = "#c0743b", ["24"] = "#a26038", ["28"] = "#864d33", ["32"] = "#6b3b2e", ["36"] = "#522927", ["38"] = "#462023", ["39"] = "#401b21", ["40"] = "#3a171f" },
    yellow = { ["01"] = "#f5fafd", ["02"] = "#eff4f0", ["04"] = "#e4ead6", ["08"] = "#d0d3a0", ["12"] = "#bfbc65", ["16"] = "#b0a317", ["20"] = "#998b1b", ["24"] = "#82741e", ["28"] = "#6c5e1e", ["32"] = "#57481d", ["36"] = "#42341a", ["38"] = "#382a18", ["39"] = "#332517", ["40"] = "#2f2116" },
    green = { ["01"] = "#f4fafe", ["02"] = "#e9f6f4", ["04"] = "#d3eee1", ["08"] = "#a5debb", ["12"] = "#73cd96", ["16"] = "#38bb73", ["20"] = "#2da165", ["24"] = "#228758", ["28"] = "#196f4c", ["32"] = "#10573f", ["36"] = "#084034", ["38"] = "#05352e", ["39"] = "#04302b", ["40"] = "#032a28" },
    sky = { ["01"] = "#f4faff", ["02"] = "#e6f6fc", ["04"] = "#caeef6", ["08"] = "#8bdeec", ["12"] = "#2ecce3", ["16"] = "#00b3cc", ["20"] = "#0099b3", ["24"] = "#00819b", ["28"] = "#006884", ["32"] = "#00516e", ["36"] = "#003b59", ["38"] = "#00304f", ["39"] = "#002a4a", ["40"] = "#002545" },
    blue = { ["01"] = "#f5f9ff", ["02"] = "#ebf4ff", ["04"] = "#d6e9ff", ["08"] = "#aed2ff", ["12"] = "#85baff", ["16"] = "#5aa0ff", ["20"] = "#4989e0", ["24"] = "#3c73c0", ["28"] = "#305da2", ["32"] = "#264786", ["36"] = "#1c326b", ["38"] = "#17275f", ["39"] = "#152258", ["40"] = "#131d52" },
    violet = { ["01"] = "#f5f9ff", ["02"] = "#f0f2ff", ["04"] = "#e6e3fd", ["08"] = "#d3c5fa", ["12"] = "#c1a6f7", ["16"] = "#af87f0", ["20"] = "#9673d1", ["24"] = "#7e60b3", ["28"] = "#674d97", ["32"] = "#523a7d", ["36"] = "#3e2764", ["38"] = "#341d58", ["39"] = "#301852", ["40"] = "#2b134d" },
    pink = { ["01"] = "#f6f9ff", ["02"] = "#f5f1fa", ["04"] = "#f2e0f2", ["08"] = "#ebbee1", ["12"] = "#e49bd1", ["16"] = "#d879c0", ["20"] = "#b968a7", ["24"] = "#9c5790", ["28"] = "#804579", ["32"] = "#663464", ["36"] = "#4e2250", ["38"] = "#421947", ["39"] = "#3c1542", ["40"] = "#37103e" },
  },
}

local function to_linear(c)
  return c <= 0.04045 and c / 12.92 or ((c + 0.055) / 1.055) ^ 2.4
end

local function from_linear(c)
  c = c <= 0.0031308 and 12.92 * c or 1.055 * c ^ (1 / 2.4) - 0.055
  return math.floor(math.min(1, math.max(0, c)) * 255 + 0.5)
end

local function cbrt(x)
  return x < 0 and -((-x) ^ (1 / 3)) or x ^ (1 / 3)
end

local function to_oklab(hex)
  local r = to_linear(tonumber(hex:sub(2, 3), 16) / 255)
  local g = to_linear(tonumber(hex:sub(4, 5), 16) / 255)
  local b = to_linear(tonumber(hex:sub(6, 7), 16) / 255)
  local l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  local m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  local s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return {
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  }
end

local function from_oklab(lab)
  local l = (lab[1] + 0.3963377774 * lab[2] + 0.2158037573 * lab[3]) ^ 3
  local m = (lab[1] - 0.1055613458 * lab[2] - 0.0638541728 * lab[3]) ^ 3
  local s = (lab[1] - 0.0894841775 * lab[2] - 1.2914855480 * lab[3]) ^ 3
  return string.format("#%02x%02x%02x",
    from_linear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    from_linear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    from_linear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s))
end

--- Mix `amount` (0-1) of color `a` into color `b` in oklab.
function M.mix(a, b, amount)
  local x, y = to_oklab(a), to_oklab(b)
  return from_oklab({
    x[1] * amount + y[1] * (1 - amount),
    x[2] * amount + y[2] * (1 - amount),
    x[3] * amount + y[3] * (1 - amount),
  })
end

--- Return the semantic role colors of palette `name` for the given
--- 'background' value.
function M.roles(name, background)
  local p = M.palettes[name]
  local dark = background == "dark"
  local function pick(family, light_step, dark_step)
    return p[family][dark and dark_step or light_step]
  end
  -- Foreground step for hued text: readable on every surface.
  local fg = dark and "12" or "28"
  local r = {
    bg = pick("neutral", "01", "40"),
    surface = pick("neutral", "00", "39"),
    overlay = pick("neutral", "02", "38"),
    border = pick("neutral", "04", "36"),
    border_strong = pick("neutral", "08", "32"),
    text = pick("neutral", "40", "00"),
    muted = pick("neutral", "24", "16"),
    faint = pick("neutral", "12", "28"),
    accent = pick("blue", "24", "16"),
    brand = pick("violet", "24", "16"),
    brand_text = pick("neutral", "00", "40"),
    success = p.green[fg],
    danger = p.red[fg],
    warning = p.orange[fg],
    info = p.blue[fg],
    red = p.red[fg],
    orange = p.orange[fg],
    yellow = p.yellow[fg],
    green = p.green[fg],
    sky = p.sky[fg],
    blue = p.blue[fg],
    violet = p.violet[fg],
    pink = p.pink[fg],
  }
  local fill = dark and 0.18 or 0.16
  local edge = dark and 0.45 or 0.40
  for _, name in ipairs({ "success", "danger", "warning", "info", "accent", "yellow" }) do
    r[name .. "_fill"] = M.mix(r[name], r.surface, fill)
    r[name .. "_edge"] = M.mix(r[name], r.surface, edge)
  end
  return r
end

local function highlights(c)
  return {
    -- Editor UI
    Normal = { fg = c.text, bg = c.bg },
    NormalNC = { link = "Normal" },
    NormalFloat = { fg = c.text, bg = c.surface },
    FloatBorder = { fg = c.border_strong, bg = c.surface },
    FloatTitle = { fg = c.text, bg = c.surface, bold = true },
    FloatFooter = { fg = c.muted, bg = c.surface },
    WinSeparator = { fg = c.border },
    VertSplit = { link = "WinSeparator" },
    Cursor = { fg = c.bg, bg = c.text },
    lCursor = { link = "Cursor" },
    TermCursor = { link = "Cursor" },
    CursorLine = { bg = c.overlay },
    CursorColumn = { link = "CursorLine" },
    ColorColumn = { bg = c.overlay },
    CursorLineNr = { fg = c.text, bold = true },
    LineNr = { fg = c.faint },
    SignColumn = { fg = c.muted },
    FoldColumn = { fg = c.faint },
    Folded = { fg = c.muted, bg = c.overlay },
    EndOfBuffer = { fg = c.border },
    NonText = { fg = c.faint },
    Whitespace = { fg = c.border_strong },
    SpecialKey = { fg = c.faint },
    Conceal = { fg = c.muted },
    Visual = { bg = c.accent_fill },
    VisualNOS = { link = "Visual" },
    Search = { bg = c.yellow_fill, fg = c.text },
    CurSearch = { bg = c.yellow, fg = c.surface },
    IncSearch = { link = "CurSearch" },
    Substitute = { bg = c.danger_fill, fg = c.text },
    MatchParen = { bg = c.border, bold = true },
    Pmenu = { fg = c.text, bg = c.surface },
    PmenuSel = { bg = c.overlay, bold = true },
    PmenuKind = { fg = c.blue, bg = c.surface },
    PmenuExtra = { fg = c.muted, bg = c.surface },
    PmenuSbar = { bg = c.overlay },
    PmenuThumb = { bg = c.border_strong },
    WildMenu = { link = "PmenuSel" },
    StatusLine = { fg = c.text, bg = c.surface },
    StatusLineNC = { fg = c.muted, bg = c.surface },
    TabLine = { fg = c.muted, bg = c.surface },
    TabLineFill = { bg = c.surface },
    TabLineSel = { fg = c.text, bg = c.bg, bold = true },
    WinBar = { fg = c.text, bold = true },
    WinBarNC = { fg = c.muted },
    Title = { fg = c.brand, bold = true },
    Directory = { fg = c.accent },
    ModeMsg = { fg = c.muted },
    MoreMsg = { fg = c.accent },
    Question = { fg = c.accent },
    MsgArea = { fg = c.text },
    ErrorMsg = { fg = c.danger, bold = true },
    WarningMsg = { fg = c.warning, bold = true },
    QuickFixLine = { bg = c.accent_fill },
    SpellBad = { sp = c.danger, undercurl = true },
    SpellCap = { sp = c.info, undercurl = true },
    SpellLocal = { sp = c.success, undercurl = true },
    SpellRare = { sp = c.violet, undercurl = true },

    -- Diff
    DiffAdd = { bg = c.success_fill },
    DiffDelete = { bg = c.danger_fill },
    DiffChange = { bg = c.info_fill },
    DiffText = { bg = c.info_edge },
    Added = { fg = c.success },
    Removed = { fg = c.danger },
    Changed = { fg = c.info },
    diffAdded = { link = "Added" },
    diffRemoved = { link = "Removed" },
    diffChanged = { link = "Changed" },

    -- Diagnostics
    DiagnosticError = { fg = c.danger },
    DiagnosticWarn = { fg = c.warning },
    DiagnosticInfo = { fg = c.info },
    DiagnosticHint = { fg = c.sky },
    DiagnosticOk = { fg = c.success },
    DiagnosticUnderlineError = { sp = c.danger, undercurl = true },
    DiagnosticUnderlineWarn = { sp = c.warning, undercurl = true },
    DiagnosticUnderlineInfo = { sp = c.info, undercurl = true },
    DiagnosticUnderlineHint = { sp = c.sky, undercurl = true },
    DiagnosticUnderlineOk = { sp = c.success, undercurl = true },
    DiagnosticVirtualTextError = { fg = c.danger, bg = c.danger_fill },
    DiagnosticVirtualTextWarn = { fg = c.warning, bg = c.warning_fill },
    DiagnosticVirtualTextInfo = { fg = c.info, bg = c.info_fill },
    DiagnosticVirtualTextHint = { fg = c.sky },
    DiagnosticUnnecessary = { fg = c.faint },
    DiagnosticDeprecated = { strikethrough = true },
    LspReferenceText = { bg = c.overlay },
    LspReferenceRead = { link = "LspReferenceText" },
    LspReferenceWrite = { link = "LspReferenceText" },
    LspInlayHint = { fg = c.faint },
    LspSignatureActiveParameter = { bold = true, underline = true },

    -- Syntax
    Comment = { fg = c.muted, italic = true },
    Constant = { fg = c.orange },
    String = { fg = c.green },
    Character = { link = "String" },
    Number = { fg = c.orange },
    Boolean = { fg = c.orange },
    Float = { link = "Number" },
    Identifier = { fg = c.text },
    Function = { fg = c.blue },
    Statement = { fg = c.violet },
    Keyword = { fg = c.violet },
    Conditional = { link = "Keyword" },
    Repeat = { link = "Keyword" },
    Label = { fg = c.sky },
    Exception = { link = "Keyword" },
    Operator = { fg = c.muted },
    PreProc = { fg = c.pink },
    Include = { link = "PreProc" },
    Define = { link = "PreProc" },
    Macro = { link = "PreProc" },
    Type = { fg = c.yellow },
    StorageClass = { link = "Keyword" },
    Structure = { link = "Type" },
    Typedef = { link = "Type" },
    Special = { fg = c.sky },
    SpecialChar = { link = "Special" },
    Tag = { fg = c.blue },
    Delimiter = { fg = c.muted },
    SpecialComment = { fg = c.muted, bold = true },
    Debug = { fg = c.red },
    Underlined = { underline = true },
    Bold = { bold = true },
    Italic = { italic = true },
    Ignore = { fg = c.faint },
    Error = { fg = c.danger },
    Todo = { fg = c.brand_text, bg = c.brand, bold = true },

    -- Treesitter
    ["@variable"] = { fg = c.text },
    ["@variable.builtin"] = { fg = c.red },
    ["@variable.parameter"] = { fg = c.text, italic = true },
    ["@variable.member"] = { fg = c.text },
    ["@property"] = { fg = c.text },
    ["@constant"] = { link = "Constant" },
    ["@constant.builtin"] = { fg = c.orange, bold = true },
    ["@module"] = { fg = c.text },
    ["@string.escape"] = { fg = c.sky },
    ["@string.special"] = { fg = c.sky },
    ["@string.regexp"] = { fg = c.sky },
    ["@function.builtin"] = { fg = c.blue, bold = true },
    ["@constructor"] = { fg = c.yellow },
    ["@type.builtin"] = { fg = c.yellow, bold = true },
    ["@keyword.return"] = { fg = c.violet, bold = true },
    ["@punctuation"] = { fg = c.muted },
    ["@tag"] = { fg = c.blue },
    ["@tag.attribute"] = { fg = c.yellow },
    ["@tag.delimiter"] = { fg = c.muted },
    ["@markup.heading"] = { fg = c.brand, bold = true },
    ["@markup.strong"] = { bold = true },
    ["@markup.italic"] = { italic = true },
    ["@markup.strikethrough"] = { strikethrough = true },
    ["@markup.underline"] = { underline = true },
    ["@markup.link"] = { fg = c.accent },
    ["@markup.link.url"] = { fg = c.accent, underline = true },
    ["@markup.link.label"] = { fg = c.accent },
    ["@markup.raw"] = { fg = c.green },
    ["@markup.quote"] = { fg = c.muted, italic = true },
    ["@markup.list"] = { fg = c.muted },
    ["@markup.list.checked"] = { fg = c.success },
    ["@markup.list.unchecked"] = { fg = c.muted },
    ["@diff.plus"] = { link = "Added" },
    ["@diff.minus"] = { link = "Removed" },
    ["@diff.delta"] = { link = "Changed" },
    ["@comment.error"] = { fg = c.surface, bg = c.danger, bold = true },
    ["@comment.warning"] = { fg = c.surface, bg = c.warning, bold = true },
    ["@comment.note"] = { fg = c.surface, bg = c.info, bold = true },
    ["@comment.todo"] = { link = "Todo" },
    ["@lsp.type.namespace"] = { link = "@module" },
    ["@lsp.type.parameter"] = { link = "@variable.parameter" },
    ["@lsp.type.property"] = { link = "@property" },
    ["@lsp.mod.deprecated"] = { strikethrough = true },

    -- Plugins: gitsigns
    GitSignsAdd = { fg = c.success },
    GitSignsChange = { fg = c.info },
    GitSignsDelete = { fg = c.danger },
  }
end

local terminal_steps = { "red", "green", "yellow", "blue", "violet", "sky" }

--- Apply colorscheme `name` for `background` (default: 'background').
--- 'background' itself is left unchanged; M.background records the applied
--- variant.
function M.load(name, background)
  background = background or vim.o.background
  if vim.g.colors_name then
    vim.cmd.highlight("clear")
  end
  vim.g.colors_name = name
  M.background = background
  local c = M.roles(name, background)
  for group, spec in pairs(highlights(c)) do
    vim.api.nvim_set_hl(0, group, spec)
  end

  local p = M.palettes[name]
  local dark = background == "dark"
  vim.g.terminal_color_0 = dark and p.neutral["36"] or p.neutral["32"]
  vim.g.terminal_color_8 = dark and p.neutral["28"] or p.neutral["24"]
  vim.g.terminal_color_7 = dark and p.neutral["08"] or p.neutral["04"]
  vim.g.terminal_color_15 = p.neutral["00"]
  for i, family in ipairs(terminal_steps) do
    vim.g["terminal_color_" .. i] = p[family][dark and "12" or "28"]
    vim.g["terminal_color_" .. (i + 8)] = p[family][dark and "08" or "24"]
  end
end

return M
