export type WidgetsPluginProps = {
	name: string;
	path: string;
	entitlements?: Record<string, any>;
	buildSettings?: Record<string, string>;
};
