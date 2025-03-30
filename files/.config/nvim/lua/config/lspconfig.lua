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
    dependencies = {
      -- mason-lspconfig.nvim closes some gaps that exist between mason.nvim
      -- and lspconfig. Its main responsibilities are to:
      -- - register a setup hook with lspconfig that ensures servers installed
      --   with mason.nvim are set up with the necessary configuration
      -- - provide extra convenience APIs such as the :LspInstall command
      -- - allow you to (i) automatically install, and (ii) automatically set
      --   up a predefined list of servers
      -- - translate between lspconfig server names and mason.nvim package
      --   names (e.g. lua_ls <-> lua-language-server)
      "williamboman/mason-lspconfig.nvim",
      "nvim-telescope/telescope.nvim",
      "saghen/blink.cmp",
    },
    event = "VeryLazy",

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
        ruff = {
          ---@param client vim.lsp.Client
          on_attach = function(client, _)
            -- Use pyright's hovers
            client.server_capabilities.hoverProvider = false
          end,
        },
        rust_analyzer = {},
        standardrb = {},
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
        local server = opts.servers[server_name]
        if server ~= nil then
          -- This handles overriding only values explicitly passed by the
          -- server configuration above. Useful when disabling certain features
          -- of an LSP (for example, turning off formatting for ts_ls)
          server.capabilities = vim.tbl_deep_extend("force", {}, capabilities, server.capabilities or {})
          require("lspconfig")[server_name].setup(server)
        end
      end

      -- Setup all servers (necessary for all servers not handled by mason)
      for server_name in pairs(opts.servers) do
        setup_server(server_name)
      end

      -- This function will ensure that any LSPs installed with Mason trigger a
      -- reload.
      require("mason-lspconfig").setup_handlers({ setup_server })

      -- Add the buffer-local keymaps when LSP successfully attaches to a
      -- buffer
      vim.api.nvim_create_autocmd("LspAttach", {
        group = vim.api.nvim_create_augroup("kickstart-lsp-attach", { clear = true }),
        callback = function(event)
          local function map(left, right, desc, mode)
            mode = mode or "n"
            vim.keymap.set(mode, left, right, { buffer = event.buf, desc = "LSP: " .. desc })
          end

          local builtin = require("telescope.builtin")
          map("gd", builtin.lsp_definitions, "[G]oto [D]efinition")
          map("gr", builtin.lsp_references, "[G]oto [R]eferences")
          map("gI", builtin.lsp_implementations, "[G]oto [I]mplementation")
          map("gD", vim.lsp.buf.declaration, "[G]oto [D]eclaration")
          map("gT", builtin.lsp_type_definitions, "[G]oto [T]ype Definition")
          map("gs", builtin.lsp_document_symbols, "[G]oto [S]ymbol")
          map("<leader>ss", builtin.lsp_dynamic_workspace_symbols, "[S]earch [S]ymbols")
          map("<leader>r.", vim.lsp.buf.rename, "[R]ename Symbol Under Cursor")
          map("<leader>rf", lsp_rename_file, "[R]ename [F]ile")
          map("<leader>ca", vim.lsp.buf.code_action, "[C]ode [A]ction")

          -- The following two autocommands are used to highlight references of
          -- the word under your cursor when your cursor rests there for a
          -- little while. See `:help CursorHold` for information about when
          -- this is executed When you move your cursor, the highlights will be
          -- cleared (the second autocommand).
          local client = vim.lsp.get_client_by_id(event.data.client_id)
          if client and client.supports_method(vim.lsp.protocol.Methods.textDocument_documentHighlight) then
            local highlight_augroup = vim.api.nvim_create_augroup("kickstart-lsp-highlight", { clear = false })
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

            vim.api.nvim_create_autocmd("LspDetach", {
              group = vim.api.nvim_create_augroup("kickstart-lsp-detach", { clear = true }),
              callback = function(event2)
                vim.lsp.buf.clear_references()
                vim.api.nvim_clear_autocmds({ group = "kickstart-lsp-highlight", buffer = event2.buf })
              end,
            })
          end

          -- The following code creates a keymap to toggle inlay hints in your
          -- code, if the language server you are using supports them
          --
          -- This may be unwanted, since they displace some of your code
          if client and client.supports_method(vim.lsp.protocol.Methods.textDocument_inlayHint) then
            map("<leader>th", function()
              vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled({ bufnr = event.buf }))
            end, "[T]oggle Inlay [H]ints")
          end
        end,
      })

      -- Start the LSP after lazy-loading
      vim.cmd("LspStart")
      require("lazydev").setup()

      -- Allow the plugin to be unloaded
      require("lspconfig").deactivate = function()
        vim.lsp.stop_client(vim.lsp.get_clients())
      end
    end,
  },
}
