const WS_SERVER_IP = location.hostname;
const WS_SERVER_PORT = "3000";

const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
	convertEol: true,
});
const socket = new WebSocket("ws://" + WS_SERVER_IP + ":" + WS_SERVER_PORT);

const runBut = document.getElementById("run_button");
const stopBut = document.getElementById("stop_button");
const lang = document.getElementById("lang_selector");

var files = [];
var active_file = {};
var doSave = false;
var running = false;

const fitAddon = new FitAddon.FitAddon();

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
	if(running) return;
	running = true;
	term.reset();
	invert_button();
	save();
	send_json("run", lang.value);
}

function stop()
{
	if(!running) return;
	running = false;
	invert_button();
	send_json("stop");
}

function newProject()
{
	function setValue(data) { editor.setValue(data, -1); }

	switch(lang.value)
	{
		case "py":
			active_file["name"] = "main.py";
			setValue('for i in range(10):\n\tprint(" " * i + str(i))');
			editor.session.setMode("ace/mode/python");
			break;
		case "js":
			active_file["name"] = "main.js";
			setValue('for(var i = 0; i < 10; i++)\n{\n\tconsole.log(" ".repeat(i) + i);\n}');
			editor.session.setMode("ace/mode/javascript");
			break;
		case "c":
			active_file["name"] = "main.c";
			setValue('#include <stdio.h>\n\nint main(int argc, char *argv [])\n{\n\tfor(int i = 0; i < 10; i++)\n\t{\n\t\tfor(int k = 0; k < i; k++)\n\t\t{\n\t\t\tprintf(" ");\n\t\t}\n\t\tprintf("%i\\n", i);\n\t}\n\treturn 0;\n}');
			editor.session.setMode("ace/mode/c_cpp");
			break;
		case "cpp":
			active_file["name"] = "main.cpp";
			setValue("#include <iostream>\n\nusing namespace std;\n\nint main(int argc, char *argv [])\n{\n\tfor(int i = 0; i < 10; i++)\n\t{\n\t\tstring a(i, ' ');\n\t\tcout << a << i << endl;\n\t}\n\treturn 0;\n}");
			editor.session.setMode("ace/mode/c_cpp");
			break;
	}
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
	if(e.data.charCodeAt(0) == 4)
	{
		stop();
		e.data = e.data.slice(1);
	}
	term.write(e.data);
	//if(e.data == "\nprogram ended\n") stop();
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
	"enableBasicAutocompletion": true,
	"enableLiveAutocompletion": true,
	"enableInlineAutocompletion": true,
	"enableSnippets": true,
});
/*
ace.require("ace/ext/language_tools");
ace.require("ace/ext/inline_autocomplete");
ace.require("ace/ext/options")
*/
ace.require("ace/ext/settings_menu").init();

runBut.addEventListener("click", start);
stopBut.addEventListener("click", stop);

var last_lang_select = document.querySelector("#lang_selector option:checked");
lang.addEventListener("change", e => {
	if(!editor.session.getUndoManager().isClean() && !confirm("This will make a new project and you have unsaved changes!\nDo you want to continue (saves will be discarded)?"))
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

window.onkeydown = (e) => {
	if(e.ctrlKey && e.keyCode == ('S').charCodeAt(0)) 
	{
		e.preventDefault();
		save();
	}
}

const split = new Split(['#editor', '#terminal'], {
    direction: 'vertical',
    minSize: 20,
    snapOffset: 0,
	sizes: [50, 50]
});