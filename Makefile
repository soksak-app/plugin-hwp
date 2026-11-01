# Tests, builds and packs the hwp plugin (docs/features.md). pack writes the release with pnpm pack.
.PHONY: install test check studio pack push-check hooks

# The installation stage (core docs/spec/plugins.md#repositories): it installs the locked dependencies and the exact Studio release source
# (docs/studio.md); the tests, checks and packs consume them without installing.
install:
	pnpm install --frozen-lockfile
	node scripts/install-studio-source.mjs

# test runs only the tests of this plugin, over fakes of the core side.
test:
	pnpm test

# check runs the checks of the kit releases that package.json pins: soksak-events checks that each source of occurrences has an
# event or a stated reason and that the emit sites match events.json, and soksak-records checks the records. The application
# validates plugin.json and diagnostics.json when it installs the release, and the registry check compares the exposed names of
# the release with each listed core.
check:
	pnpm exec soksak-events --census census.json --catalog events.json
	pnpm exec soksak-records

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
