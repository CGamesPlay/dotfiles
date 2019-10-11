#!/usr/bin/make -f

SOURCE = $(CURDIR)/files
TARGET = $(HOME)

# Files to link directly
LINK_FILES := $(notdir $(shell find $(SOURCE) -maxdepth 1 -type f)) \
							config/fish/config.fish config/fish/iterm2_shell_integration.fish \
							config/fish/fishfile vim/bundle/Vundle.vim
# Link contents of these directories
LINK_CONTENTS_OF = ssh atom config/fish/functions

# Assemble source and destination file lists
LINK_FILES_dest := $(addprefix $(TARGET)/.,$(LINK_FILES))
LINK_CONTENTS_OF_src := $(wildcard $(addsuffix /*,$(addprefix $(SOURCE)/,$(LINK_CONTENTS_OF))))
LINK_CONTENTS_OF_dest := $(LINK_CONTENTS_OF_src:$(SOURCE)/%=$(TARGET)/.%)

.PHONY: help install uninstall import

help:
	@echo "Usage: make COMMAND"
	@echo
	@echo "Command can be one of:"
	@echo "  install      Normal install on a new machine."
	@echo "  uninstall    Interactively remove everything that was installed."
	@echo "  import       Reverse install, updates the git repo."


install: $(LINK_FILES_dest) $(LINK_CONTENTS_OF_dest)
	mkdir -p ~/.vim/swaps/
	vim -c VundleInstall -c qa
	if command -v apm; then apm install --packages-file ~/.atom/installed-packages.txt; fi

uninstall:
	rm -i $(LINK_FILES_dest) $(LINK_CONTENTS_OF_dest)

import:
	for i in $(LINK_FILES); do \
	  if [ ! -L $(TARGET)/.$$i -a ! -d $(TARGET)/.$$i ]; then \
	    cp $(TARGET)/.$$i $(SOURCE)/$$i; \
	  fi; \
	done
	if command -v apm; then apm list --installed --bare > files/atom/installed-packages.txt; fi

# Main rule
$(TARGET)/.%: $(SOURCE)/%
	mkdir -p $(dir $@)
	ln -si $^ $@
