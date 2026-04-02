import { ConfigPlugin, withXcodeProject } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import plist, { PlistObject } from 'plist';

import { WidgetsPluginProps } from './types/types';

/**
 * Common build configuration settings shared between Debug and Release
 */
const COMMON_BUILD_SETTINGS = {
	ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: 'AccentColor',
	ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME: 'WidgetBackground',
	CLANG_ANALYZER_NONNULL: 'YES',
	CLANG_ANALYZER_NUMBER_OBJECT_CONVERSION: 'YES_AGGRESSIVE',
	CLANG_CXX_LANGUAGE_STANDARD: '"gnu++17"',
	CLANG_ENABLE_OBJC_WEAK: 'YES',
	CLANG_WARN_DOCUMENTATION_COMMENTS: 'YES',
	CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER: 'YES',
	CLANG_WARN_UNGUARDED_AVAILABILITY: 'YES_AGGRESSIVE',
	CODE_SIGN_STYLE: 'Automatic',
	GCC_C_LANGUAGE_STANDARD: 'gnu11',
	GENERATE_INFOPLIST_FILE: 'NO',
	IPHONEOS_DEPLOYMENT_TARGET: '18.0',
	LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
	MTL_FAST_MATH: 'YES',
	PRODUCT_NAME: '"$(TARGET_NAME)"',
	SKIP_INSTALL: 'YES',
	SWIFT_EMIT_LOC_STRINGS: 'YES',
	SWIFT_VERSION: '5.0',
	TARGETED_DEVICE_FAMILY: '"1,2"'
};

/**
 * Debug-specific build settings
 */
const DEBUG_BUILD_SETTINGS = {
	...COMMON_BUILD_SETTINGS,
	DEBUG_INFORMATION_FORMAT: 'dwarf',
	MTL_ENABLE_DEBUG_INFO: 'INCLUDE_SOURCE',
	SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG',
	SWIFT_OPTIMIZATION_LEVEL: '-Onone'
};

/**
 * Release-specific build settings
 */
const RELEASE_BUILD_SETTINGS = {
	...COMMON_BUILD_SETTINGS,
	DEBUG_INFORMATION_FORMAT: '"dwarf-with-dsym"',
	MTL_ENABLE_DEBUG_INFO: 'NO',
	SWIFT_ACTIVE_COMPILATION_CONDITIONS: '"$(inherited)"',
	SWIFT_OPTIMIZATION_LEVEL: '-O'
};

/**
 * Adds a widget extension target to the Xcode project.
 *
 * @param config - The Expo config
 * @param props - Widget plugin properties
 * @returns Updated Expo config with widget extension target
 */
export const withExtensionInXcodeProject: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	return withXcodeProject(config, (newConfig) => {
		const xcodeProject = newConfig.modResults;

		const targetName = props.name;
		const { path: extensionPath } = props;
		const widgetBundleId = `${config.ios?.bundleIdentifier}.${targetName}`;

		// Skip if target already exists
		if (xcodeProject.pbxTargetByName(targetName)) {
			console.log(`${targetName} already exists in project. Skipping...`);
			return newConfig;
		}

		const projectRoot = newConfig.modRequest.projectRoot;
		const platformProjectRoot = newConfig.modRequest.platformProjectRoot;
		const absoluteExtensionPath = path.join(projectRoot, extensionPath);

		// Collect files from extension directory (absolute paths for validation)
		const absoluteFilesInPath: string[] = collectFilesFromDirectory(absoluteExtensionPath);

		// Validate and resolve additional files
		const absoluteAdditionalFiles: string[] = (props.additionalFiles || []).map((file) => {
			const absolutePath = path.join(projectRoot, file);
			if (!fs.existsSync(absolutePath)) {
				throw new Error(
					`Additional file does not exist: ${file}. Please check the path in your plugin configuration.`
				);
			}
			return absolutePath;
		});

		const absoluteAllFiles: string[] = [...absoluteFilesInPath, ...absoluteAdditionalFiles];

		// Handle entitlements: ensure app group is present or create new file
		const appGroup = `group.${config?.ios?.bundleIdentifier || ''}.${props.name}`;
		const existingEntitlementsFile = absoluteAllFiles.find((file) => file.endsWith('.entitlements'));

		if (existingEntitlementsFile) {
			ensureAppGroupInEntitlements(existingEntitlementsFile, appGroup);
		} else {
			absoluteAllFiles.push(writeEntitlementsFile(platformProjectRoot, props));
		}

		// Convert all paths to relative (to extension directory) for PBXGroup file references
		const relativeFiles = absoluteAllFiles.map((file) => path.relative(absoluteExtensionPath, file));

		// Filter files by type for different build phases
		const sourceFiles = relativeFiles.filter((file) => file.endsWith('.swift'));
		const resourceFiles = relativeFiles.filter(
			(file) =>
				file.endsWith('.xcassets') ||
				file.endsWith('.storyboard') ||
				file.endsWith('.xib') ||
				file.endsWith('.strings') ||
				file.endsWith('.xcstrings') ||
				file.endsWith('.intentdefinition') ||
				file.endsWith('.json')
		);

		// Paths for build settings (relative to platformProjectRoot = $(SRCROOT))
		const entitlementsAbsolutePath = absoluteAllFiles.findLast((file) =>
			file.endsWith('.entitlements')
		) as string;
		const entitlementsPathForBuildSettings = path.relative(platformProjectRoot, entitlementsAbsolutePath);
		const infoPlistPathForBuildSettings = path.relative(
			platformProjectRoot,
			path.join(absoluteExtensionPath, 'Info.plist')
		);

		// PBXGroup path relative to ios folder
		const groupPath = path.join('..', extensionPath);

		// Add the new PBXGroup to the top level group. This makes the
		// files / folder appear in the file explorer in Xcode.
		const extGroup = xcodeProject.addPbxGroup(relativeFiles, targetName, groupPath);

		// Add the new PBXGroup to the top level group
		const groups: any[] = xcodeProject.hash.project.objects['PBXGroup'];
		Object.entries(groups).forEach(([key, group]) => {
			if (typeof group === 'object' && group.name === undefined && group.path === undefined) {
				xcodeProject.addToPbxGroup(extGroup.uuid, key);
			}
		});

		/// WORK AROUND for codeProject.addTarget BUG
		// Xcode projects don't contain these if there is only one target
		// An upstream fix should be made to the code referenced in this link:
		//   - https://github.com/apache/cordova-node-xcode/blob/8b98cabc5978359db88dc9ff2d4c015cba40f150/lib/pbxProject.js#L860
		const projObjects = xcodeProject.hash.project.objects;
		projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
		projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

		// Add the target
		const newTarget = xcodeProject.addTarget(targetName, 'app_extension', targetName, widgetBundleId);

		// Add build phases to the new target
		xcodeProject.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', newTarget.uuid);

		xcodeProject.addBuildPhase(resourceFiles, 'PBXResourcesBuildPhase', 'Resources', newTarget.uuid);

		xcodeProject.addBuildPhase(
			['SwiftUI.framework', 'WidgetKit.framework'],
			'PBXFrameworksBuildPhase',
			'Frameworks',
			newTarget.uuid
		);

		// Apply build settings per configuration (Debug vs Release)
		const configurations = xcodeProject.pbxXCBuildConfigurationSection();

		Object.values(configurations).forEach((configuration: any) => {
			if (typeof configuration === 'object' && configuration.buildSettings?.PRODUCT_NAME === `"${targetName}"`) {
				const isDebug = configuration.name === 'Debug';
				const baseSettings = isDebug ? DEBUG_BUILD_SETTINGS : RELEASE_BUILD_SETTINGS;

				configuration.buildSettings = {
					...configuration.buildSettings,
					...baseSettings,
					INFOPLIST_FILE: infoPlistPathForBuildSettings,
					MARKETING_VERSION: config.version ?? '1.0.0',
					CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? '1',
					PRODUCT_BUNDLE_IDENTIFIER: widgetBundleId,
					CODE_SIGN_ENTITLEMENTS: entitlementsPathForBuildSettings,
					...props.buildSettings
				};
			}
		});

		// Add SPM packages to the widget target if configured
		if (props.spmPackages?.length) {
			addSpmPackages(xcodeProject, targetName, newTarget.uuid, props.spmPackages);

			// In debug builds, Xcode compiles SPM packages as dynamic frameworks
			// placed in PackageFrameworks/. The main app target gets these embedded
			// automatically, but extension targets added via config plugins do not.
			// This script phase copies any SPM package frameworks into the extension
			// bundle so dyld can find them at runtime.
			addEmbedSpmFrameworksScriptPhase(xcodeProject, targetName);
		}

		return newConfig;
	});
};

/**
 * Adds Swift Package Manager dependencies to the widget extension target.
 * Directly manipulates the Xcode project hash since cordova-node-xcode has no SPM support.
 */
function addSpmPackages(
	xcodeProject: any,
	targetName: string,
	targetUuid: string,
	spmPackages: NonNullable<WidgetsPluginProps['spmPackages']>
): void {
	const projObjects = xcodeProject.hash.project.objects;
	projObjects['XCRemoteSwiftPackageReference'] = projObjects['XCRemoteSwiftPackageReference'] || {};
	projObjects['XCSwiftPackageProductDependency'] = projObjects['XCSwiftPackageProductDependency'] || {};

	const rootProjectKey = xcodeProject.hash.project.rootObject;
	const rootProject = projObjects['PBXProject'][rootProjectKey];
	rootProject.packageReferences = rootProject.packageReferences || [];

	const nativeTargets = projObjects['PBXNativeTarget'];
	const widgetTarget = Object.values(nativeTargets).find(
		(val: any) => typeof val === 'object' && val.name === `"${targetName}"`
	) as any;

	if (!widgetTarget) {
		throw new Error(`Could not find PBXNativeTarget for "${targetName}"`);
	}

	widgetTarget.packageProductDependencies = widgetTarget.packageProductDependencies || [];

	// Find the Frameworks build phase belonging to the widget target
	const frameworksBuildPhases = projObjects['PBXFrameworksBuildPhase'];
	let widgetFrameworksPhase: any = null;
	for (const bp of widgetTarget.buildPhases) {
		const phase = frameworksBuildPhases[bp.value];
		if (phase && phase.isa === 'PBXFrameworksBuildPhase') {
			widgetFrameworksPhase = phase;
			break;
		}
	}

	for (const pkg of spmPackages) {
		// Idempotency: check if a package reference with the same URL already exists
		const existingRefUuid = Object.entries(projObjects['XCRemoteSwiftPackageReference']).find(
			([key, val]: [string, any]) =>
				typeof val === 'object' && (val.repositoryURL === `"${pkg.url}"` || val.repositoryURL === pkg.url)
		)?.[0];

		if (existingRefUuid) {
			console.log(`SPM package ${pkg.url} already exists in project. Skipping...`);
			continue;
		}

		// 1. XCRemoteSwiftPackageReference
		const packageRefUuid = xcodeProject.generateUuid();
		projObjects['XCRemoteSwiftPackageReference'][packageRefUuid] = {
			isa: 'XCRemoteSwiftPackageReference',
			repositoryURL: `"${pkg.url}"`,
			requirement: {
				kind: 'upToNextMajorVersion',
				minimumVersion: pkg.version
			}
		};
		projObjects['XCRemoteSwiftPackageReference'][`${packageRefUuid}_comment`] =
			`XCRemoteSwiftPackageReference "${pkg.product}"`;

		// 2. Add to root project's packageReferences
		rootProject.packageReferences.push({
			value: packageRefUuid,
			comment: `XCRemoteSwiftPackageReference "${pkg.product}"`
		});

		// 3. XCSwiftPackageProductDependency
		const productDepUuid = xcodeProject.generateUuid();
		projObjects['XCSwiftPackageProductDependency'][productDepUuid] = {
			isa: 'XCSwiftPackageProductDependency',
			package: packageRefUuid,
			productName: pkg.product
		};
		projObjects['XCSwiftPackageProductDependency'][`${productDepUuid}_comment`] = pkg.product;

		// Add to widget target's packageProductDependencies
		widgetTarget.packageProductDependencies.push({
			value: productDepUuid,
			comment: pkg.product
		});

		// 4. PBXBuildFile with productRef (links product in Frameworks phase)
		const buildFileUuid = xcodeProject.generateUuid();
		projObjects['PBXBuildFile'][buildFileUuid] = {
			isa: 'PBXBuildFile',
			productRef: productDepUuid,
			productRef_comment: pkg.product
		};
		projObjects['PBXBuildFile'][`${buildFileUuid}_comment`] = `${pkg.product} in Frameworks`;

		// Add to Frameworks build phase
		if (widgetFrameworksPhase) {
			widgetFrameworksPhase.files = widgetFrameworksPhase.files || [];
			widgetFrameworksPhase.files.push({
				value: buildFileUuid,
				comment: `${pkg.product} in Frameworks`
			});
		}
	}
}

/**
 * Adds a "Run Script" build phase to the widget target that copies SPM package
 * frameworks into the extension's Frameworks directory.
 *
 * In debug builds, Xcode compiles SPM packages as dynamic frameworks and places
 * them in DerivedData/Build/Products/<config>/PackageFrameworks/. The main app
 * target embeds these automatically, but extension targets added via config
 * plugins do not — causing a dyld "Library missing" crash at runtime.
 *
 * In release builds SPM typically uses static linking so no .framework files
 * exist and the script is a no-op. However, packages that declare `type: .dynamic`
 * in their Package.swift will produce dynamic frameworks even in release builds —
 * the script handles that case correctly.
 *
 * Searches PackageFrameworks/ first (Xcode's dedicated SPM output dir), then
 * BUILT_PRODUCTS_DIR/ as fallback since some setups (e.g. Expo/React Native)
 * place SPM dynamic frameworks there directly. Frameworks already copied from
 * PackageFrameworks/ are skipped in the second pass (deduplication).
 */
function addEmbedSpmFrameworksScriptPhase(xcodeProject: any, targetName: string): void {
	const nativeTargets = xcodeProject.hash.project.objects['PBXNativeTarget'];
	const widgetTarget = Object.values(nativeTargets).find(
		(val: any) => typeof val === 'object' && val.name === `"${targetName}"`
	) as any;

	if (!widgetTarget) {
		throw new Error(`Could not find PBXNativeTarget for "${targetName}"`);
	}

	const projObjects = xcodeProject.hash.project.objects;
	projObjects['PBXShellScriptBuildPhase'] = projObjects['PBXShellScriptBuildPhase'] || {};

	const rawScript = [
		'set -euo pipefail',
		'# Copy SPM dynamic frameworks into the extension bundle.',
		'# Searches PackageFrameworks/ first (Xcode dedicated SPM output dir),',
		'# then BUILT_PRODUCTS_DIR/ as fallback (some setups place frameworks there directly).',
		'EXT_FW_DIR="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
		'COPIED=0',
		'COPIED_NAMES=""',
		'for search_dir in "${BUILT_PRODUCTS_DIR}/PackageFrameworks" "${BUILT_PRODUCTS_DIR}"; do',
		'  [ -d "${search_dir}" ] || continue',
		'  for fw in "${search_dir}/"*.framework; do',
		'    [ -e "${fw}" ] || continue',
		'    FW_BASE=$(basename "${fw}")',
		'    echo "${COPIED_NAMES}" | grep -qF "${FW_BASE}" && continue',
		'    mkdir -p "${EXT_FW_DIR}"',
		'    ditto "${fw}" "${EXT_FW_DIR}/${FW_BASE}"',
		'    if [ -n "${EXPANDED_CODE_SIGN_IDENTITY}" ]; then',
		'      codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements --timestamp=none "${EXT_FW_DIR}/${FW_BASE}" || {',
		'        echo "[Embed SPM] ERROR: codesign failed for ${FW_BASE}" >&2',
		'        exit 1',
		'      }',
		'    fi',
		'    COPIED_NAMES="${COPIED_NAMES} ${FW_BASE}"',
		'    COPIED=$((COPIED+1))',
		'  done',
		'done',
		'echo "[Embed SPM] Copied ${COPIED} framework(s) into extension bundle"'
	].join('\n');

	// Apply pbxproj encoding: escape double quotes and convert newlines
	const pbxprojScript = rawScript.replace(/"/g, '\\"').replace(/\n/g, '\\n');

	const scriptPhaseUuid = xcodeProject.generateUuid();
	projObjects['PBXShellScriptBuildPhase'][scriptPhaseUuid] = {
		isa: 'PBXShellScriptBuildPhase',
		buildActionMask: 2147483647,
		files: [],
		inputPaths: ['"$(BUILT_PRODUCTS_DIR)/PackageFrameworks"'],
		name: '"Embed SPM Package Frameworks"',
		outputPaths: ['"$(TARGET_BUILD_DIR)/$(FRAMEWORKS_FOLDER_PATH)"'],
		runOnlyForDeploymentPostprocessing: 0,
		shellPath: '/bin/sh',
		shellScript: `"${pbxprojScript}"`,
		showEnvVarsInLog: 0
	};
	projObjects['PBXShellScriptBuildPhase'][`${scriptPhaseUuid}_comment`] = 'Embed SPM Package Frameworks';

	widgetTarget.buildPhases.push({
		value: scriptPhaseUuid,
		comment: 'Embed SPM Package Frameworks'
	});
}

/**
 * Recursively collects all files from a directory and its subdirectories
 *
 * @param directoryPath - Path to the directory
 */
function collectFilesFromDirectory(directoryPath: string): string[] {
	if (!fs.existsSync(directoryPath)) {
		throw new Error(`Directory does not exist: ${directoryPath}`);
	}

	let files: string[] = [];
	const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

	entries.forEach((entry) => {
		const fullPath = path.join(directoryPath, entry.name);

		if (entry.isDirectory() && !entry.name.endsWith('.xcassets')) {
			// Recursively collect files from subdirectories
			files = [...files, ...collectFilesFromDirectory(fullPath)];
		} else {
			files.push(fullPath);
		}
	});

	return files;
}

function writeEntitlementsFile(platformProjectRoot: string, props: WidgetsPluginProps): string {
	const entitlementsContent = plist.build(props.entitlements as PlistObject);
	const filePath = path.join(platformProjectRoot, `${props.name}.entitlements`);

	try {
		fs.writeFileSync(filePath, entitlementsContent, 'utf8');
		return filePath;
	} catch (error) {
		throw new Error(`Error writing entitlements file to ${filePath}`, { cause: error });
	}
}

/**
 * Ensures that the specified app group is present in an existing entitlements file.
 * If the app group is missing, it is added and the file is updated.
 */
function ensureAppGroupInEntitlements(entitlementsPath: string, appGroup: string): void {
	try {
		const content = fs.readFileSync(entitlementsPath, 'utf8');
		const entitlements = plist.parse(content) as Record<string, any>;

		const groups: string[] = entitlements['com.apple.security.application-groups'] || [];
		if (!groups.includes(appGroup)) {
			groups.push(appGroup);
			entitlements['com.apple.security.application-groups'] = groups;
			fs.writeFileSync(entitlementsPath, plist.build(entitlements as PlistObject), 'utf8');
			console.log(`Added app group ${appGroup} to existing entitlements at ${entitlementsPath}`);
		}
	} catch (error) {
		throw new Error(
			`Could not read/update entitlements at ${entitlementsPath}. ` +
				'The entitlements file is required for app group communication between your app and widget.',
			{ cause: error }
		);
	}
}
