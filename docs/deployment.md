# Deployment

mekiki is deployed to GitHub Pages by `.github/workflows/deploy.yml`, on every push to
`main`, once a day, and on manual dispatch. Daily and manual runs sync the snapshots first
and commit any change; every run then lints, type-checks, tests, builds and deploys. A
separate `smoke` job runs the browser smoke test against the built site; it never blocks
the deploy, and a failure only marks that job red. Why the workflow is shaped this way is
in [design §8](SPEC.md#8-sync-and-deployment).

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

## Protected `main`

The sync step pushes snapshot changes to `main` with the workflow's own token. If `main`
is protected, allow GitHub Actions to push to it, or the daily sync cannot save its
snapshots.
