import { ConfigPlugin } from '@expo/config-plugins';

import { WidgetsPluginProps } from './types/types';
import { withAppGroup } from './withAppGroup';
import { withEASExtraConfig } from './withEASExtraConfig';
import { withExtensionInXcodeProject } from './withExtensionInXcodeProject';

const withWidgets: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
	// Validate props
	if (!props.path) {
		throw new Error(
			'You are trying to use the Widgets plugin without the required `path` property. Please add it to your app config.'
		);
	}
	if (!props.files) {
		throw new Error(
			'You are trying to use the Widgets plugin without the required `files` property. Please add it to your app config.'
		);
	}

	// Set default props
	props = {
		name: 'Widget',
		...props
	};

	config = withAppGroup(config, props);

	config = withExtensionInXcodeProject(config, props);

	config = withEASExtraConfig(config, props);

	return config;
};

export default withWidgets;
