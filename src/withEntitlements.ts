import { ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';

export const withEntitlements: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	const entitlements = {
		'com.apple.security.application-groups': [`group.${config?.ios?.bundleIdentifier || ''}.${props.name}`],
		...props?.entitlements
	};

	return withEntitlementsPlist(config, (newConfig) => {
		Object.entries(entitlements).forEach(([key, value]) => {
			if (Array.isArray(value)) {
				if (!Array.isArray(newConfig.modResults[key])) {
					newConfig.modResults[key] = [];
				}
				newConfig.modResults[key].push(...value);
				// Avoid duplicates
				newConfig.modResults[key] = [...new Set(newConfig.modResults[key])];
			} else {
				newConfig.modResults[key] = value;
			}
		});

		return newConfig;
	});
};
