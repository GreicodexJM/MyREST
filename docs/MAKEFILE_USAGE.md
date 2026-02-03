# Makefile Usage Guide

This document provides instructions for using the Makefile to build, test, and deploy MyREST.

## Quick Start

```bash
# See all available commands
make help

# Install dependencies
make install

# Run tests
make test

# Build Docker image
make docker-build
```

## Development Commands

### Installation and Building

```bash
# Install npm dependencies
make install

# Build project (install dependencies)
make build

# Clean build artifacts and node_modules
make clean
```

### Testing

```bash
# Run unit tests only
make test-unit

# Run all tests
make test

# Run integration tests (requires database)
make test-integration

# Run all tests including integration
make test-all

# Run tests in watch mode
make test-watch
```

### Local Development

```bash
# Start development server
make dev

# Show current version
make version

# Show project information
make info
```

## Docker Commands

### Building Images

```bash
# Build Docker image with version tag
make docker-build

# Build without cache
make docker-build-no-cache

# Build with custom tag
make docker-build DOCKER_TAG=1.0.0
```

### Running Containers

```bash
# Run container locally
make docker-run

# View container logs
make docker-logs

# Stop and remove container
make docker-stop

# Open shell in running container
make docker-shell
```

### Pushing to Registry

```bash
# Push to Docker Hub (default)
make docker-push DOCKER_USERNAME=myusername

# Push to custom registry
make docker-push DOCKER_REGISTRY=ghcr.io DOCKER_USERNAME=myusername

# Complete release (test + build + push)
make release DOCKER_USERNAME=myusername
```

## Composite Commands

### Complete Build Pipeline

```bash
# Clean, install, test, and build Docker image
make all

# CI pipeline (install and test)
make ci

# Release pipeline (test, build, push)
make release DOCKER_USERNAME=myusername
```

## Configuration

### Docker Configuration

You can override Docker settings using environment variables or make parameters:

```bash
# Custom registry
make docker-push DOCKER_REGISTRY=ghcr.io DOCKER_USERNAME=myorg

# Custom tag
make docker-build DOCKER_TAG=v1.0.0

# Custom project name
make docker-run PROJECT_NAME=myrest-dev
```

### Environment Variables

Set these before running Docker commands:

- `DOCKER_REGISTRY` - Docker registry URL (default: docker.io)
- `DOCKER_USERNAME` - Your Docker username/organization
- `VERSION` - Version tag (default: from package.json)
- `DOCKER_TAG` - Custom Docker tag (default: VERSION)

## Examples

### Development Workflow

```bash
# 1. Install dependencies
make install

# 2. Run tests during development
make test-unit

# 3. Start local dev server
make dev
```

### CI/CD Workflow

```bash
# Run in CI environment
make ci

# Or full pipeline
make all
```

### Docker Deployment Workflow

```bash
# 1. Test everything
make test

# 2. Build Docker image
make docker-build DOCKER_USERNAME=mycompany

# 3. Test the Docker image locally
make docker-run

# 4. Check logs
make docker-logs

# 5. Push to registry
make docker-push DOCKER_USERNAME=mycompany

# Or use the release command for all steps
make release DOCKER_USERNAME=mycompany
```

### Custom Registry (GitHub Container Registry)

```bash
# Build and push to GHCR
make docker-push \
  DOCKER_REGISTRY=ghcr.io \
  DOCKER_USERNAME=myorganization

# The image will be: ghcr.io/myorganization/myrest:0.0.9
```

### Custom Registry (AWS ECR)

```bash
# First login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

# Build and push
make docker-push \
  DOCKER_REGISTRY=123456789.dkr.ecr.us-east-1.amazonaws.com \
  DOCKER_USERNAME=mycompany
```

## Troubleshooting

### Docker Issues

**Problem:** Permission denied when pushing to registry
```bash
# Solution: Login to Docker registry first
docker login
# Then try again
make docker-push DOCKER_USERNAME=myusername
```

**Problem:** Container port already in use
```bash
# Solution: Stop existing container
make docker-stop
# Or use different port
docker run -p 3001:3000 ...
```

### Test Issues

**Problem:** Integration tests failing
```bash
# Solution: Ensure database is running
docker-compose up -d mysql
# Wait for MySQL to be ready, then run tests
make test-integration
```

**Problem:** Tests timing out
```bash
# Solution: Increase timeout or run specific tests
./node_modules/.bin/mocha tests/specific_test.js --timeout 5000
```

## Tips and Best Practices

1. **Always run tests before building Docker images**
   ```bash
   make test && make docker-build
   ```

2. **Use the `release` target for deployments**
   ```bash
   make release DOCKER_USERNAME=myusername
   ```

3. **Check the help command for available options**
   ```bash
   make help
   ```

4. **Use version tags for production releases**
   ```bash
   make docker-push DOCKER_TAG=1.0.0 DOCKER_USERNAME=myusername
   ```

5. **Clean build artifacts periodically**
   ```bash
   make clean
   make install
   ```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Build and Test

on: [push]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run CI pipeline
        run: make ci
      - name: Build Docker image
        run: make docker-build
```

### GitLab CI Example

```yaml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  script:
    - make ci

build:
  stage: build
  script:
    - make docker-build DOCKER_USERNAME=$CI_REGISTRY_USER

deploy:
  stage: deploy
  script:
    - make docker-push DOCKER_USERNAME=$CI_REGISTRY_USER
```

## Additional Resources

- [Main README](../README.md)
- [Docker Documentation](https://docs.docker.com/)
- [PostgREST Compatibility Guide](./POSTGREST_FK_HINTS.md)
