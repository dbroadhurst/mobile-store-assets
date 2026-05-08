---
name: store-init
description: >
  Bootstrap a project for the mobile-store-assets workflow. Creates the
  marketing/ folder layout (config, env example, screenshot subfolders for
  every default platform, starter spec.yaml), updates .gitignore, and prints
  next-step instructions. Run this once per project before /store-spec.
argument-hint: "[version] [--app-name '...'] [--bundle-id '...'] [--category '...'] [--force]"
allowed-tools: Read Write Bash Glob
---

## Tooling check

!`command -v store-assets-gen >/dev/null 2>&1 && echo "✓ store-assets-gen found" || echo "⚠️  store-assets-gen not found — re-install the plugin"`

## Project root sanity check

!`ls package.json pubspec.yaml *.xcodeproj build.gradle build.gradle.kts Cargo.toml Package.swift go.mod 2>/dev/null | head -3 || echo "(no recognised project manifest in current directory — make sure you're in the project root before continuing)"`

## Existing marketing folder

!`ls marketing/ 2>/dev/null && echo "(marketing/ already exists — pass --force to overwrite, or skip files that exist)" || echo "(no marketing/ folder yet — will create)"`

---

## Your task

Arguments: $ARGUMENTS

**Parse the arguments:**

- First bare value = version (e.g. `1.0.0`). If omitted, default to `1.0.0`.
- `--app-name "..."` — overrides the placeholder `"My App"` in the config.
- `--bundle-id "..."` — overrides `"com.example.myapp"` in the config.
- `--category "..."` — App Store / Play category (e.g. Finance, Productivity).
- `--force` — overwrite existing files. Without this, existing files are
  preserved and the skill prints a notice.

If any flag is missing, infer sensible values from the project root:
- `--app-name` from `package.json`'s `name`, `pubspec.yaml`'s `name`,
  Xcode project name, or the project directory name.
- `--bundle-id` from existing `Info.plist`, `AndroidManifest.xml`,
  `pubspec.yaml`, or fall back to `com.example.{appname}`.

---

### Step 1 — Locate plugin templates

The plugin ships templates next to this skill. Find them with:

```bash
PLUGIN_DIR="$(dirname "$(command -v store-assets-gen)")/.."
ls "$PLUGIN_DIR/templates"
```

Expected files:
- `templates/.store-config.yaml`
- `templates/.env.local.example`
- `templates/spec-starter.yaml`
- `templates/review.html`

If templates are missing, the plugin is incompletely installed — reinstall
before proceeding.

---

### Step 2 — Create the folder structure

```
marketing/
├── .store-config.yaml          ← config (filled with the user's app details)
├── .env.local.example          ← API-key placeholders
└── releases/
    └── {version}/
        └── screenshots/
            ├── android-phone/
            ├── android-tablet/
            ├── ios-phone/
            └── ios-tablet/
```

Use `mkdir -p` for idempotency. Don't create `output/` or `.cache/` — those
are generated on first render.

If the project supports landscape-native screenshots (games, video apps,
navigation), also create the matching folders — but ask the user first.

---

### Step 3 — Copy + customise templates

#### `marketing/.store-config.yaml`

Copy from `$PLUGIN_DIR/templates/.store-config.yaml`. Then replace:
- `"My App"` → user's app name (from `--app-name` or inferred)
- `"com.example.myapp"` → bundle id (from `--bundle-id` or inferred)
- The `category:` line → user's category if provided, else leave the
  template default with a comment

Don't fill in brand colours — leave the template defaults so the user
edits them, OR run `store-assets-gen --extract-theme <icon-path>` if the
user has an icon and wants the theme auto-derived.

#### `marketing/.env.local.example`

Copy from `$PLUGIN_DIR/templates/.env.local.example` verbatim. **Never
auto-create `.env.local` itself** — the user must rename it intentionally
and add their key.

#### `marketing/releases/{version}/spec.yaml`

Copy from `$PLUGIN_DIR/templates/spec-starter.yaml` and substitute
`{{VERSION}}` with the actual version. This gives the user a working
skeleton to either edit by hand or fill via `/store-spec`.

---

### Step 4 — Update .gitignore

In the project root's `.gitignore` (create if missing), append:

```
# mobile-store-assets
marketing/.env.local
marketing/.cache/
marketing/releases/*/output/
```

Idempotent — check whether the section already exists before appending.

---

### Step 5 — Print next-step summary

Output something like:

```
✓ Bootstrapped marketing/ for {appName}
  marketing/.store-config.yaml      ← edit brand colours + theme
  marketing/.env.local.example      ← rename to .env.local + add API key (optional)
  marketing/releases/{version}/screenshots/  ← drop screenshots here
  marketing/releases/{version}/spec.yaml      ← starter spec

Next steps:
  1. Add screenshots to marketing/releases/{version}/screenshots/{platform}/
  2. (Optional) Add an app icon at the path in .store-config.yaml
  3. Run /store-spec {version}     — author the ASO copy + 4-set matrix
  4. Run /store-assets {version}   — render every iOS + Android asset
```

If anything was skipped because a file already existed (without `--force`),
list each skip explicitly so the user knows what they're preserving.

---

## Behaviour rules

- **Idempotent.** Re-running without `--force` should be a no-op for any
  file that already exists.
- **Never overwrite** `.env.local` (the real one) — that's the user's
  secret. Only create `.env.local.example`.
- **Confirm before destructive ops.** If `--force` is passed, list every
  file that will be overwritten before doing it.
- **Project-root check.** If the current directory has no recognised
  project manifest, warn and ask the user to confirm — they may be
  running from inside the marketing/ folder by mistake.
- **No network calls.** This is a pure filesystem bootstrap. Don't fetch
  anything online.

---

## Optional flags

| Flag | Effect |
|------|--------|
| `--app-name "Coin"` | Set app name in config (skip inference) |
| `--bundle-id com.foo.coin` | Set bundle id (skip inference) |
| `--category Finance` | Set Play / App Store category |
| `--include-all` | Also create folders for every opt-in platform (ios-phone-6.7, ios-phone-6.5, ios-tablet-13, android-7-tablet, wear-os, android-tv-banner) |
| `--landscape` | Also create folders inside each screenshot dir for landscape-native sources |
| `--force` | Overwrite existing files |

---

## After /store-init

The user's typical flow:

```
/store-init 1.0.0 --app-name "Coin" --bundle-id "com.example.coin" --category Finance
# (user adds screenshots + icon)
/store-spec 1.0.0 --sets 4 --locales en-US,fr-FR,de-DE
# (user reviews spec.yaml, edits if needed)
/store-assets 1.0.0
# (user opens marketing/releases/1.0.0/review.html to vote on the matrix)
```
