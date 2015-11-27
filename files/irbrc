require "irb/ext/save-history"
IRB.conf[:SAVE_HISTORY] = 200
IRB.conf[:HISTORY_FILE] = "#{ENV['HOME']}/.irb-history"
IRB.conf[:PROMPT][:MY_PROMPT] = {
  :PROMPT_I => "\n%N(%m):%03n:%i> ",
  :PROMPT_N => "\n%N(%m):%03n:%i> ",
  :PROMPT_S => "\n%N(%m):%03n:%i%l ",
  :PROMPT_C => "\n%N(%m):%03n:%i* ",
  :RETURN => "=> %s\n"
}
IRB.conf[:PROMPT_MODE] = :MY_PROMPT

# Always print with AwesomePrint
begin
  require 'awesome_print'
  AwesomePrint.irb!
  AwesomePrint.defaults = { :indent => -2 }
rescue
end

# Fix for resizing the terminal. Note that for spring I had to add WINCH to
# spring/lib/spring/client/run.rb
Signal.trap('SIGWINCH', proc { Readline.set_screen_size(*`stty size`.split.map(&:to_i)); Readline.refresh_line })
