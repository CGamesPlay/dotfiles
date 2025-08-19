-- nvim-lspconfig is a "data only" repo, providing basic, default Nvim LSP
-- client configurations for various LSP servers.

--- Rename the active buffer's file.
local function lsp_rename_file()
  local current_file = vim.api.nvim_buf_get_name(0)
  vim.ui.input({ prompt = "New file name: ", default = current_file, completion = "file" }, function(new_name)
    if not new_name or new_name == "" or new_name == current_file then
      return
    end
    vim.lsp.util.rename(current_file, new_name)
  end)
end

return {
  {
    "neovim/nvim-lspconfig",
    version = "*",
    dependencies = {
      "nvim-telescope/telescope.nvim",
      "saghen/blink.cmp",
    },

    opts = {
      -- It's possible to add extra settings for each lsp, see :help
      -- lspconfig-setup. See :help lspconfig-all for a list of all the
      -- pre-configured LSPs
      servers = {
        astro = {},
        gopls = {},
        lua_ls = {},
        pyright = {
          settings = {
            -- Using Ruff's import organizer
            disableOrganizeImports = true,
          },
          python = {
            analysis = {
              -- Ignore all files for analysis to exclusively use Ruff for
              -- linting
              ignore = { "*" },
            },
          },
        },
        ruby_lsp = {
          init_options = {
            formatter = 'standard',
            linters = { 'standard' },
          }
        },
        ruff = {
          ---@param client vim.lsp.Client
          on_attach = function(client, _)
            -- Use pyright's hovers
            client.server_capabilities.hoverProvider = false
          end,
        },
        rust_analyzer = {
          settings = {
            ["rust-analyzer"] = {
              check = {
                command = "clippy"
              }
            }
          }
        },
        -- See above
        -- standardrb = {},
        terraformls = {},
        ts_ls = {},
      },
    },

    config = function(_, opts)
      local lspconfig = require("lspconfig")

      local capabilities = vim.lsp.protocol.make_client_capabilities()
      -- Add blink.cmp's capabilities
      vim.tbl_deep_extend("force", capabilities, require("blink.cmp").get_lsp_capabilities())

      lspconfig.util.default_config =
          vim.tbl_extend("force", lspconfig.util.default_config, { capabilities = capabilities })

      local function setup_server(server_name)
        local config = opts.servers[server_name]
        if config ~= nil then
          -- This handles overriding only values explicitly passed by the
          -- server configuration above. Useful when disabling certain features
          -- of an LSP (for example, turning off formatting for ts_ls)
          config.capabilities = vim.tbl_deep_extend("force", {}, capabilities, config.capabilities or {})
          vim.lsp.enable(server_name)
          vim.lsp.config(server_name, config)
        end
      end

      -- Setup all servers (necessary for all servers not handled by mason)
      for server_name in pairs(opts.servers) do
        setup_server(server_name)
      end

      local augroup = vim.api.nvim_create_augroup("lspconfig", { clear = true })
      local highlight_augroup = vim.api.nvim_create_augroup("kickstart-lsp-highlight", { clear = false })

      -- Add the buffer-local keymaps when LSP successfully attaches to a
      -- buffer
      vim.api.nvim_create_autocmd("LspAttach", {
        group = augroup,
        callback = function(event)
          local function map(left, right, desc, mode)
            mode = mode or "n"
            vim.keymap.set(mode, left, right, { buffer = event.buf, desc = "LSP: " .. desc })
          end

          local builtin = require("telescope.builtin")
          map("<F5>", "<CMD>LspRestart<CR>", "Restart Servers")
          map("gd", builtin.lsp_definitions, "[G]oto [D]efinition")
          map("gr", builtin.lsp_references, "[G]oto [R]eferences")
          map("gI", builtin.lsp_implementations, "[G]oto [I]mplementation")
          map("gD", vim.lsp.buf.declaration, "[G]oto [D]eclaration")
          map("gT", builtin.lsp_type_definitions, "[G]oto [T]ype Definition")
          map("gs", builtin.lsp_document_symbols, "[G]oto [S]ymbol")
          map("<leader>ss", builtin.lsp_dynamic_workspace_symbols, "[S]earch Workspace [S]ymbols")
          map("<leader>so", builtin.lsp_document_symbols, "[S]earch File [O]utline")
          map("<leader>r.", vim.lsp.buf.rename, "[R]ename Symbol Under Cursor")
          map("<leader>rf", lsp_rename_file, "[R]ename [F]ile")
          map("<leader>ca", vim.lsp.buf.code_action, "[C]ode [A]ction")

          -- The following two autocommands are used to highlight references of
          -- the word under your cursor when your cursor rests there for a
          -- little while. See `:help CursorHold` for information about when
          -- this is executed When you move your cursor, the highlights will be
          -- cleared (the second autocommand).
          local client = vim.lsp.get_client_by_id(event.data.client_id)
          if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight) then
            vim.api.nvim_create_autocmd({ "CursorHold", "CursorHoldI" }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.document_highlight,
            })

            vim.api.nvim_create_autocmd({ "CursorMoved", "CursorMovedI" }, {
              buffer = event.buf,
              group = highlight_augroup,
              callback = vim.lsp.buf.clear_references,
            })
          end

          -- The following code creates a keymap to toggle inlay hints in your
          -- code, if the language server you are using supports them
          --
          -- This may be unwanted, since they displace some of your code
          if client and client:supports_method(vim.lsp.protocol.Methods.textDocument_inlayHint) then
            map("<leader>th", function()
              vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }))
            end, "[T]oggle Inlay [H]ints")
          end

          -- Use LSP folding when the LSP supports it
          if client and client:supports_method('textDocument/foldingRange') then
            local win = vim.api.nvim_get_current_win()
            vim.wo[win][0].foldmethod = 'expr'
            vim.wo[win][0].foldexpr = 'v:lua.vim.lsp.foldexpr()'
          end
        end,
      })

      vim.api.nvim_create_autocmd("LspDetach", {
        group = augroup,
        callback = function(event2)
          vim.lsp.buf.clear_references()
          vim.api.nvim_clear_autocmds({ group = highlight_augroup, buffer = event2.buf })
        end,
      })
    end,
  },
}
