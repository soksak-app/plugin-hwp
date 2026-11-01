# Tests, builds and packs the hwp plugin (docs/features.md). pack writes the release with pnpm pack.
.PHONY: install test check studio pack push-check hooks

# The tests use the @soksak/plugin-api of the core release that package.json names.
# The installation stage (core docs/spec/plugins.md#repositories): it installs the locked dependencies and the exact Studio release source
# (docs/studio.md); the tests, checks and packs consume them without installing.
install:
	pnpm install --frozen-lockfile
	node scripts/install-studio-source.mjs

# test runs only the tests of this plugin, over fakes of the core side.
test:
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
check:
	node scripts/check-manifest.mjs
	$(if $(CORE_PLUGIN_API_DIR),node scripts/check-diagnostic-view-modules.mjs,true)
	$(SDK_EXPOSURE)
	$(SDK_ENGINES)
	$(SDK_EVENTS) --census census.json --catalog events.json
	$(SDK_RECORDS)
	node scripts/check-test-cases.mjs

# studio builds from the already installed rhwp-studio source into ui/studio (docs/studio.md).
studio:
	pnpm build

pack: studio
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	node --test test/studio-package-graph.test.mjs
	pnpm pack --pack-destination $(OUT)

# The check that a push needs: the commit messages of the pushed range, because a published commit message is kept; CI runs
# the tests and checks on the pushed commits.
# RANGE holds the commits of the pushed refs; the pre-push hook sets it, and it defaults to origin/main..HEAD.
push-check:
	pnpm exec soksak-commits "$(or $(RANGE),origin/main..HEAD)"

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
