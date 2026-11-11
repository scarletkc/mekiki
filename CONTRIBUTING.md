# Contributing to mekiki

mekiki is run by its owner and a small set of collaborators. **Pull requests from outside
contributors are not accepted**, however small, and are closed without review. Feedback is
welcome, through issues.

## Feedback

All feedback goes through GitHub issues, including the feedback link on the site.
[Open an issue](https://github.com/scarletkc/mekiki/issues/new/choose) and pick the form
that fits:

- **A rating looks wrong**: a model's intelligence, cost or value seems off.
- **The method seems unreasonable**: weights, thresholds, formulas or data sources.
- **Missing or wrong model**: a model is missing, listed by mistake, or has the wrong name
  or data.
- **Site or API bug**: a page or API response that is broken.

Before you open one, check the [Method page](https://mekiki.fog.moe/method) for how each
rating is computed, and [the model list](docs/model-list.md) for who gets listed. English
or Chinese are both fine.

## Becoming a contributor

Contact the owner first, before writing any code: open an issue with the
[Ask to become a contributor](https://github.com/scarletkc/mekiki/issues/new?template=5-contributor.yml)
form and say what you would like to work on. If the owner agrees, you are added as a
collaborator and can then open pull requests.

## For collaborators

- Branch from `main` and open a pull request into it. `main` is protected: the `check`
  job (lint, type check, tests, build and the browser smoke test) must pass on a branch
  that is up to date with `main`. No approval is needed.
  [Deployment](docs/deployment.md#protected-main) has the details.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):
  `feat(site): …`, `fix(scoring): …`, `docs: …`.
- Repository documents are written in English.
- Setup, commands and tuning the ratings are in the
  [development guide](docs/development.md); adding or correcting a model is in
  [the model list](docs/model-list.md); the formulas, weights and thresholds are on the
  [Method page](https://mekiki.fog.moe/method).
