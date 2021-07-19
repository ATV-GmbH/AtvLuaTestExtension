// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';

// global variables
var _terminal : vscode.Terminal | null = null;
var _terminalWriteEmitter : vscode.EventEmitter<string> | null = null;

var _deviceAddress : string = "192.168.100.2";
var _deviceSocket : net.Socket | null = null;
var _deviceConnected : boolean = false;

/**
 * This method is called when the extension is activated.
 * @param context VS code extension context.
 */
export async function activate(context: vscode.ExtensionContext) : Promise<void> {
	
	// extension started info
	vscode.window.showInformationMessage("ATV Lua test extension started");

	await getDeviceAddress();

	// create a pseudo terminal
	createTerminal();

	// register commands
	registerCommands(context);

	// show terminal
	_terminal?.show();

	// connect to device
	connectToDevice();
}

/**
 * This method is called when the extension is deactivated.
 */
export function deactivate() : void {

}

/**
 * Creates a pseudo terminal for user input and output.
 */
function createTerminal(): void {

	_terminalWriteEmitter = new vscode.EventEmitter<string>();

	const terminal: vscode.Pseudoterminal = {
		onDidWrite: _terminalWriteEmitter.event,
		open: () => {},
		close: () => {},
		handleInput: (data) => handleTerminalInput(data)
	};

	_terminal = vscode.window.createTerminal( { name: "ATV Lua test", pty: terminal } );
}

/**
 * Registers all commands.
 * @param context VS code extension context.
 */
function registerCommands(context: vscode.ExtensionContext): void {

	let disposable = vscode.commands.registerCommand("atvluatest.start", () => {});
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("atvluatest.loadAndRun", loadAndRunTestScript);
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("atvluatest.printErrors", printDeviceErrors);
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("atvluatest.connect", connectToDevice);
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("atvluatest.disconnect", disconnectFromDevice);
	context.subscriptions.push(disposable);

	disposable = vscode.commands.registerCommand("atvluatest.changeDeviceAddress", getDeviceAddress);
	context.subscriptions.push(disposable);
}

/**
 * Command to execute the test script.
 */
function loadAndRunTestScript(): void {

	if (!checkDeviceIsConnected()) {
		return;
	}

	let editor = vscode.window.activeTextEditor;
	if (!editor) {
		return; // No open text editor
	}

	let script = editor.document.getText();

	if (_terminalWriteEmitter) {
		vscode.window.showInformationMessage("Execute Lua test script");

		sendDataToDevice("loadandrunscript\r\n");
		sendDataToDevice(script);
		sendDataToDevice("endscript\r\n");

		vscode.window.showInformationMessage("Lua test script executed");
	}
}

/**
 * Command to print the device errors.
 */
function printDeviceErrors(): void {

	if (!checkDeviceIsConnected()) {
		return;
	}

	let script = "for _ = 1, errorqueue.count do";
	script += " local code, message, severity, errorNode = errorqueue.next()";
	script += " print(code, message)";
	script += " end";
	script += " errorqueue.clear()\r\n";

	sendDataToDevice(script);

	if (_terminalWriteEmitter) {
		vscode.window.showInformationMessage("Errors printed");
	}
}

/**
 * Send the terminal input to the device.
 * @param data The input data to send.
 */
function handleTerminalInput(data : string) : void {

	let str = data.replace("\r", "\r\n");

	// output to terminal
	_terminalWriteEmitter?.fire(str);

	// send to device
	sendDataToDevice(str);
}

/**
 * Sends the data to the device.
 * @param data Data to sent.
 */
function sendDataToDevice(data : string) : void {

	if (!checkDeviceIsConnected()) {
		return;
	}

	_deviceSocket?.write(data);
}

/**
 * Asserts that the connection to the device is established.
 */
function checkDeviceIsConnected() : boolean {

	if (!_deviceConnected) {

		vscode.window.showWarningMessage("Device is not connected!");
		return false;
	}

	return true;
}

/**
 * Disconnects from the device.
 */
function disconnectFromDevice() :  void {

	_deviceSocket?.destroy();
	_deviceSocket = null;
}

/**
 * Connects to the device.
 */
 function connectToDevice(): void {

	disconnectFromDevice();
	
	if (_deviceAddress.length > 0) {
		_deviceSocket = new net.Socket();
		_deviceSocket.connect(5025, _deviceAddress, deviceConnected);

		_deviceSocket.on("data", deviceDataReceived);
		_deviceSocket.on("close", deviceConnectionClosed);
	}
}

/**
 * Is called when the device connection is established.
 */
function deviceConnected() : void {
	_deviceConnected = true;
	vscode.window.showInformationMessage(`Connected to ${_deviceAddress}.`);

	// sendDataToDevice("*IDN?\r\n");

	// show errors
	sendDataToDevice("localnode.showerrors=1\r\n");
}

/**
 * Is called when device data is received.
 * @param data The device data.
 */
function deviceDataReceived(data : Buffer) {

	let str = data.toString();

	str = str.replace("\r\n", "\n");
	str = str.replace("\r", "\n");
	str = str.replace("\n", "\r\n");

	_terminalWriteEmitter?.fire(str);
}

/**
 * Is called when the device connection is closed.
 */
function deviceConnectionClosed() {
	_deviceConnected = false;
	vscode.window.showInformationMessage(`Disconnected from ${_deviceAddress}.`);
}

/**
 * Prompts the user to input the device address.
 */
async function getDeviceAddress() : Promise<void> {

	const str = await vscode.window.showInputBox({ title : "Please enter the device address:", value : _deviceAddress });

	if (str) {
		_deviceAddress = str;
	}
}
