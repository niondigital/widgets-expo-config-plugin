import { ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';

export const withEntitlements: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	return withEntitlementsPlist(config, (newConfig) => {
		Object.entries(props.entitlements ?? {}).forEach(([key, value]) => {
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
