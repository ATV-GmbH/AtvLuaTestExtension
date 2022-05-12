// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as net from 'net';

// global variables
var _context : vscode.ExtensionContext | null = null;

var _terminal : vscode.Terminal | null = null;
var _terminalWriteEmitter : vscode.EventEmitter<string> | null = null;

var _deviceAddress : string = "192.168.100.2";
var _deviceSocket : net.Socket | null = null;
var _deviceConnected : boolean = false;

// current input line
var _inputLine : string = "";
var _inputLinePos : number = 0;

// input history
var _inputLineHistory : string[] = [];
var _inputLineHistoryPos : number = -1;

/**
 * This method is called when the extension is activated.
 * @param context VS code extension context.
 */
export async function activate(context: vscode.ExtensionContext) : Promise<void> {
	
    _context = context;

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
		open: () => handleTerminalOpen(),
		close: () => { },
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

	let script = "if errorqueue.count == 0 then print(\"no errors\") else";
    script += " for _ = 1, errorqueue.count do";
	script += " local code, message, severity, errorNode = errorqueue.next()";
	script += " print(code, message)";
	script += " end";
	script += " errorqueue.clear()";
    script += " end\r\n";

	sendDataToDevice(script);

	if (_terminalWriteEmitter) {
		vscode.window.showInformationMessage("Errors printed");
	}
}

/**
 * Wird aufgerufen wenn das Terminal geöffnet wird.
 */
function handleTerminalOpen() : void {

    _terminalWriteEmitter?.fire("Terminal open\r\n");

    _inputLine = "";
    _inputLinePos = 0;
}

/**
 * Send the terminal input to the device.
 * @param data The input data to send.
 */
function handleTerminalInput(data : string) : void {

    // TODO: Problem mit Backspace wenn der Cursor in eine neue Zeile wandert

    switch (data) {
        case "\r": // enter
            handleInputEnter();
            break;

        case "\u0016": // paste clipboard
            handleInputPasteClipboard();
            break;

        case "\x7f": // backspace
            handleInputBackspace();
            break;
        
        case "\x1b[3~": // delete
            handleInputDelete();
            break;

        case "\x1b[H": // home
            handleInputHome();
            break;

        case "\x1b[F": // end
            handleInputEnd();
            break;

        case "\x1b[2~": // insert
            // ignore
            break;

        case "\x1b[D": // cursor left
            handleInputCursorLeft();
            break;

        case "\x1b[C": // cursor right
            handleInputCursorRight();
            break;

        case "\x1b[A": // cursor up
            handleInputCursorUp();
            break;

        case "\x1b[B": // cursor down
            handleInputCursorDown();
            break;

        default:
            if (data.length === 1) {

                if (_inputLinePos === _inputLine.length) {
                    // append char
                    _inputLine += data;
                    _inputLinePos++;
                    _terminalWriteEmitter?.fire(data);
                 }
                 else {
                     // insert char
                    _inputLine = insertString(_inputLine, data, _inputLinePos);
                    _terminalWriteEmitter?.fire("\x1b[s" + _inputLine.substring(_inputLinePos) + "\x1b[u\x1b[C");
                    _inputLinePos++;
                }
            }
            break;
    }
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

	// show errors
	sendDataToDevice("localnode.showerrors=1\r\n");
}

const _searchCR : RegExp = /\r/g;
const _searchLF : RegExp = /\n/g;
/**
 * Is called when device data is received.
 * @param data The device data.
 */
function deviceDataReceived(data : Buffer) {

	let str = data.toString();

	str = str.replace(_searchCR, "");
	str = str.replace(_searchLF, "\r\n");

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

    let devAddr : string | undefined = _deviceAddress;
    
    if (_context) {
        devAddr = await _context.workspaceState.get("AtvLuaTestExtDeviceAddr");
        if (devAddr) {
            _deviceAddress = devAddr;
        }
    }

	const str = await vscode.window.showInputBox({ title : "Please enter the device address:", value : _deviceAddress });

	if (str) {
		_deviceAddress = str;

        if (_context) {
            await _context.workspaceState.update("AtvLuaTestExtDeviceAddr", _deviceAddress);
        }
	}
}

/**
 * Insert string in an other string at position.
 * @param str The string where the string shall be inserted.
 * @param strToInsert The string to be inserted.
 * @param position The position where to insert the string.
 * @returns The enw string.
 */
function insertString(str : string, strToInsert : string, position : number) : string {
    return str.substring(0, position) + strToInsert + str.substring(position);
}

/**
 * Removes a part of a string.
 * @param str The string where the part shall be removed.
 * @param position The position where the part shall be removed.
 * @param count The number of characters to be removed.
 * @returns The new string.
 */
function removeStringAt(str : string, position : number, count : number) : string {
    return str.substring(0, position) + str.substring(position + count);
}

/**
 * Handle input "Enter".
 */
function handleInputEnter() : void {
    _terminalWriteEmitter?.fire("\r\n");

    if (_inputLine.trim().length > 0) {
        
        // _terminalWriteEmitter?.fire(">>>" + _inputLine + "<<<\r\n");
        addInputLineToHistory(_inputLine);
        sendDataToDevice(_inputLine + "\n");
    }

    _inputLine = "";
    _inputLinePos = 0;
}

/**
 * Handle input Ctrl + V (paste).
 */
function handleInputPasteClipboard() : void {
    vscode.env.clipboard.readText().then((text) => {
        _inputLine = insertString(_inputLine, text, _inputLinePos);
        _terminalWriteEmitter?.fire("\x1b[s" + _inputLine.substring(_inputLinePos) + "\x1b[u\x1b[" + text.length + "C");
        _inputLinePos += text.length;
    });
}

/**
 * Handle input "Backspace".
 */
function handleInputBackspace() : void {
    if (_inputLinePos > 0) {
        _inputLinePos--;
        _inputLine = removeStringAt(_inputLine, _inputLinePos, 1);
        _terminalWriteEmitter?.fire("\x1b[D\x1b[P");
    }
}

/**
 * Handle input "Delete".
 */
function handleInputDelete() : void {
    if (_inputLinePos < _inputLine.length) {
        _inputLine = removeStringAt(_inputLine, _inputLinePos, 1);
        _terminalWriteEmitter?.fire("\x1b[s" + _inputLine.substring(_inputLinePos) + " \x1b[u");
    }
}

/**
 * Handle input "Home".
 */
function handleInputHome() : void {
    while (_inputLinePos > 0) {
        _inputLinePos--;
        _terminalWriteEmitter?.fire("\x1b[D");
    }
}

/**
 * Handle input "End".
 */
function handleInputEnd() : void {
    while (_inputLinePos < _inputLine.length) {
        _inputLinePos++;
        _terminalWriteEmitter?.fire("\x1b[C");
    }
}

/**
 * Handle input "Cursor left".
 */
function handleInputCursorLeft() : void {
    if (_inputLinePos > 0) {
        _inputLinePos--;
        _terminalWriteEmitter?.fire("\x1b[D");
    }
}

/**
 * Handle input "Cursor right".
 */
function handleInputCursorRight() : void {
    if (_inputLinePos < _inputLine.length) {
        _inputLinePos++;
        _terminalWriteEmitter?.fire("\x1b[C");
    }
}

/**
 * Handle input "Cursor up".
 */
function handleInputCursorUp() : void {
    _inputLine = getInputLineFromHistoryUpwards();
    _terminalWriteEmitter?.fire("\r\x1b[J" + _inputLine);
}

/**
 * Handle input "Cursor down".
 */
function handleInputCursorDown() : void {
    _inputLine = getInputLineFromHistoryDownwards();
    _terminalWriteEmitter?.fire("\r\x1b[J" + _inputLine);
}

/**
 * Adds an input line to the input line history.
 * @param inputLine The input line to be added.
 */
function addInputLineToHistory(inputLine : string) : void {

    if ((_inputLineHistory.length > 0) && (inputLine === _inputLineHistory[_inputLineHistory.length - 1])) {
        return;
    }

    _inputLineHistory.push(_inputLine);

    while (_inputLineHistory.length > 100) {
        _inputLineHistory.shift();
    }

    _inputLineHistoryPos = _inputLineHistory.length - 1;
}

/**
 * Returns input line from history upwards.
 * @returns Input line from history.
 */
function getInputLineFromHistoryUpwards() : string {

    if (_inputLineHistory.length === 0) {
        return "";
    }

    let str : string = _inputLineHistory[_inputLineHistoryPos];

    _inputLineHistoryPos--;
    if (_inputLineHistoryPos < 0) {
        _inputLineHistoryPos = 0;
    }

    return str;
}

/**
 * Returns input line from history downwards.
 * @returns Input line from history.
 */
 function getInputLineFromHistoryDownwards() : string {

    if (_inputLineHistory.length === 0) {
        return "";
    }

    _inputLineHistoryPos++;
    if (_inputLineHistoryPos >= _inputLineHistory.length) {
        _inputLineHistoryPos = _inputLineHistory.length - 1;
        return "";
    }

    return _inputLineHistory[_inputLineHistoryPos];
}

