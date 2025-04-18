# @niondigital/widgets-expo-config-plugin

## Overview

This plugin is an [Expo Config Plugin](https://docs.expo.dev/guides/config-plugins/) that enables you to add iOS widgets to your Expo project.

> **Note:** Currently, this plugin only supports iOS widgets. Android widget support may be added in the future.

---

## Installation

```sh
# Using npx
npx expo install @niondigital/widgets-expo-config-plugin

# Using npm
npm install @niondigital/widgets-expo-config-plugin

# Using yarn
yarn add @niondigital/widgets-expo-config-plugin
```

## Quick Start

### 1. Copy Example Widget Files

Copy the files from the `example/ios/ExampleWidget` directory into your project's directory.

### 2. Add and Configure the Plugin

Modify your `app.json` / `app.config.js` / `app.config.ts` to include the plugin configuration. Ensure the `path` property points to the directory where you copied the example widget files.

#### Example: `app.json`

```json
{
  "plugins": [
    [
      "@niondigital/widgets-expo-config-plugin",
      {
        "name": "MyWidget",
        "path": "./widgets/ios/ExampleWidget"
      }
    ]
  ]
}
```

### 3. Run a Clean Prebuild

Execute the following command to rebuild the project:

```sh
npx expo prebuild --clean
```

## Plugin Properties

The following properties can be configured in the plugin:

| Property        | Required     | Description                                                                                               |
| --------------- |--------------|-----------------------------------------------------------------------------------------------------------|
| `name`          | **Required** | The name of the widget extension.                                                                         |
| `path`          | **Required** | The path to the directory containing the widget files, relative to the project root.                      |
| `entitlements`  | Optional     | A key-value object of entitlements to add to the main target and widget target.                           |
| `buildSettings` | Optional     | A key-value object to override default build settings (e.g., `{ "IPHONEOS_DEPLOYMENT_TARGET": "17.0" }`). |

## FAQ

### How can I change the iOS deployment target?

By default, the deployment target is set to `18.0` because iOS 18.0 introduces new widget capabilities (e.g., Control Center widgets). However, if you do not require these features, you can lower the deployment target.

To modify the iOS deployment target, add the following configuration to your `app.json` / `app.config.js` / `app.config.ts`:

```json
{
  "plugins": [
    [
      "@niondigital/widgets-expo-config-plugin",
      {
        // ...
        "buildSettings": {
          "IPHONEOS_DEPLOYMENT_TARGET": "17.0"
        }
      }
    ]
  ]
}
```

### How can I add multiple widgets?

You can add multiple widgets by creating a widget bundle which can include multiple widgets of each type. You can find an example of a widget bundle in the `example/ios/ExampleWidget/ExampleWidgetBundle.swift` file.

