function abspath
	python -c 'import os, sys; print(os.path.abspath(sys.argv[1]))' $argv[1]
end
