function highlight
	set pattern $argv[1]
	if test (count $argv) -gt 1
        set additional $argv[2..-1]
    end
	grep -E --color=always '$|'$pattern $additional
end
