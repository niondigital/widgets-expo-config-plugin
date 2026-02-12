import { ConfigPlugin } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';
import { withEASExtraConfig } from './withEASExtraConfig';
import { withEntitlements } from './withEntitlements';
import { withExtensionInXcodeProject } from './withExtensionInXcodeProject';

const withWidgets: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	// Validate props
	if (!props.name) {
		throw new Error(
			'You are trying to use the Widgets plugin without the required `name` property. Please add it to your app config.'
		);
	}

	if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(props.name)) {
		throw new Error(
			`Invalid widget name "${props.name}". Name must start with a letter and contain only letters, numbers, hyphens, and underscores.`
		);
	}

	if (!props.path) {
		throw new Error(
			'You are trying to use the Widgets plugin without the required `path` property. Please add it to your app config.'
		);
	}

	if (!config.ios?.bundleIdentifier) {
		throw new Error(
			'ios.bundleIdentifier is required in your app config when using the Widgets plugin. Without it, the widget bundle ID and app group cannot be generated.'
		);
	}

	const entitlements = {
		'com.apple.security.application-groups': [`group.${config?.ios?.bundleIdentifier || ''}.${props.name}`],
		...props?.entitlements
	};

	// Set default props
	props = {
		...props,
		entitlements
	};

	config = withEntitlements(config, props);

	config = withExtensionInXcodeProject(config, props);

	config = withEASExtraConfig(config, props);

	return config;
};

export default withWidgets;
