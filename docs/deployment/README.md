# Soyori version-tag website releases

## Release contract

- PRs and main pushes run CI only: Windows/Linux verification, editor production build and npm packaging/installation checks. No AWS production identity.
- Website release events: push of a tag matching the coarse filter `v*`, or `workflow_dispatch` on an existing version tag.
- The release guard accepts only stable SemVer `vMAJOR.MINOR.PATCH`: nonnegative integers, no leading zeros except zero itself. No prerelease, build metadata, branch ref, non-version tag or arbitrary SHA dispatch.
- The guard fetches the exact tag and main, peels lightweight/annotated tags to a commit, requires that commit to equal the immutable triggering SHA, and verifies it is an ancestor of origin/main.
- Verification and build check out that fixed SHA. The deploy job checks out the same SHA, rechecks tag existence/identity/main ancestry before requesting AWS credentials, and publishes the artifact built in this run for that SHA. It never builds main as a fallback.
- Manual dispatch of main is rejected. To republish a prior release, dispatch its tag. Retagging/moving/deleting release tags is forbidden operationally and should be enforced with tag rulesets.
- Only deploy has `id-token: write`. One production concurrency group covers all versions and manual retries, with `cancel-in-progress: false`. GitHub can replace an older pending run with a newer pending one; this is not a release FIFO queue.
- No IAM, provider, bucket policy or CloudFront configuration is changed by these workflows.

## Repository Actions variables (not secrets)

| Variable | Value |
| --- | --- |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::961808228151:role/soyori-github-deploy` |
| `DEPLOY_TARGET_VERIFIED` | Set to literal `true` only after the AWS target/cache/private-origin checks below |
| `TAG_AUTO_DEPLOY_ENABLED` | Leave unset until first manual tag release succeeds; then set to literal `true` to enable tag-push releases |

The old `AUTO_DEPLOY_ENABLED` variable is unused and should be removed if it was created. There is no main automatic deployment switch.
A closed target gate fails the release job, rather than silently skipping deploy. A tag push while automatic release is disabled also fails with a message to dispatch that tag manually. Do not interpret that expected blocked run as a published release.

## Target to verify before publishing

The script and IAM example fix the following target; these values are not configurable workflow inputs:
- Account `961808228151`; Singapore `ap-southeast-1`.
- Bucket `soyori-web-prod-961808228151-ap-southeast-1-an`.
- Recorded origin `soyori-web-prod-961808228151-ap-southeast-1-an.s3.ap-southeast-1.amazonaws.com`.
- Object prefix: empty, i.e. bucket root; uploaded contents are inside `packages/editor/dist`, not the dist directory itself.
- CloudFront `EX63P0WN21EXX`; https://soyori.joycows.com.

Read the actual distribution/account/aliases/behaviors/origins/OriginPath and S3 location/encryption/public access configuration. Confirm this is a dedicated site bucket with empty OriginPath, private OAC/OAI access and SSE-S3. If it has a nonempty prefix or unrelated contents, adjust the script and exact IAM resource scope before approval. SSE-KMS needs separately approved, key-specific permissions.
CloudFront entry/mutable-file cache policies must have minimum TTL 0 and respect origin cache headers; check response-header policies, default root object and SPA fallback behavior.

## OIDC trust: only this repository's version tags

Provider `https://token.actions.githubusercontent.com`; audience `sts.amazonaws.com`.
Public read of `GET /repos/qyjbeijing2017/soyori/actions/oidc/customization/sub` confirmed:

```json
{
  "use_default": true,
  "use_immutable_subject": true,
  "sub_claim_prefix": "repo:qyjbeijing2017@30383334/soyori@1395456697"
}
```

The repository was created 2026-09-29. GitHub uses immutable owner/repository IDs for repositories created after 2026-07-15. The trust example therefore uses:
- `StringEquals` audience: `sts.amazonaws.com`.
- `StringLike` subject: `repo:qyjbeijing2017@30383334/soyori@1395456697:ref:refs/tags/v*`.

**IAM wildcard matching cannot express strict SemVer.** It also matches `vbad` and prerelease names. The workflow guard supplies strict version validation and main ancestry checks; protect release tags and workflow files because any trusted workflow at a matching tag could otherwise request this role.
No environment is attached to deploy. Adding one changes the OIDC subject and requires a separately reviewed trust change plus main/release restrictions on that environment. Do not include main, PR or generic repository wildcards in trust.

User-provided AWS screenshots now confirm the GitHub OIDC provider/audience, the saved tag-only role trust and saved `soyori-site-publish` inline policy. Screenshots also confirm distribution `EX63P0WN21EXX` uses the recorded S3 origin, empty OriginPath, origin access identity `E6MQ7ZTAXS28V`, and S3 default SSE-S3 encryption. The role ARN variable is set. `DEPLOY_TARGET_VERIFIED` and `TAG_AUTO_DEPLOY_ENABLED` remain unset. Confirm the remaining private-access/cache/alias settings before opening the target gate. Every later provider/role/trust/permission mutation still requires explicit approval at execution time.

## Exact IAM change approval scope

After confirming resources and getting explicit approval:
- Reuse the inspected existing OIDC provider; no provider mutation is proposed by the tag migration.
- Replace the role trust with `trust-policy.example.json`: this provider, STS web identity only, exact audience and the single repository/tag subject above. Remove the old main subject.
- Verify/save inline policy `soyori-site-publish` from `permissions-policy.example.json` only after confirming its current state and approval. It grants:
  - `s3:PutObject`, `s3:AbortMultipartUpload` on `arn:aws:s3:::soyori-web-prod-961808228151-ap-southeast-1-an/*`.
  - `cloudfront:CreateInvalidation`, `cloudfront:GetInvalidation` on `arn:aws:cloudfront::961808228151:distribution/EX63P0WN21EXX`.
- Role session maximum 3600 seconds. No administrator policy, access keys, S3 object read/list/delete, ACL/public access changes, or distribution mutation.

## First real publication (manual)

1. Review and approve committing/pushing these workflow/script/doc changes. Preserve/review existing language/contact/Issues changes separately; `docs/project-context.md` contains both user work and this task's appended decision. No commits, pushes or tags are made automatically.
2. Merge the reviewed release implementation into main. It must be present both on the default branch (dispatch discovery) and in the release tag's commit.
3. Recheck the saved tag trust and inline policy against the examples; do not make IAM changes without fresh approval. Set `AWS_DEPLOY_ROLE_ARN` and, only after target checks, `DEPLOY_TARGET_VERIFIED=true`. Leave `TAG_AUTO_DEPLOY_ENABLED` unset.
4. With explicit user approval, create/push a **new** stable release tag such as `v0.1.1` on the reviewed main commit. The push run will be blocked while tag automation is disabled; this is expected before first manual validation.
5. Dispatch `deploy.yml` with `ref=v0.1.1` (the existing tag), not main. API/CLI accepts a tag even if the browser ref chooser is inconvenient:
   `gh workflow run deploy.yml --repo qyjbeijing2017/soyori --ref v0.1.1`.
6. Require release, both verify matrix jobs, build and deploy to succeed. Confirm upload/index/invalidation wait actually ran. Inspect the live site, hashed JS/CSS, language initialization, branding and documentation links.
7. Only after that success, enable `TAG_AUTO_DEPLOY_ENABLED=true` if approved. Subsequent newly pushed stable tags run the checks then publish. PR/main activity remains CI-only.

**The existing v0.1.0 tag is old and does not contain these workflows/scripts. It cannot be the first run of the new process. Do not move it.** Main ancestry alone is not enough: a manually dispatched tag must contain the release workflow and scripts. Old tags without them cannot be repaired by fetching main.

To republish a version created with this release implementation, dispatch its existing tag. This rebuilds that commit; it does not replay the original historical artifact byte-for-byte (runner/toolchain versions can evolve). A rollback is an explicit manual dispatch of an eligible older version tag, after checking compatibility. Old pre-workflow releases need a new reviewed release commit/tag instead.

## Repository protections and limits

Protect main with required PR checks and review/code ownership for `.github/workflows/**`, deployment scripts and IAM examples. Protect `v*` tags with repository rulesets: restrict tag creation to release maintainers, block updates/deletions, and minimize bypass. Protect Actions variable/settings changes. This is part of the security boundary: IAM tag wildcards alone do not prove SemVer or main ancestry.
A manually republished old version can overwrite production; maintainers must intend this rollback. Concurrency serializes active publication but does not enforce ascending SemVer or prohibit an old release after a new one.
PR runs only have contents read. Credentials are short-lived OIDC and only requested after release validation. Uploads retain old assets and never change ACLs or use sync/delete.

## Upload and validation

`node scripts/deploy-editor.mjs --dry-run` validates output and prints commands without invoking AWS:
1. Hashed assets first: `public,max-age=31536000,immutable`.
2. Other public files: `public,max-age=0,must-revalidate`.
3. Index last: `no-cache,no-store,must-revalidate`, HTML content type.
4. Invalidate `/*` on the single distribution, then wait for completion (includes SPA aliases and mutable files).

Failures stop subsequent commands. Publication is not transactional; public mutable files can change before index, so keep their URLs compatible. If invalidation fails after index upload, retry invalidation before claiming completion. No retained-asset cleanup is automated.

Local checks:
```sh
node --test scripts/release-ref.test.mjs scripts/deploy-editor.test.mjs
pnpm exec biome check scripts/release-ref.mjs scripts/release-ref.test.mjs scripts/deploy-editor.mjs scripts/deploy-editor.test.mjs docs/deployment/trust-policy.example.json docs/deployment/permissions-policy.example.json
actionlint -shellcheck= -pyflakes= .github/workflows/ci.yml .github/workflows/deploy.yml
```

## Official references

- [GitHub immutable OIDC subjects](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims)
- [GitHub OIDC in AWS](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws)
- [Read repository OIDC customization](https://docs.github.com/en/rest/actions/oidc#get-the-customization-template-for-an-oidc-subject-claim-for-a-repository)
- [AWS CLI S3 cp](https://docs.aws.amazon.com/cli/latest/reference/s3/cp.html)
- [CloudFront invalidation](https://docs.aws.amazon.com/cli/latest/reference/cloudfront/create-invalidation.html)
