# Tests, builds and packs the hwp plugin (docs/features.md). pack uses the sok of core.
.PHONY: test studio pack hooks

SOK ?= sok
# DIAGNOSTICS=1 adds diagnostics.json to the plugin release.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# The tests use the @soksak/plugin-api of the core release that package.json names.
node_modules: package.json
	pnpm install
	touch node_modules

# soksak-exposure checks the exposure names of the page against plugin.json and the core declarations, and
# soksak-engines checks that engines.soksak admits the core release of that @soksak/plugin-api, and
# soksak-events checks that each source of occurrences has an event or a stated reason and that the emit sites match events.json.
test: node_modules
	pnpm test
	pnpm exec soksak-exposure
	pnpm exec soksak-engines
	pnpm exec soksak-events --census census.json --catalog events.json
	pnpm exec soksak-records

# studio builds rhwp-studio into ui/studio (docs/studio.md).
studio: node_modules
	pnpm build

pack: studio
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)

# Sets this repository to use .githooks, which checks commit messages and records at commit time.
hooks:
	@git config core.hooksPath .githooks
