function wait_ssh
  timeout 120 sh -c 'until nc -z $0 22; do sleep 1; done' $argv[1]
  set result $status
  if [ $result -eq 124 ]
    echo "wait_ssh: timed out after 120 seconds" >&2
  end
  return $result
end
