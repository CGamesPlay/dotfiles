function fish_jj_prompt --description 'Write out the jj prompt'
	if not command -q jj
		return 1
	end
    jj log --ignore-working-copy --no-graph --color always -r @ -T "' ' ++ shell_prompt" 2>/dev/null
end
