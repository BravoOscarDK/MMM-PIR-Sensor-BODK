# MagicMirror BODK development agent

## Purpose and scope

Maintain a consistent family of MagicMirror modules for BravoOscarDK. Apply these standards to new modules and changes to existing modules. Speak Danish with the user unless requested otherwise; write source code, comments, default UI text, diagnostic messages and repository documentation in English.

The workspace standard is `C:/Dev/MagicMirror/AGENTS.md`. Each module repository also carries a standalone copy so these rules travel with its GitHub checkout. When changing shared standards, synchronize the copies; preserve any explicitly documented module-specific requirements. Follow the user's current instructions when they differ from these defaults.

## Reference and structure

- Use `MMM-BambuLab-BODK` as the reference for installation, configuration, English defaults, display options and documentation. Inspect relevant files before implementing; do not copy unrelated printer behavior or credentials.
- Name repositories, directories and registered modules `MMM-<Name>-BODK`, with exactly matching capitalization. Use `mmm-<name>-bodk` for the npm package name.
- Keep `<module>.js` for browser display and `node_helper.js` for server work when needed. Place reusable backend logic in `lib/`, setup utilities in `scripts/` and automated tests in `test/`. Add `<module>.css`, translations and `config.example.js` when appropriate.
- Keep frontend and backend responsibilities separate. Use MagicMirror lifecycle methods and socket notifications. Do not introduce a framework or shared runtime dependency solely to enforce consistent structure.
- Support separate instances where meaningful: route requests and responses by identifier, isolate connections and state, and avoid changing global date or language settings.
- Cancel timers, child processes, connections and listeners as appropriate on stop, suspension or reconfiguration. Avoid duplicate work and unbounded retries.

## Language and configuration

- Every module exposes `language: "en"` in its defaults and configuration example. English remains the default independently of MagicMirror's global language.
- Support at least English (`en`) and Danish (`da`). Normalize regional codes such as `da-DK`. Unsupported languages and missing translation keys fall back to English safely.
- Translate built-in user-facing labels, loading text, statuses and notifications. Technical diagnostics may remain English. Keep explicit custom labels, device names and upstream data unchanged.
- Keep translations in a maintainable dictionary or translation files. Ensure the actual lookup honors the module's own language; merely providing `getTranslations()` is insufficient if it follows the global language.
- Format dates using the selected module locale without mutating global Moment or browser state. Preserve existing documented date formats where compatibility requires them.
- Expose useful display sections and behavior through documented config options with sensible defaults. Validate configuration before starting external work; respect explicit `false`, `0` and empty-string values where supported.
- Use fictional placeholders in examples. Never embed personal addresses, IPs, access codes, tokens or account identifiers.

## Installation and dependencies

- Standard installation: `cd ~/MagicMirror/modules`, clone `https://github.com/BravoOscarDK/<module>.git`, enter the module folder, then run `npm install`.
- Standard update: enter the module folder, run `git pull --ff-only`, run `npm install`, then restart MagicMirror.
- Declare runtime npm dependencies in `package.json`; commit `package-lock.json`. State the supported Node.js version and keep it compatible with the targeted MagicMirror release.
- Provide `npm test` and an appropriate `npm run check` for new modules. Preserve existing useful checks and add missing checks when touching their setup.
- If Python is required, keep requirements in `requirements.txt` and use npm setup to create a module-local `.venv` and install them. Run the helper with that environment by default; provide a documented override when useful.
- Setup must be repeatable, report actionable errors and preserve existing user configuration and data. Never run sudo or install OS packages silently from npm lifecycle scripts.
- Document unavoidable OS prerequisites separately, such as Python/venv, MPlayer, GPIO permissions and display tools. Do not claim npm installs system programs or proves hardware support.
- Exclude `node_modules/`, `.venv/`, `.tools/`, caches, secrets and generated private data from Git. Retain existing licenses and upstream attribution.

## Documentation

- Write an English README with purpose, prerequisites, clone plus npm installation, a pasteable module config, configuration defaults, language selection, updating and relevant troubleshooting or limitations.
- Include `language: "en"` in examples and show how to select Danish with `language: "da"`.
- Keep README tables, config examples, actual defaults and dependencies consistent. Explain required external account or hardware setup where applicable.

## Validation and completion

- Inspect Git status and applicable instructions before editing. Preserve unrelated user changes and do not stage secrets or development artifacts.
- Verify syntax and run relevant existing tests. Add focused regression coverage for changed behavior, including English defaults, Danish selection and fallback when changing language handling.
- Verify `npm install` when changing installation or dependencies. Use mocks for external services and hardware; explicitly distinguish automated checks from real device tests. Do not claim Raspberry Pi validation from Windows-only checks.
- Review the final diff and documentation, then run `git diff --check`. Verify only intended files are staged.
- When GitHub updates are authorized for the task, fetch first, check divergence, commit a clear description and push to the existing repository branch. Never force-push or overwrite remote changes. Verify synchronization after pushing. Otherwise leave the completed changes locally and report their state.
- Report what changed, what was tested, any hardware limitations and whether GitHub was updated. Keep the user-facing report concise and in Danish.

## Existing module context

As of 2026-11-10, this family includes BambuLab, GoogleNestDoorbell, MPlayer, MyGarbage, MyGarbageDate, PIR-Sensor and Verisure under the `MMM-*-BODK` naming convention. Each module is a separate Git repository owned by `BravoOscarDK`; the parent MagicMirror folder is a shared workspace. Verify current files and repository state rather than assuming previous test results still apply.

MyGarbage's Danish CSV column names and pictogram assets are compatibility data. Preserve their schema and filenames when changing UI language. MyGarbageDate generates that compatible CSV. PIR and MPlayer require real Raspberry Pi/Linux validation for hardware and display behavior.
