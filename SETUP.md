# Maintainer Setup Checklist

One-time manual tasks for the `paybridge` repository and npm publishing pipeline.

This checklist is for the maintainer (Kobie) and covers infrastructure tasks that the SDK cannot auto-configure.

## GitHub Repository

- [ ] **Add `NPM_TOKEN` to repo secrets**  
  Path: `Settings → Secrets and variables → Actions → New repository secret`  
  - Name: `NPM_TOKEN`
  - Value: Create at https://www.npmjs.com/settings/kobie3717/tokens
  - Type: `Automation` (not `Publish`)
  - Scope: Read + write packages
  - The `.github/workflows/publish.yml` workflow needs this to publish on tag push (`v*.*.*`)

- [ ] **Enable GitHub Pages**  
  Path: `Settings → Pages → Build and deployment`  
  - Source: `GitHub Actions`
  - The `.github/workflows/docs-deploy.yml` workflow will deploy docs automatically
  - Docs will be live at https://kobie3717.github.io/paybridge/

- [ ] **Enable Discussions** (recommended)  
  Path: `Settings → General → Features → Discussions`  
  - Useful for community Q&A, pinned announcements, feature discussions
  - Keeps issues focused on bugs/tasks

- [ ] **Verify security advisories enabled** (default-on)  
  Path: `Settings → Security → Private vulnerability reporting`  
  - Should be enabled by default on public repos
  - Required for `SECURITY.md` GitHub Advisories link to work

## Branch Protection (Recommended)

Path: `Settings → Branches → Add branch protection rule` for `master`

- [ ] **Protect `master` from force-push**  
  Enable: `Require a pull request before merging`

- [ ] **Require PR + 1 approval before merge**  
  Enable: `Require approvals` → set to `1`

- [ ] **Require CI to pass**  
  Enable: `Require status checks to pass before merging`  
  Add: `test` (the GitHub Actions workflow name)

- [ ] **Require linear history** (rebase/squash, no merge commits)  
  Enable: `Require linear history`  
  - Keeps `git log` clean and bisectable
  - No "Merge branch 'feature' into master" noise

## npm Package

- [ ] **Verify package name ownership**  
  ```bash
  npm owner ls paybridge
  ```
  Expected output: `kobie3717 <jiwentzel@icloud.com>`  
  If not, claim package ownership or publish first version manually.

- [ ] **Enable 2FA on npm account**  
  ```bash
  npm profile enable-2fa auth-and-writes
  ```
  Required for publishing public packages. Prompts for OTP on every publish (including CI).  
  **Note:** CI publishes use the `NPM_TOKEN` (automation token), which bypasses 2FA.

- [ ] **Verify `NPM_TOKEN` scope**  
  After adding token to GitHub secrets, test publish workflow:
  ```bash
  git tag v0.3.1-rc.1
  git push origin v0.3.1-rc.1
  ```
  Check Actions tab. If publish fails with `403 Forbidden`, regenerate token with `Automation` type.

## CI/CD Workflows

The repository includes two workflows:

- **`test.yml`** — runs on every push to `master` and every PR  
  No setup required. Uses `npm test`.

- **`publish.yml`** — runs on tag push (`v*.*.*`) or manual dispatch  
  Requires `NPM_TOKEN` secret (see above).

Test the publish workflow after setting up `NPM_TOKEN`:
```bash
# Create and push an rc tag
git tag v0.3.1-rc.1
git push origin v0.3.1-rc.1

# Check Actions tab for green build
# If successful, delete rc tag
git tag -d v0.3.1-rc.1
git push origin :refs/tags/v0.3.1-rc.1
npm unpublish paybridge@0.3.1-rc.1 --force
```

## Future Considerations

- [ ] **Transfer to GitHub organization** (if/when created)  
  When 1.0.0 ships, consider moving `paybridge` to a GitHub org account for:
  - Shared ownership (bus factor mitigation)
  - Team-based access control
  - Professional branding

- [ ] **Add external collaborators** (if needed)  
  Path: `Settings → Collaborators and teams → Add people`  
  Grant `Write` access to trusted contributors for triage/review.

- [ ] **Set up automatic dependency updates** (Dependabot)  
  Path: `Settings → Security → Dependabot`  
  Enable: `Dependabot version updates`  
  Add `.github/dependabot.yml`:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: npm
      directory: /
      schedule:
        interval: weekly
  ```

## Troubleshooting

### Publish workflow fails with "Invalid credentials"
- Regenerate `NPM_TOKEN` at https://www.npmjs.com/settings/kobie3717/tokens
- Ensure type is `Automation` (not `Publish`)
- Update GitHub secret

### CI tests fail with "Cannot find module"
- Run `npm install` locally to verify `package.json` dependencies
- Check `engines.node` field matches CI matrix (`test.yml` runs Node 18, 20, 22)

### Security advisory creation fails
- Verify repo is public (private repos require GitHub Advanced Security)
- Check `Settings → Security → Private vulnerability reporting` is enabled

## Help

If any of these steps fail or you need assistance:

- **Discord:** [https://discord.gg/Y2jCXNGgE](https://discord.gg/Y2jCXNGgE)
- **GitHub Issues:** [https://github.com/kobie3717/paybridge/issues](https://github.com/kobie3717/paybridge/issues)
- **CONTRIBUTING.md:** [Contributing Guide](CONTRIBUTING.md)
