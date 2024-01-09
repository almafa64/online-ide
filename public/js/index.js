const WS_SERVER_IP = location.hostname;
const WS_SERVER_PORT = "3000";

const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
	convertEol: true,
});
const fitAddon = new FitAddon.FitAddon();
const socket = new WebSocket("ws://" + WS_SERVER_IP + ":" + WS_SERVER_PORT);

const runBut = document.getElementById("run_button");
const stopBut = document.getElementById("stop_button");

term.loadAddon(fitAddon);
term.attachCustomKeyEventHandler((e) => {
	if (e.code.match(/F.+/) !== null) return false;
});
term.open(termDoc);

function send_json(task, data)
{
	if(task == undefined) throw Error("no task was defined");
	if(data == undefined) data = "";
	socket.send("\x04" + JSON.stringify({"do": task, "data": data}));
}

function resize(evt)
{
	if(socket.readyState !== socket.OPEN) return;
	const terminal_size = { "w": evt.cols, "h": evt.rows };
	send_json("size", terminal_size);
}

function invert_button()
{
	runBut.hidden = stopBut.hidden;
	stopBut.hidden = !stopBut.hidden;
}

function start()
{
	term.reset();
	invert_button();
	// ToDo remove hardcoded name
	const file = { "data": editor.getValue(), "name": "main.py" };
	send_json("run", file);
}

function stop()
{
	invert_button();
	send_json("stop");
}

term.onResize(resize);

new ResizeObserver(entries => {
	try {
		if(fitAddon) fitAddon.fit();
	} catch (err) {
		console.error(err);
	}
}).observe(termDoc);

term.onData(command => {
	socket.send(command);
});

socket.onmessage = (e) => {
	term.write(e.data);
	if(e.data == "program ended") stop(false);
}
socket.onopen = (e) => resize(term);

const editor = ace.edit("editor", {
	"keyboardHandler": "ace/keyboard/vscode",
	"vScrollBarAlwaysVisible": true,
	"printMargin": false,
	"fontSize": 13,
	"scrollPastEnd": 1,
	"theme": "ace/theme/monokai",
	"useTextareaForIME": true,
	"useSvgGutterIcons": true,
	"useSoftTabs": false,
	"tabSize": 4,
	"enableEmmet": true,
	"enableBasicAutocompletion": true,
	"enableLiveAutocompletion": true,
	"enableSnippets": true,
});
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/python");

runBut.addEventListener("click", start);
stopBut.addEventListener("click", stop);