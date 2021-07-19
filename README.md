# ATV Lua Test README

This extension simplifies the development of Lua tests for the 26xx series measuring devices from Keithley / Tektronix.

## Features

* A terminal to send commands to the device and print the output from the device.
* Load and run Lua scripts.
* Print errors stored in the error queue.

## Commands

Command | Description | Default key binding
------- | ----------- | -------------------
ATV Lua test: Start | Start the extension and connect to the device | Ctrl + Alt + s
ATV Lua test: Execute | Load and runs the currently edited Lua script | Ctrl + Alt + e
ATV Lua test: Print errors | Prints the errors stored in the device error queue | Ctrl + Alt + p
ATV Lua test: Connect | Connect to the device |
ATV Lua test: Disconnect | Disconnect from the device |
ATV Lua test: Change device address | Changes the TCP/IP address used to connect to the device |

## Recommended VS code extensions

* Lua - the Lua language server by sumneko
* vscode-lua-format by Koihik

## Extension Settings

No settings yet.

## Known Issues

None.

## Release Notes

### 1.0.0

Initial release of ATV Lua Test

