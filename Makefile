# Tests, builds and packs the hwp plugin (docs/features.md). pack uses the sok of core.
.PHONY: test check studio pack hooks

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
# CORE_PLUGIN_API_DIR names it (README.md). scripts/check-manifest.mjs validates plugin.json with validateManifest.
# soksak-exposure checks the exposure names of the page against plugin.json and the core declarations, soksak-engines checks
# that engines.soksak admits the core release of that @soksak/plugin-api, soksak-events checks that each source of occurrences
# has an event or a stated reason and that the emit sites match events.json, and soksak-records checks the records.
SDK_EXPOSURE = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/exposure-check.js,pnpm exec soksak-exposure)
SDK_ENGINES = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/engines-check.js,pnpm exec soksak-engines)
SDK_EVENTS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/events-check.js,pnpm exec soksak-events)
SDK_RECORDS = $(if $(CORE_PLUGIN_API_DIR),node $(CORE_PLUGIN_API_DIR)/records-check.js,pnpm exec soksak-records)
check: node_modules
	node scripts/check-manifest.mjs
	$(SDK_EXPOSURE)
	$(SDK_ENGINES)
	$(SDK_EVENTS) --census census.json --catalog events.json
	$(SDK_RECORDS)
	node scripts/check-test-cases.mjs

# studio builds rhwp-studio into ui/studio (docs/studio.md).
studio: node_modules
	pnpm build

pack: studio
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
