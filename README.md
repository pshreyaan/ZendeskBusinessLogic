# Serverless Template

## Usage
This template repository provide basic structure and templated setup for
expedient bootstrapping of new Serverless applications.  Broad AWS IAM
permissions will allow you to develop a Proof of Concept in a `dev` environment.

At some point during development SRE should be involved.  For development of
architectures that are highly innovative or complex, SRE should be involved
early on. For development of architectures that are more common, SRE should be
involved at the point where the architecture is ready to be deployed to a
production environment. During PoC you will have broad permissions but once you
have determined an architecture those permissions should be trimmed back to
only what is needed.

### Pre-Commit
This repo uses pre-commit hooks.  If you don't already have it, install it with
`brew install pre-commit`. Then from the repo root run `pre-commit install` to
install the hooks (from `.pre-commit-config.yml`) into
your local git repo.  The hooks will run on every `git commit` and will prevent
the commit if any of the hooks fail.

## Github Actions Workflows
- build.yml
  - For building and testing of branches during development.
  - Triggers on pushes to all open PRs.
- deploy.yml
  - For deployment of tagged releases to production/staging/development environments.
  - For deployment of feature branches to the development environments.
- cleanup.yml
  - Cleanup of temporary resources and artifacts.
  - Triggers on PR close.

## Environment Configurations
We are using Github Environments here.  There are three environments configured
including `dev`, `stg` and `prd`.  The `dev` environment is usable in this repo
while the other two are placeholders.  Within the placeholder environments there
is a protection that only allows deployment of tagged releases. (See Release Process
below)

YAML files in the `config/` directory should contain environment specific
variables that are referenced in Serverless files.  They should be named
`<environment>.yml` and contain the environment specific variables.

## Serverless
`serverless.yml` and referenced resources in `stacks/resources` are used to
define architecture for the application.  They will be built and deployed via
the Serverless framework when triggered inside Workflow files (via Github
Actions).

## Release Process
At anytime you can deploy a feature branch to the `dev` environment via the
Deploy workflow dispatch.  To deploy a release to `stg` or `prd` you will need to
create a tag in the format `vX.Y.Z` where X, Y and Z are integers.  The typical way
to do so is to utilize the Releases tab in Github.  This will create a tagged release
with the version number you specify and include nice release notes.  The tag is then
deployable via the Deploy workflow dispatch to the `stg` or `prd` environments.
