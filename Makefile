# Müslidian — Makefile
#
# Standard dev lifecycle for an Obsidian plugin. See `make help`.
#
# Configuration: copy .env.example → .env and set OBSIDIAN_PLUGIN_TARGET to
# the path of your test vault's `.obsidian/plugins/` directory.

# --- Config ---------------------------------------------------------------

PLUGIN_ID := mueslidian
DIST      := dist
RELEASE   := release

# .env (gitignored) provides OBSIDIAN_PLUGIN_TARGET
-include .env
export OBSIDIAN_PLUGIN_TARGET

TARGET := $(OBSIDIAN_PLUGIN_TARGET)/$(PLUGIN_ID)

.DEFAULT_GOAL := help
.PHONY: help setup doctor build watch clean install link unlink uninstall reinstall \
        typecheck lint test test-watch check ci release-check release

# --- Discovery ------------------------------------------------------------

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z][a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "  OBSIDIAN_PLUGIN_TARGET = $(if $(OBSIDIAN_PLUGIN_TARGET),$(OBSIDIAN_PLUGIN_TARGET),<unset; copy .env.example to .env>)"

# --- Environment ----------------------------------------------------------

setup: ## Install npm dependencies
	npm install

doctor: ## Verify dev environment (node, .env, vault path)
	@printf "Node version: "; node --version
	@node -e 'process.exit(parseInt(process.version.slice(1)) >= 18 ? 0 : 1)' \
		|| (echo "Need Node ≥ 18"; exit 1)
	@test -n "$(OBSIDIAN_PLUGIN_TARGET)" \
		|| (echo "OBSIDIAN_PLUGIN_TARGET not set (cp .env.example .env)"; exit 1)
	@test -d "$(OBSIDIAN_PLUGIN_TARGET)" \
		|| (echo "OBSIDIAN_PLUGIN_TARGET does not exist: $(OBSIDIAN_PLUGIN_TARGET)"; exit 1)
	@test -d "node_modules" \
		|| (echo "node_modules missing — run 'make setup'"; exit 1)
	@command -v jq >/dev/null \
		|| echo "Warning: 'jq' not found — 'make release-check' will fail"
	@echo "doctor: OK ($(OBSIDIAN_PLUGIN_TARGET))"

# --- Build ----------------------------------------------------------------

build: ## Production build → dist/{main.js,mueslidian.js,manifest.json}
	npm run build

watch: ## esbuild watch mode (rebuilds dist/ on save)
	npm run dev

clean: ## Remove build outputs (dist/, release/)
	rm -rf $(DIST) $(RELEASE)

# --- Local install --------------------------------------------------------
# Two flows:
#   install : build → COPY dist/ into vault. Stable artefact. Re-run after each change.
#   link    : SYMLINK vault → dist/. One-time. `make watch` + Hot Reload picks up edits.

install: build _require_target ## Build then copy dist/* → vault plugins/<id>/
	@mkdir -p "$(TARGET)"
	@cp "$(DIST)/main.js" "$(TARGET)/main.js"
	@cp manifest.json "$(TARGET)/manifest.json"
	@test -f "$(DIST)/styles.css" && cp "$(DIST)/styles.css" "$(TARGET)/styles.css" || true
	@echo "Installed → $(TARGET)"
	@echo "Reload Obsidian (Cmd-R in dev tools) or use the Hot Reload plugin."

link: build _require_target ## Symlink vault plugins/<id>/ → ./dist (for live dev with Hot Reload)
	@if [ -e "$(TARGET)" ] && [ ! -L "$(TARGET)" ]; then \
		echo "Refusing to overwrite non-symlink at $(TARGET) — run 'make uninstall' first"; \
		exit 1; \
	fi
	@rm -f "$(TARGET)"
	@mkdir -p "$(dir $(TARGET))"
	@ln -s "$(CURDIR)/$(DIST)" "$(TARGET)"
	@echo "Linked $(TARGET) → $(CURDIR)/$(DIST)"
	@echo "Run 'make watch' in another terminal. Install Obsidian's Hot Reload plugin for auto-reload."

unlink: _require_target ## Remove the symlink (refuses to touch a non-symlink)
	@if [ -L "$(TARGET)" ]; then \
		rm "$(TARGET)" && echo "Unlinked $(TARGET)"; \
	elif [ -e "$(TARGET)" ]; then \
		echo "Refusing: $(TARGET) is not a symlink. Use 'make uninstall' to remove it."; \
		exit 1; \
	else \
		echo "Nothing to unlink at $(TARGET)"; \
	fi

uninstall: _require_target ## Remove the plugin folder (or symlink) from the vault
	@rm -rf "$(TARGET)"
	@echo "Removed $(TARGET)"

reinstall: uninstall install ## uninstall + install

_require_target:
	@test -n "$(OBSIDIAN_PLUGIN_TARGET)" \
		|| (echo "OBSIDIAN_PLUGIN_TARGET not set (cp .env.example .env)"; exit 1)

# --- Quality --------------------------------------------------------------

typecheck: ## tsc --noEmit
	npm run typecheck

lint: ## eslint sources
	npm run lint

test: ## Run vitest once
	npm test

test-watch: ## Run vitest in watch mode
	npm run test:watch

check: typecheck lint test ## typecheck + lint + test (pre-commit gate)

ci: ## Run the exact CI pipeline locally (npm ci + test + tsc + audit)
	npm ci
	npm run test
	npx tsc --noEmit
	npm audit --audit-level=moderate

# --- Release --------------------------------------------------------------

release-check: ## Verify clean tree + version consistency across manifest/package/versions.json
	@command -v jq >/dev/null || (echo "'jq' required for release-check"; exit 1)
	@test -z "$$(git status --porcelain)" || (echo "Working tree dirty — commit or stash first"; exit 1)
	@MV=$$(jq -r '.version' manifest.json); \
	 PV=$$(jq -r '.version' package.json); \
	 test "$$MV" = "$$PV" || (echo "Version mismatch: manifest=$$MV package=$$PV"; exit 1); \
	 jq -e --arg v "$$MV" '.[$$v]' versions.json > /dev/null \
		|| (echo "versions.json has no entry for $$MV"; exit 1); \
	 echo "Versions consistent ($$MV)"

release: release-check build ## Build a release set in ./release/ ready for GitHub
	@mkdir -p $(RELEASE)
	@cp $(DIST)/main.js $(RELEASE)/main.js
	@cp manifest.json $(RELEASE)/manifest.json
	@test -f $(DIST)/styles.css && cp $(DIST)/styles.css $(RELEASE)/styles.css || true
	@V=$$(jq -r '.version' manifest.json); \
	 echo "Release artefacts in ./$(RELEASE)/ for v$$V."; \
	 echo "Next: git tag v$$V && git push --tags && create a GitHub release with the files above."
