# Tests, builds and packs the hwp plugin (docs/features.md). pack uses the sok of core.
.PHONY: test studio pack

SOK ?= sok
# DIAGNOSTICS=1 packs a diagnostics package that holds diagnostics.json.
PACK_FLAGS = $(if $(DIAGNOSTICS),--diagnostics,)

# The tests use the @soksak/plugin-api of the core release that package.json names.
node_modules: package.json
	pnpm install
	touch node_modules

# soksak-exposure checks the exposure names of the page against plugin.json and the core declarations, and
# soksak-engines checks that engines.soksak admits the core release of that @soksak/plugin-api.
test: node_modules
	pnpm test
	pnpm exec soksak-exposure
	pnpm exec soksak-engines

# studio builds rhwp-studio into ui/studio (docs/studio.md).
studio: node_modules
	pnpm build

pack: studio
	@test -n "$(OUT)" || { echo "make pack OUT=<folder>" >&2; exit 2; }
	$(SOK) plugin pack . $(OUT) $(PACK_FLAGS)
