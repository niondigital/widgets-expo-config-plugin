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
	GENERATE_INFOPLIST_FILE: 'YES',
	INFOPLIST_KEY_CFBundleDisplayName: 'widget',
	INFOPLIST_KEY_NSHumanReadableCopyright: '""',
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

		return newConfig;
	});
};

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
		console.error(error);
		throw new Error(`Error writing entitlements file to ${filePath}`);
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
		console.warn(`Warning: Could not read/update entitlements at ${entitlementsPath}: ${error}`);
	}
}
