# Defined in /var/folders/2r/0y4kz7r53y1bflwy7l87z4n40000gn/T//fish.Uz0Yq7/piliT.fish @ line 1
function piliT
  pushd ~/Seafile/Notes/
  set filename (pilikino search)
  if ! test -z $filename
    open $filename
  end
  popd
end
