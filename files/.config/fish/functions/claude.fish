# The wrapper is responsible for setting up CLAUDE_CONFIG_DIR, and can
# auto-install claude when needed
#
# In the future, potentially look into:
# - cli: https://github.com/sst/opencode
# - cli: https://github.com/openai/codex
# - web: https://github.com/All-Hands-AI/OpenHands
# - web: https://github.com/boldsoftware/sketch
# - nvim: https://github.com/olimorris/codecompanion.nvim
# - nvim: https://github.com/coder/claudecode.nvim
function claude --description "Claude Code"
	argparse --ignore-unknown --stop-nonopt 'help' 'claude-help' 'claude-reinstall' 'claude-usage' -- $argv
	or return

	if set -ql _flag_help
		echo "USAGE: claude [OPTIONS]"
		echo ""
		echo "OPTIONS:"
		echo "  --help              Print help for wrapper"
		echo "  --claude-help       Print help for Claude Code"
		echo "  --claude-reinstall  Reinstall Claude"
		echo "  --claude-usage      Run ccusage"
		return
	else if set -ql _flag_claude_help
		set argv $argv --help
	end

	# Poor man's NVM
	set -p PATH (dirname (nvm which --lts node))

	if set -ql _flag_claude_usage
		npx -- ccusage@latest $argv
		return
	end

	if set -ql _flag_claude_reinstall; or ! npm --no-update-notifier list -g @anthropic-ai/claude-code >/dev/null
		echo "Claude Code is not installed. Installing..." >&2
		npm --no-update-notifier install -g @anthropic-ai/claude-code@latest
		command claude config set --global preferredNotifChannel iterm2
	end

	# Set up config directory
	set -lx CLAUDE_CONFIG_DIR ~/.config/claude

	command claude $argv
end
