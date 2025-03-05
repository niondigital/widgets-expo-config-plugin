import { ConfigPlugin } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';

/**
 * Declaring app extensions with extra.eas.build.experimental.ios.appExtensions in your app config makes it possible
 * for EAS CLI to know what app extensions exist before the build starts (before the Xcode project has been generated)
 * to ensure that the required credentials are generated and validated.
 *
 * @param config - The Expo config
 * @param props - Widget plugin properties
 * @returns Updated Expo config with EAS app extension configuration
 */
export const withEASExtraConfig: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	const targetName = props.name;
	const widgetBundleId = `${config.ios?.bundleIdentifier}.${targetName}`;

  	// Define the new app extension configuration
	const newAppExtensions = [
		{
			targetName,
			bundleIdentifier: widgetBundleId,
			entitlements: {
				'com.apple.security.application-groups': [`group.${config?.ios?.bundleIdentifier}.${props.name}`]
			}
		}
	];

  	// Update the config with the new extension, preserving existing configuration
	config.extra = {
		...config.extra,
		eas: {
			...config.extra?.eas,
			build: {
				...config.extra?.eas?.build,
				experimental: {
					...config.extra?.eas?.build?.experimental,
					ios: {
						...config.extra?.eas?.build?.experimental?.ios,
						appExtensions: [
							...(config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []),
							...newAppExtensions
						]
					}
				}
			}
		}
	};

	return config;
};
