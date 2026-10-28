# Tests, builds and packs the hwp plugin (docs/features.md). pack uses the sok of core.
.PHONY: test check install-studio-source studio pack push-check hooks

SOK ?= sok
# DIAGNOSTICS=1 adds diagnostics.json to the plugin release.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# The tests use the @soksak/plugin-api of the core release that package.json names.
node_modules: package.json
	pnpm install
	touch node_modules

# test runs only the tests of this plugin, over fakes of the core side.
test: node_modules
	pnpm test

# check runs the SDK validators of the pinned @soksak/plugin-api, or of the packages/plugin-api source of core when
# CORE_PLUGIN_API_DIR names it (README.md). scripts/check-manifest.mjs validates plugin.json and diagnostics.json with
# validateManifest and validateDiagnostics.
# soksak-exposure checks the exposure names of the page against plugin.json and the core declarations, soksak-engines checks
# that engines.soksak admits the core release of that @soksak/plugin-api, soksak-events checks that each source of occurrences
# has an event or a stated reason and that the emit sites match events.json, and soksak-records checks the records.
SDK_EXPOSURE = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/exposure-check.js,pnpm exec soksak-exposure)
SDK_ENGINES = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/engines-check.js,pnpm exec soksak-engines)
SDK_EVENTS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/events-check.js,pnpm exec soksak-events)
SDK_RECORDS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/records-check.js,pnpm exec soksak-records)
check: node_modules
	node scripts/check-manifest.mjs
	$(if $(CORE_PLUGIN_API_DIR),node scripts/check-diagnostic-view-modules.mjs,true)
	$(SDK_EXPOSURE)
	$(SDK_ENGINES)
	$(SDK_EVENTS) --census census.json --catalog events.json
	$(SDK_RECORDS)
	node scripts/check-test-cases.mjs

# install-studio-source prepares the exact release source; local development can use an installed symlink directly.
install-studio-source:
	node scripts/install-studio-source.mjs

# studio builds from the already installed rhwp-studio source into ui/studio (docs/studio.md).
studio: node_modules
	pnpm build

pack: studio
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	node --test test/studio-package-graph.test.mjs
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# The checks of the ci workflow that a push needs: make test, make check, and the commit messages of the pushed range.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
push-check: test check
	pnpm exec soksak-commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
