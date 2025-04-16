import { ConfigPlugin, withXcodeProject } from '@expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import { WidgetsPluginProps } from './types/types';

/**
 * Default build configuration settings for widget extensions
 */
const BASE_BUILD_CONFIGURATION_SETTINGS = {
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
	DEBUG_INFORMATION_FORMAT: 'dwarf',
	GCC_C_LANGUAGE_STANDARD: 'gnu11',
	GENERATE_INFOPLIST_FILE: 'YES',
	INFOPLIST_KEY_CFBundleDisplayName: 'widget',
	INFOPLIST_KEY_NSHumanReadableCopyright: '""',
	IPHONEOS_DEPLOYMENT_TARGET: '18.0',
	LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
	MTL_ENABLE_DEBUG_INFO: 'INCLUDE_SOURCE',
	MTL_FAST_MATH: 'YES',
	PRODUCT_NAME: '"$(TARGET_NAME)"',
	SKIP_INSTALL: 'YES',
	SWIFT_ACTIVE_COMPILATION_CONDITIONS: 'DEBUG',
	SWIFT_EMIT_LOC_STRINGS: 'YES',
	SWIFT_OPTIMIZATION_LEVEL: '-Onone',
	SWIFT_VERSION: '5.0',
	TARGETED_DEVICE_FAMILY: '"1,2"'
};

/**
 * Recursively collects all files from a directory and its subdirectories
 *
 * @param dirPath - Path to the directory
 * @param basePath - Base path for creating relative paths
 * @returns Array of file paths relative to basePath
 */
function collectFilesFromFolder(folder: string, extensionPath: string): string[] {
	const folderPath = path.join(extensionPath, folder);
	// create absolute path to check if folders exist and read it's content
	const absoluteFolderPath = `${__dirname}/../../../${folderPath}`;

	if (!fs.existsSync(absoluteFolderPath)) {
		return [];
	}

	let files: string[] = [];
	const entries = fs.readdirSync(absoluteFolderPath, { withFileTypes: true });

	for (const entry of entries) {
		const subFolderPath = `${folder}/${entry.name}`;
		if (entry.isDirectory()) {
			// Recursively collect files from subdirectories
			files = [...files, ...collectFilesFromFolder(subFolderPath, folderPath)];
		} else {
			files.push(subFolderPath);
		}
	}

	return files;
}

/**
 * Adds a widget extension target to the Xcode project.
 * Supports both individual files and folders.
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

		// Process files and folders
		let allFiles: string[] = [];

		// Add explicitly specified files
		if (props.files && props.files.length > 0) {
			allFiles = [...props.files];
		}

		// Add files from folders if specified
		if (props.folders && props.folders.length > 0) {
			for (const folder of props.folders) {
				const folderFiles = collectFilesFromFolder(folder, extensionPath);
				allFiles = [...allFiles, ...folderFiles];
			}
		}

		// Create new PBXGroup for the extension
		const extGroup = xcodeProject.addPbxGroup(allFiles, targetName, extensionPath);

		// Add the new PBXGroup to the top level group
		const groups: any[] = xcodeProject.hash.project.objects['PBXGroup'];
		Object.entries(groups).forEach(([key, group]) => {
			if (typeof group === 'object' && group.name === undefined && group.path === undefined) {
				xcodeProject.addToPbxGroup(extGroup.uuid, key);
			}
		});

		// WORK AROUND for xcodeProject.addTarget BUG
		// Initialize objects that might be missing in projects with only one target
		const projObjects = xcodeProject.hash.project.objects;
		projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
		projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

		// Add the target
		const newTarget = xcodeProject.addTarget(targetName, 'app_extension', targetName, widgetBundleId);

		// Filter files by type for different build phases
		const sourceFiles = allFiles.filter(file => file.endsWith('.swift'));
		const resourceFiles = allFiles.filter(file =>
			file.endsWith('.xcassets') ||
			file.endsWith('.storyboard') ||
			file.endsWith('.xib') ||
			file.endsWith('.strings') ||
			file.endsWith('.json')
		);

		// Add build phases to the new target
		xcodeProject.addBuildPhase(
			sourceFiles,
			'PBXSourcesBuildPhase',
			'Sources',
			newTarget.uuid
		);

		xcodeProject.addBuildPhase(
			resourceFiles,
			'PBXResourcesBuildPhase',
			'Resources',
			newTarget.uuid
		);

		xcodeProject.addBuildPhase(
			['SwiftUI.framework', 'WidgetKit.framework'],
			'PBXFrameworksBuildPhase',
			'Frameworks',
			newTarget.uuid
		);

		// Configure build settings
		const configurations: { buildSettings: Record<string, string | number> | undefined }[] =
			xcodeProject.pbxXCBuildConfigurationSection();

		Object.values(configurations).forEach((configuration) => {
			if (configuration.buildSettings?.PRODUCT_NAME === `"${targetName}"`) {
				configuration.buildSettings = {
					...configuration.buildSettings,
					...BASE_BUILD_CONFIGURATION_SETTINGS,
					INFOPLIST_FILE: `${extensionPath}/Info.plist`,
					MARKETING_VERSION: config.version ?? '1.0.0',
					CURRENT_PROJECT_VERSION: config.ios?.buildNumber ?? 1,
					PRODUCT_BUNDLE_IDENTIFIER: widgetBundleId,
					...props.buildSettings
				};
			}
		});

		return newConfig;
	});
};
