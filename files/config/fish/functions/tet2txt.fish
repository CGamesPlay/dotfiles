function tet2txt
	set pdf $argv[1]
  if test (count $argv) -gt 1
    set additional $argv[2..-1]
  end

  tet $additional --text --outfile /dev/fd/3 $pdf 3>&1 >/dev/null; or return 1
end
