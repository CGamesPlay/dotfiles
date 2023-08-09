# Devcontainer Template

This is a template providing a workspace root accessible via a devcontainer. To install, use `.argc create devcontainer TARGET`.

To get started, ensure that the devcontainer CLI is installed:

```
npm install -g @devcontainers/cli
ln -s $(npm -g config get prefix)/bin/devcontainer ~/.local/bin/devcontainer
```

Then use `argc devcontainer up` to build and start the container. Finally, use `argc devcontainer shell` to open a shell in the container.

Once inside the container, docker is available using docker-in-docker, and git is configured with SSH agent forwarding.

## Managing dependencies

Additional devcontainer features can be configured to install extra software which persists after a rebuild, and a custom Dockerfile can be used for more advanced configuration.
