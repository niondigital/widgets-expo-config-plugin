export type WidgetsPluginProps = {
	entitlements?: Record<string, any>;
	buildSettings?: Record<string, string>;
	files: string[];
	folders?: string[]
	name: string;
	path: string;
};
