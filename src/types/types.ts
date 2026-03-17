export type WidgetsPluginProps = {
	name: string;
	path: string;
	additionalFiles?: string[];
	entitlements?: Record<string, any>;
	buildSettings?: Record<string, string>;
	spmPackages?: {
		url: string;
		version: string;
		product: string;
	}[];
};
