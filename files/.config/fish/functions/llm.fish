function llm --description "Command-line access to LLMs"
	argparse --move-unknown --stop-nonopt 'h/help' 'llm-help' 'reinstall' -- $argv
	or return
	if set -ql _flag_h
		echo 'This is a fish wrapper around llm'
		echo
		echo '  --llm-help  Show llm --help'
		echo '  --reinstall Reinstall llm'
		echo
		echo 'Any other options are passed directly to llm'
		return
	end
	if ! command -q llm; or set -ql _flag_reinstall
		if ! command -q uv
			echo "Installing uv"
			@get uv
		end
		echo "Installing llm"
		uv tool install -U llm
		llm install -U llm-anthropic llm-cmd-comp
		set -ql _flag_reinstall; and return
	end
	if set -ql _flag_llm_help
		env LLM_USER_PATH=$XDG_CONFIG_HOME/io.datasette.llm llm --help
		return $status
	end
	env LLM_USER_PATH=$XDG_CONFIG_HOME/io.datasette.llm llm $argv_opts -- $argv
end
