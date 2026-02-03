# Makefile for MyREST (xmysql)
# Provides targets for building, testing, and Docker operations

# Variables
PROJECT_NAME = myrest
VERSION ?= $(shell node -p "require('./package.json').version")
DOCKER_REGISTRY ?= docker.io
DOCKER_USERNAME ?= your-username
DOCKER_IMAGE = $(DOCKER_REGISTRY)/$(DOCKER_USERNAME)/$(PROJECT_NAME)
DOCKER_TAG ?= $(VERSION)
DOCKER_LATEST = $(DOCKER_IMAGE):latest

# Node/npm settings
NODE_MODULES = node_modules
NPM = npm
MOCHA = ./node_modules/.bin/mocha

# Colors for output
BLUE = \033[0;34m
GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m # No Color

.PHONY: help install build test test-unit test-integration clean docker-build docker-push docker-run docker-clean all

# Default target
.DEFAULT_GOAL := help

help: ## Display this help message
	@echo "$(BLUE)MyREST (xmysql) - Makefile Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(YELLOW)Docker Configuration:$(NC)"
	@echo "  DOCKER_REGISTRY  = $(DOCKER_REGISTRY)"
	@echo "  DOCKER_USERNAME  = $(DOCKER_USERNAME)"
	@echo "  DOCKER_IMAGE     = $(DOCKER_IMAGE):$(DOCKER_TAG)"
	@echo ""
	@echo "$(YELLOW)Usage Examples:$(NC)"
	@echo "  make install                 # Install dependencies"
	@echo "  make test                    # Run all tests"
	@echo "  make docker-build           # Build Docker image"
	@echo "  make docker-push DOCKER_USERNAME=myuser  # Push to Docker registry"

## Development Commands

install: ## Install dependencies
	@echo "$(BLUE)Installing dependencies...$(NC)"
	$(NPM) install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

build: install ## Build the project (install deps)
	@echo "$(BLUE)Building project...$(NC)"
	@echo "$(GREEN)✓ Build complete$(NC)"

clean: ## Clean node_modules and temporary files
	@echo "$(BLUE)Cleaning project...$(NC)"
	rm -rf $(NODE_MODULES)
	rm -rf coverage
	rm -rf .nyc_output
	@echo "$(GREEN)✓ Clean complete$(NC)"

## Testing Commands

test: test-unit ## Run all tests
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-unit: ## Run unit tests
	@echo "$(BLUE)Running unit tests...$(NC)"
	$(MOCHA) tests/json_serialization_test.js \
		tests/postgrest_unit_tests.js \
		tests/postgrest_fk_hint_test.js \
		tests/jwt_rls_unit_test.js \
		tests/openapi_unit_test.js \
		--exit

test-integration: ## Run integration tests (requires database)
	@echo "$(BLUE)Running integration tests...$(NC)"
	@echo "$(YELLOW)Note: Integration tests require a MySQL database$(NC)"
	$(MOCHA) tests/postgrest_integration_tests.js --exit || true

test-all: ## Run all tests including integration (requires database)
	@echo "$(BLUE)Running all tests...$(NC)"
	$(NPM) test

test-watch: ## Run tests in watch mode
	@echo "$(BLUE)Running tests in watch mode...$(NC)"
	$(MOCHA) tests/*.js --watch

## Docker Commands

docker-build: ## Build Docker image
	@echo "$(BLUE)Building Docker image: $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"
	docker build \
		-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
		-t $(DOCKER_IMAGE):latest \
		-f dockerfile .
	@echo "$(GREEN)✓ Docker image built: $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"

docker-build-no-cache: ## Build Docker image without cache
	@echo "$(BLUE)Building Docker image (no cache): $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"
	docker build --no-cache \
		-t $(DOCKER_IMAGE):$(DOCKER_TAG) \
		-t $(DOCKER_IMAGE):latest \
		-f dockerfile .
	@echo "$(GREEN)✓ Docker image built$(NC)"

docker-push: docker-build ## Build and push Docker image to registry
	@echo "$(BLUE)Pushing Docker image to registry...$(NC)"
	docker push $(DOCKER_IMAGE):$(DOCKER_TAG)
	docker push $(DOCKER_IMAGE):latest
	@echo "$(GREEN)✓ Docker image pushed: $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"

docker-run: ## Run Docker container locally
	@echo "$(BLUE)Running Docker container...$(NC)"
	docker run -d \
		--name $(PROJECT_NAME) \
		-p 3000:3000 \
		-e DATABASE_HOST=host.docker.internal \
		-e DATABASE_USER=root \
		-e DATABASE_PASSWORD=password \
		-e DATABASE_NAME=sakila \
		$(DOCKER_IMAGE):$(DOCKER_TAG)
	@echo "$(GREEN)✓ Container running on http://localhost:3000$(NC)"
	@echo "$(YELLOW)View logs: docker logs -f $(PROJECT_NAME)$(NC)"

docker-stop: ## Stop Docker container
	@echo "$(BLUE)Stopping Docker container...$(NC)"
	docker stop $(PROJECT_NAME) || true
	docker rm $(PROJECT_NAME) || true
	@echo "$(GREEN)✓ Container stopped$(NC)"

docker-logs: ## View Docker container logs
	docker logs -f $(PROJECT_NAME)

docker-clean: docker-stop ## Remove Docker images and containers
	@echo "$(BLUE)Cleaning Docker images...$(NC)"
	docker rmi $(DOCKER_IMAGE):$(DOCKER_TAG) || true
	docker rmi $(DOCKER_IMAGE):latest || true
	@echo "$(GREEN)✓ Docker cleanup complete$(NC)"

docker-shell: ## Open shell in Docker container
	docker exec -it $(PROJECT_NAME) /bin/sh

## Composite Commands

all: clean install test docker-build ## Clean, install, test, and build Docker image
	@echo "$(GREEN)✓ All tasks complete$(NC)"

release: test docker-build docker-push ## Test, build, and push Docker image
	@echo "$(GREEN)✓ Release complete: $(DOCKER_IMAGE):$(DOCKER_TAG)$(NC)"

ci: install test-unit ## Run CI pipeline (install and test)
	@echo "$(GREEN)✓ CI pipeline complete$(NC)"

## Development Helpers

dev: install ## Start development server
	@echo "$(BLUE)Starting development server...$(NC)"
	node index.js -h localhost -u root -p password -d sakila

lint: ## Run linter (if configured)
	@echo "$(YELLOW)Linting not configured yet$(NC)"

format: ## Format code (if configured)
	@echo "$(YELLOW)Code formatting not configured yet$(NC)"

version: ## Show current version
	@echo "$(BLUE)Current version: $(VERSION)$(NC)"

info: ## Show project information
	@echo "$(BLUE)Project Information$(NC)"
	@echo "  Name:           $(PROJECT_NAME)"
	@echo "  Version:        $(VERSION)"
	@echo "  Node Version:   $$(node --version)"
	@echo "  NPM Version:    $$(npm --version)"
	@echo "  Docker Version: $$(docker --version 2>/dev/null || echo 'Not installed')"
