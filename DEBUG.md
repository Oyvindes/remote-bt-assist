# Debugging Guide for Remote BT Assist

This guide provides instructions for setting up and using debugging tools for the Remote BT Assist application.

## Setup

The project includes several debugging configurations and tools:

1. **VSCode Launch Configurations** - Located in `.vscode/launch.json`
2. **Task Definitions** - Located in `.vscode/tasks.json`
3. **Debug Launcher HTML** - A visual interface for launching debug sessions
4. **Debug Tasks Script** - A command-line tool for launching debug tasks

## JSON with Comments Extension

If you see the error message:

> You don't have an extension for debugging 'JSON with Comments'. Should we find a 'JSON with Comments' extension in the Marketplace?

This means VSCode is trying to debug a JSON file that contains comments (JSONC), but you don't have the appropriate extension installed.

### Solution:

1. Click "Find 'JSON with Comments' extension" in the dialog
2. Install the recommended extension (usually "JSON with Comments" by Microsoft)
3. Restart VSCode
4. Try debugging again

Alternatively, you can install the extension manually:
1. Open VSCode Extensions panel (Ctrl+Shift+X or Cmd+Shift+X)
2. Search for "JSON with Comments"
3. Install the extension by Microsoft
4. Restart VSCode

## Available Debug Configurations

The project includes the following debug configurations:

### 1. Launch Chrome against localhost
- Launches Chrome browser for debugging the frontend
- Connects to `http://localhost:8080` (configured in vite.config.ts)
- Enables source maps for better debugging

### 2. Debug Current File
- Debugs the currently active file in VSCode
- Useful for debugging individual TypeScript/JavaScript files
- Skips node internal files for cleaner debugging

### 3. Debug Vite Dev Server
- Starts and debugs the Vite development server
- Allows you to debug server-side issues
- Runs the `npx vite` command in debug mode

### 4. Full Stack: Vite + Chrome (Recommended)
- Compound configuration that runs both the Vite server and Chrome browser
- Ensures the server is running before launching Chrome
- Provides a complete debugging experience for both frontend and backend

## How to Start Debugging

### Method 1: Using VSCode Debug Panel (Recommended)
1. Open the Debug panel in VSCode (Ctrl+Shift+D or Cmd+Shift+D)
2. Select "Full Stack: Vite + Chrome" from the dropdown at the top
3. Click the green play button or press F5
4. This will start both the Vite server and Chrome browser together

### Method 2: Using Individual Debug Configurations
1. Open the Debug panel in VSCode (Ctrl+Shift+D or Cmd+Shift+D)
2. Select one of the individual configurations from the dropdown at the top:
   - "Debug Vite Dev Server" to start only the Vite server
   - "Launch Chrome against localhost" to start only Chrome (requires server to be running)
   - "Debug Current File" to debug the currently active file
3. Click the green play button or press F5

### Method 3: Using Debug Launcher HTML
1. Open `debug-launcher.html` in a browser
2. Click on one of the "Quick Actions" buttons
3. Follow any additional prompts in VSCode

### Method 4: Using Debug Tasks Script
1. Open a terminal
2. Run `node debug-tasks.js`
3. Select an option from the menu

## Troubleshooting

### Issue: "You don't have an extension for debugging 'JSON with Comments'"
- Install the JSON with Comments extension as described above

### Issue: "vite is not recognized as an internal or external command"
- This occurs when the vite command is not found in your PATH
- The updated configurations now use `npx vite` which should resolve this issue
- If you still encounter this issue, try running `npm install` to ensure all dependencies are installed

### Issue: Chrome doesn't launch for debugging
- Make sure the Vite dev server is running
- Use the "Full Stack: Vite + Chrome" compound configuration which ensures the server is running
- Check if port 8080 is already in use by another application
- Try using a different browser configuration in launch.json

### Issue: Breakpoints not hitting
- Make sure source maps are enabled
- Check if the file you're debugging is being transpiled/bundled correctly
- Try adding `debugger;` statements in your code

### Issue: Cannot find module errors
- Check your import paths
- Make sure all dependencies are installed (`npm install`)
- Verify tsconfig.json paths configuration

## Advanced Debugging

### Remote Debugging
To debug a remote device:
1. Modify the Chrome launch configuration to connect to a remote URL
2. Enable remote debugging on the target device
3. Connect using the appropriate IP and port

### Bluetooth Debugging
For debugging Bluetooth functionality:
1. Use the browser's Bluetooth developer tools
2. Enable Web Bluetooth API in Chrome (chrome://flags/#enable-web-bluetooth)
3. Set breakpoints in the Bluetooth service code

## Additional Resources

- [VSCode Debugging Documentation](https://code.visualstudio.com/docs/editor/debugging)
- [Chrome DevTools Documentation](https://developer.chrome.com/docs/devtools/)
- [Vite Debugging Guide](https://vitejs.dev/guide/troubleshooting.html)
- [Web Bluetooth API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)