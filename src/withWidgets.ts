import { ConfigPlugin } from '@expo/config-plugins';
import { withAppGroup } from './withAppGroup';
import { withEASExtraConfig } from './withEASExtraConfig';
import { withExtensionInXcodeProject } from './withExtensionInXcodeProject';

import { WidgetsPluginProps } from './types/types';

/**
 * ConfigPlugin to add widget extension support to an Expo project.
 * 
 * @param config - The Expo config
 * @param props - Widget plugin properties
 * @returns Updated Expo config with widget extension support
 * @throws Error if required properties are missing
 */
const withWidgets: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
  // Validate required properties
  validateRequiredProps(props);
  
  // Apply default properties
  const enhancedProps = {
    name: 'Widget',
    ...props
  };
  
  // Apply configuration changes in sequence
  return [
    withAppGroup,
    withExtensionInXcodeProject,
    withEASExtraConfig
  ].reduce((updatedConfig, plugin) => {
    return plugin(updatedConfig, enhancedProps);
  }, config);
};

/**
 * Validates that all required properties are present in the props object.
 * 
 * @param props - Widget plugin properties to validate
 * @throws Error if any required property is missing
 */
function validateRequiredProps(props: WidgetsPluginProps): void {
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
}

export default withWidgets;