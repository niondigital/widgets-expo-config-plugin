import { ConfigPlugin, withEntitlementsPlist } from '@expo/config-plugins';
import { WidgetsPluginProps } from './types/types';

/**
 * Adds an app group entitlement to the iOS project.
 * 
 * @param config - The Expo config
 * @param props - Widget plugin properties containing the app group name
 * @returns Updated Expo config with app group entitlement
 */
export const withAppGroup: ConfigPlugin<WidgetsPluginProps> = (config, props) => {
  const APP_GROUP_KEY = 'com.apple.security.application-groups';
  
  return withEntitlementsPlist(config, (newConfig) => {
    // Initialize the app groups array if it doesn't exist
    if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
      newConfig.modResults[APP_GROUP_KEY] = [];
    }
    
    const appGroupsArray = newConfig.modResults[APP_GROUP_KEY];
    const bundleId = newConfig?.ios?.bundleIdentifier || '';
    const appGroupName = props?.appGroup || '';
    const entitlement = `group.${bundleId}.${appGroupName}`;
    
    // Only add the entitlement if it doesn't already exist
    if (!appGroupsArray.includes(entitlement)) {
      appGroupsArray.push(entitlement);
    }

    return newConfig;
  });
};