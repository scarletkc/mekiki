# Deployment

mekiki is deployed to GitHub Pages by `.github/workflows/deploy.yml`, on every push to
`main`, once a day at 00:00 UTC, and on manual dispatch. Daily and manual runs sync the
snapshots and record the day's ratings first; every run then lints, type-checks, tests
and builds, daily and manual runs commit any data change that passed, and the site is
deployed. A separate `smoke` job runs the browser smoke test against the built site; it
never blocks the deploy, and a failure only marks that job red. Pull requests into `main`
are checked by `.github/workflows/ci.yml`. Why the workflows are shaped this way is in
[design §8](SPEC.md#8-sync-and-deployment).

## One-time setup

Done once by the repository owner:

1. Create an Artificial Analysis account, generate an API key and add it as the repository
   secret `AA_API_KEY`.
2. DNS: add a `CNAME` record for `mekiki.fog.moe` pointing to `scarletkc.github.io`. With
   Cloudflare, use DNS-only mode until GitHub has issued the certificate.
3. Repository Settings → Pages: set the source to GitHub Actions, enter the custom domain
   and enable Enforce HTTPS. Until Pages is enabled, the deploy step fails with
   `Failed to create deployment (status: 404)`.
4. Once it is live, check that the API allows cross-origin requests:

   ```bash
   curl -I https://mekiki.fog.moe/api.json
   ```

   The response should include `Access-Control-Allow-Origin: *`.
5. Discussion threads on model pages: turn on Discussions, create a category in the
   Announcement format (so only maintainers and giscus can open threads), and install the
   [giscus app](https://github.com/apps/giscus) on the repository. Put the repository and
   category names and IDs in `src/lib/giscus.config.ts`; the IDs come from giscus.app or
   from the GraphQL API:

   ```bash
   gh api graphql -f query='{ repository(owner:"scarletkc", name:"mekiki") { id discussionCategories(first:20) { nodes { id name } } } }'
   ```

   With any field empty, model pages show no discussion section.

## Protected `main`

`main` is protected by the repository ruleset "Protect main":

- changes land through pull requests; no approval is required;
- the `check` job of `ci.yml` must pass on a branch that is up to date with `main`;
- `main` cannot be deleted or force-pushed.

Repository admins can bypass the ruleset, and so can deploy keys. The sync pushes its data
commit with the write deploy key "sync bot (GitHub Actions)", whose private key is the
secret `SYNC_DEPLOY_KEY`. Without it the daily sync cannot save its snapshots or its
history. To replace the key:

```bash
ssh-keygen -t ed25519 -N "" -C "mekiki sync bot" -f sync_key
gh repo deploy-key add sync_key.pub --allow-write --title "sync bot (GitHub Actions)"
gh secret set SYNC_DEPLOY_KEY < sync_key
rm sync_key sync_key.pub
```

Then delete the old key under Settings → Deploy keys.
