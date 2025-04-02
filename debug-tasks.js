/**
 * Debug Tasks Launcher
 *
 * This script helps launch debugging tasks for the Remote BT Assist application.
 * Run with: node debug-tasks.js
 */
import { exec } from 'child_process';
import * as readline from 'readline';
import { networkInterfaces } from 'os';

// Function to get local IP addresses
function getLocalIpAddresses() {
  const nets = networkInterfaces();
  const results = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (loopback) addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }

  return results;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Display menu
console.log('\n=== Remote BT Assist Debug Launcher ===\n');
console.log('Available debug tasks:');
console.log('1. Start Vite Dev Server');
console.log('2. Launch Chrome Debugger');
console.log('3. Debug Current File');
console.log('4. Start Full Stack Debugging (Recommended)');
console.log('5. Open Debug Launcher HTML');
console.log('0. Exit');

// Get user choice
rl.question('\nEnter your choice (0-5): ', (choice) => {
  switch (choice) {
    case '1':
      console.log('\nStarting Vite Dev Server...');

      // Display IP addresses for external access
      const ipAddresses = getLocalIpAddresses();
      console.log('\nYour app will be available at:');
      console.log('- Local:   http://localhost:8080');
      ipAddresses.forEach(ip => {
        console.log(`- Network: http://${ip}:8080`);
      });
      console.log('\nYou can access the app from other devices using the Network URL');

      exec('npx vite', (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          return;
        }
        console.log(stdout);
      });
      break;

    case '2':
      console.log('\nLaunching Chrome Debugger...');
      console.log('Please make sure the dev server is running first.');
      exec('code --open-url "vscode://ms-vscode.js-debug/launch/launch.json/Launch Chrome against localhost"',
        (error) => {
          if (error) {
            console.error(`Error: ${error.message}`);
            console.log('Alternative: Press F5 in VSCode and select "Launch Chrome against localhost"');
          }
        });
      break;

    case '3':
      console.log('\nTo debug the current file:');
      console.log('1. Open the file in VSCode');
      console.log('2. Press F5');
      console.log('3. Select "Debug Current File" from the dropdown');
      break;

    case '4':
      console.log('\nStarting full stack debugging session...');
      exec('code --open-url "vscode://workbench/action/debug.start?name=Full%20Stack%3A%20Vite%20%2B%20Chrome"',
        (error) => {
          if (error) {
            console.error(`Error: ${error.message}`);
            console.log('Alternative: Open VSCode Debug panel and select "Full Stack: Vite + Chrome" from the dropdown');
          }
        });
      break;

    case '5':
      console.log('\nOpening Debug Launcher HTML...');
      const command = process.platform === 'win32'
        ? 'start debug-launcher.html'
        : (process.platform === 'darwin' ? 'open debug-launcher.html' : 'xdg-open debug-launcher.html');

      exec(command, (error) => {
        if (error) {
          console.error(`Error: ${error.message}`);
          console.log('Alternative: Open debug-launcher.html in your browser manually');
        }
      });
      break;

    case '0':
      console.log('\nExiting Debug Launcher.');
      break;

    default:
      console.log('\nInvalid choice. Please run the script again and select a valid option.');
  }

  rl.close();
});

// Handle JSON with Comments extension check
console.log('\nChecking for JSON with Comments extension...');
console.log('Note: If you see an error about missing "JSON with Comments" extension,');
console.log('install it from the VSCode Marketplace to properly debug configuration files.');