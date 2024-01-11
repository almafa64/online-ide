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
const lang = document.getElementById("lang_selector");

var files = [];
var active_file = {};
var doSave = false;

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

function save()
{
	send_json("save", { "data": editor.getValue(), "path": active_file.path });
}

function start()
{
	term.reset();
	invert_button();
	save();
	send_json("run", lang.value);
}

function stop()
{
	invert_button();
	send_json("stop");
}

function newProject()
{
	switch(lang.value)
	{
		case "py":
			active_file["name"] = "main.py";
			editor.setValue('for i in range(10):\n\tprint(" " * i + str(i))');
			break;
		case "js":
			active_file["name"] = "main.js";
			break;
		case "c":
			active_file["name"] = "main.c";
			break;
		case "cpp":
			active_file["name"] = "main.cpp";
			break;
	}
	editor.clearSelection();
	editor.session.getUndoManager().markClean();
	active_file["path"] = active_file["name"];
	files = [ active_file ];
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

var last_lang_select = document.querySelector("#lang_selector option:checked");
lang.addEventListener("change", e => {
	if(!editor.session.getUndoManager().isClean() && !confirm("Did you save?"))
	{
		lang.value = last_lang_select.value;
		return;
	}
	newProject(e);
});
lang.addEventListener("click", e => {
	last_lang_select = document.querySelector("#lang_selector option:checked");
});

newProject();