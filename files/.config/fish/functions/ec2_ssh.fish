function ec2_ssh --wraps ssh
  ssh -F ~/.ssh/ec2_config $argv
end
