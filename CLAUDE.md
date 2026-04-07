# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An Expo config plugin (`@niondigital/widgets-expo-config-plugin`) that adds iOS widget extension targets to Expo/React Native projects. It modifies the Xcode project at prebuild time — there is no runtime JavaScript component.

## Commands

- `npm run build` — Compile TypeScript from `src/` to `build/` (uses `expo-module build`)
- `npm run clean` — Remove build artifacts
- `npm test` — Run Jest tests (uses `expo-module test`; currently no project tests exist)
- `npm run prepare` — Prepare for publishing (build + lint)

All scripts delegate to `expo-module-scripts` which provides the TypeScript, Jest, ESLint, and Prettier configurations.

## Architecture

The plugin is a single pipeline of three Expo config modifiers, orchestrated in `src/withWidgets.ts`:

1. **`withEntitlements`** (`src/withEntitlements.ts`) — Adds app group entitlements to the main app's entitlements plist. Merges array-type entitlements (deduplicating) and overwrites scalar ones.

2. **`withExtensionInXcodeProject`** (`src/withExtensionInXcodeProject.ts`) — The core logic. Adds a widget extension target to the Xcode project by:
   - Recursively collecting all files from the user-specified `path` (plus any `additionalFiles`, validated for existence)
   - Auto-generating an `.entitlements` file if none exists, or merging the required app group into an existing one
   - Creating PBXGroup with relative file paths, adding the target as `app_extension`, adding Sources/Resources/Frameworks build phases
   - Applying separate Debug/Release build settings (`DEBUG_BUILD_SETTINGS` / `RELEASE_BUILD_SETTINGS` + user overrides via `buildSettings`)
   - All paths in build settings (INFOPLIST_FILE, CODE_SIGN_ENTITLEMENTS) are relative to `$(SRCROOT)`
   - Includes a workaround for a `cordova-node-xcode` bug with `PBXTargetDependency`/`PBXContainerItemProxy`

3. **`withEASExtraConfig`** (`src/withEASExtraConfig.ts`) — Registers the widget extension in `extra.eas.build.experimental.ios.appExtensions` so EAS CLI can generate correct credentials before the build.

### Plugin Props (`src/types/types.ts`)

```typescript
{
  name: string;           // Widget target name (also used in bundle ID suffix and app group)
  path: string;           // Path to widget Swift source files (relative to project root)
  additionalFiles?: string[];   // Extra files to include in the target
  entitlements?: Record<string, any>;  // Custom entitlements (merged with auto-generated app group)
  buildSettings?: Record<string, string>;  // Xcode build setting overrides
}
```

### Key Details

- Bundle ID pattern: `{ios.bundleIdentifier}.{name}`
- App group pattern: `group.{ios.bundleIdentifier}.{name}`
- The entry point is `app.plugin.js` which requires `build/withWidgets.js` — you must run `npm run build` after source changes
- `.xcassets` directories are collected as single resource files (not recursed into)
- The plugin skips target creation if a target with the same name already exists
