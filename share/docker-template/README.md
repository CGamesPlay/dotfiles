# Docker Project Template

This is a template providing a "workspace root" which can be controlled with a single Docker Compose stack. To install, use `.argc create-docker-template TARGET`.

The project template is very minimal, but in general, there should ideally be a single command `argc start` which does the appropriate thing to run the project. In the template, this is just a `docker-compose up -d` call, but it can be customized freely.
