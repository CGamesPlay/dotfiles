function tet2html
	set pdf $argv[1]
  set html $argv[2]
  set tetml (dirname $html)/(basename $html .html).tetml
  if test (count $argv) -gt 2
    set additional $argv[3..-1]
  end

  tet $additional --tetml wordplus --outfile $tetml $pdf; or return 1
  xsltproc /Users/rpatterson/Downloads/Libraries/tet/bind/xslt/tetml2html.xsl $tetml >$html
  rm $tetml
end
