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
				if (newConfig.modResults[key].indexOf(value) === -1) {
					newConfig.modResults[key].push(value);
				}
			} else {
				newConfig.modResults[key] = value;
			}
		});

		return newConfig;
	});
};
