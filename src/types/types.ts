export type WidgetsPluginProps = {
	appGroup?: string;
	buildSettings?: Record<string, string>;
	files: string[];
	folders?: string[]
	name: string;
	path: string;
};
