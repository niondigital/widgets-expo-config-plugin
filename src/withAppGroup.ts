import { ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';

export const withAppGroup: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	const APP_GROUP_KEY = 'com.apple.security.application-groups';

	return withEntitlementsPlist(config, (newConfig) => {
		if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
			newConfig.modResults[APP_GROUP_KEY] = [];
		}
		const modResultsArray = newConfig.modResults[APP_GROUP_KEY];
		const entitlement = `group.${newConfig?.ios?.bundleIdentifier || ''}.${props.name}`;
		if (modResultsArray.indexOf(entitlement) !== -1) {
			return newConfig;
		}
		modResultsArray.push(entitlement);

		return newConfig;
	});
};
