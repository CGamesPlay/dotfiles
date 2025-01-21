-- nvim-lspconfig is a "data only" repo, providing basic, default Nvim LSP
-- client configurations for various LSP servers.
return {
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "williamboman/mason-lspconfig.nvim",
      "nvim-telescope/telescope.nvim",
      "hrsh7th/cmp-nvim-lsp",
    },
    event = "VeryLazy",
    opts = {
      -- See `:help lspconfig-all` for a list of all the pre-configured LSPs
      servers = {
        clangd = {},
        pyright = {},
      },
    },
    config = function(_, opts)
      local capabilities = vim.lsp.protocol.make_client_capabilities()
      -- Add cmp-nvim-lsp's capabilities
      vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

      local function setup_server(server_name)
        local server = opts.servers[server_name] or {}
        -- This handles overriding only values explicitly passed
        -- by the server configuration above. Useful when disabling
        -- certain features of an LSP (for example, turning off formatting for ts_ls)
        server.capabilities = vim.tbl_deep_extend("force", {}, capabilities, server.capabilities or {})
        require("lspconfig")[server_name].setup(server)
      end

      -- Setup all servers (necessary for all servers not handled by mason)
      for server_name in pairs(opts.servers) do
        setup_server(server_name)
      end

      -- This function will ensure that any LSPs installed with Mason trigger a reload.
      require("mason-lspconfig").setup_handlers({ setup_server })

      -- Add the buffer-local keymaps when LSP successfully attaches to a buffer
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
          map("<leader>rs", vim.lsp.buf.rename, "[R]ename [S]ymbol")
          map("<leader>ca", vim.lsp.buf.code_action, "[C]ode [A]ction")

          -- The following two autocommands are used to highlight references of
          -- the word under your cursor when your cursor rests there for a little
          -- while. See `:help CursorHold` for information about when this is
          -- executed When you move your cursor, the highlights will be cleared
          -- (the second autocommand).
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
    end,
  },
}
