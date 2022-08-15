function nvm
  if [ -z "$NVM_DIR" ]
    echo 'NVM_DIR is not set'
    return 1
  end
  bash -c '. '$NVM_DIR'/nvm.sh; nvm "$@"' nvm $argv
end
