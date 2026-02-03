# Version Management Guide

This project uses **git tags** for automatic semantic versioning. No manual file editing required!

## How It Works

Version numbers are automatically derived from git tags following semantic versioning (semver):
- Git tags format: `v1.2.3` (major.minor.patch)
- Docker images are tagged with the version from git tags
- No need to manually update `package.json` or any other files

## Quick Start

```bash
# Check current version
make version

# Create a new patch release (bug fixes)
make tag-patch

# Create a new minor release (new features)
make tag-minor

# Create a new major release (breaking changes)
make tag-major

# Push tags to remote
make tag-push
```

## Semantic Versioning

Following semver 2.0.0 (`MAJOR.MINOR.PATCH`):

- **MAJOR** (v1.0.0 → v2.0.0): Breaking changes
- **MINOR** (v1.0.0 → v1.1.0): New features (backwards compatible)
- **PATCH** (v1.0.0 → v1.0.1): Bug fixes (backwards compatible)

## Version Management Commands

### View Version Information

```bash
# Show all version details
make version

# Output:
# Git Tag:        v1.2.3
# Git Commit:     abc1234
# Git Branch:     main
# Version:        v1.2.3-abc1234
# Docker Tag:     1.2.3
```

### Create Version Tags

```bash
# Patch version (bug fixes)
make tag-patch
# v1.0.0 → v1.0.1

# Minor version (new features)
make tag-minor
# v1.0.0 → v1.1.0

# Major version (breaking changes)
make tag-major
# v1.0.0 → v2.0.0
```

### Manage Tags

```bash
# List all version tags
make tag-list

# Push tags to remote repository
make tag-push

# Delete a specific tag (locally and remotely)
make tag-delete TAG=v1.0.0
```

## Typical Workflow

### Bug Fix Release

```bash
# 1. Make your changes
git add .
git commit -m "fix: resolve JSON serialization issue"

# 2. Create patch tag
make tag-patch
# Creates v1.0.1

# 3. Push changes and tags
git push
make tag-push

# 4. Build and deploy
make release DOCKER_USERNAME=myuser
```

### Feature Release

```bash
# 1. Develop feature on branch
git checkout -b feature/new-api
git add .
git commit -m "feat: add new endpoint"

# 2. Merge to main
git checkout main
git merge feature/new-api

# 3. Create minor tag
make tag-minor
# Creates v1.1.0

# 4. Push and deploy
git push
make tag-push
make release DOCKER_USERNAME=myuser
```

### Major Release

```bash
# 1. Make breaking changes
git add .
git commit -m "feat!: redesign API (breaking change)"

# 2. Create major tag
make tag-major
# Creates v2.0.0

# 3. Push and deploy
git push
make tag-push
make release DOCKER_USERNAME=myuser
```

## Docker Image Versioning

Docker images are automatically tagged with:
1. The git tag version (e.g., `myuser/myrest:1.2.3`)
2. The `latest` tag (e.g., `myuser/myrest:latest`)

```bash
# Build with automatic versioning
make docker-build DOCKER_USERNAME=myuser
# Builds: myuser/myrest:1.2.3 and myuser/myrest:latest

# Push to registry
make docker-push DOCKER_USERNAME=myuser
# Pushes both tags
```

## Initial Setup

If starting a new repository without tags:

```bash
# Create initial v0.1.0 tag
git tag -a v0.1.0 -m "Initial release"
git push origin v0.1.0

# Or use make command
make tag-minor
make tag-push
```

## Advanced Usage

### Custom Version Tags

```bash
# Create custom tag manually
git tag -a v1.5.0 -m "Release 1.5.0"

# Push specific tag
git push origin v1.5.0

# Or push all tags
make tag-push
```

### Pre-release Versions

```bash
# Create pre-release tag
git tag -a v2.0.0-beta.1 -m "Beta release"
git push origin v2.0.0-beta.1

# Docker will use: 2.0.0-beta.1
```

### Build Specific Version

```bash
# Build from specific tag
git checkout v1.0.0
make docker-build DOCKER_USERNAME=myuser
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Build and Push
        run: |
          make docker-push DOCKER_USERNAME=${{ secrets.DOCKER_USERNAME }}
```

### GitLab CI

```yaml
release:
  stage: deploy
  only:
    - tags
  script:
    - make docker-push DOCKER_USERNAME=$CI_REGISTRY_USER
```

## Version History

View version history:

```bash
# List all tags
make tag-list

# View git log with tags
git log --oneline --decorate --tags

# Show commits between versions
git log v1.0.0..v1.1.0
```

## Troubleshooting

### No Tags Exist

If you see `v0.0.0`, no tags exist yet:

```bash
# Create first tag
make tag-minor  # Creates v0.1.0
make tag-push
```

### Wrong Version Displayed

```bash
# Fetch tags from remote
git fetch --tags

# Verify current tag
git describe --tags --abbrev=0

# Check current version
make version
```

### Tag Already Exists

```bash
# Delete local tag
git tag -d v1.0.0

# Delete remote tag
git push origin :refs/tags/v1.0.0

# Or use make command
make tag-delete TAG=v1.0.0
```

### Update Package.json Version

While not required for building, you can sync package.json:

```bash
# Update package.json to match git tag
npm version $(git describe --tags --abbrev=0 | sed 's/^v//') --no-git-tag-version
git add package.json
git commit -m "chore: sync package.json version"
```

## Best Practices

1. **Always commit before tagging**
   ```bash
   git add .
   git commit -m "your changes"
   make tag-patch
   ```

2. **Push tags after creation**
   ```bash
   make tag-patch
   make tag-push
   ```

3. **Use meaningful commit messages**
   - `fix:` for patches
   - `feat:` for minor versions
   - `feat!:` or `BREAKING CHANGE:` for major versions

4. **Test before tagging**
   ```bash
   make test
   make tag-patch
   ```

5. **Use release command for complete deployments**
   ```bash
   make release DOCKER_USERNAME=myuser
   ```

## Benefits

✅ **No manual version updates** - Versions come from git tags  
✅ **Single source of truth** - Git is the version authority  
✅ **Automatic Docker tagging** - Images tagged with git version  
✅ **Semantic versioning** - Easy increment commands  
✅ **CI/CD friendly** - Works seamlessly with automation  
✅ **Version history** - Track versions through git tags  

## Migration from Manual Versioning

If you were manually updating `package.json`:

```bash
# 1. Create tag matching current package.json version
CURRENT_VERSION=$(node -p "require('./package.json').version")
git tag -a "v$CURRENT_VERSION" -m "Release v$CURRENT_VERSION"
git push origin "v$CURRENT_VERSION"

# 2. From now on, use make commands
make tag-patch  # or tag-minor, tag-major
```

## Summary

- **Versions come from git tags** (no manual edits)
- **Use `make tag-patch/minor/major`** to create new versions
- **Push tags with `make tag-push`**
- **Docker images automatically use git tag version**
- **Simple, automated, no manual file updates needed**

For more information, see [Makefile Usage Guide](./MAKEFILE_USAGE.md).
