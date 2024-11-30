'use strict';

const WS_SERVER_IP = location.hostname;
const WS_SERVER_PORT = location.port != "" ? `:${location.port}` : "";

const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
	convertEol: true,
});
const socket = new WebSocket(`wss://${WS_SERVER_IP}${WS_SERVER_PORT}/${window.location.pathname.split("/")[1]}/ws/${window.location.search}`);

const runBut = document.getElementById("run_button");
const stopBut = document.getElementById("stop_button");
const shareBut = document.getElementById("share_button");
const shareModalPublicId = document.getElementById("share_modal_public");
const shareModalEditId = document.getElementById("share_modal_edit");
const shareModal = new bootstrap.Modal('#share_modal');
const lang = document.getElementById("lang_selector");
const helpBut = document.getElementById("help_button");
const helpModal = new bootstrap.Modal('#help_modal');

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
	const toSend = (data === undefined) ? { "do": task } : { "do": task, "data": data };
	socket.send("\x04" + JSON.stringify(toSend));
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
	if(running) return;
	send_json("save", { "data": editor.getValue(), "path": active_file.path });
}

function start()
{
	if(running) return;
	save();
	running = true;
	term.reset();
	invert_button();
}

function stop()
{
	if(!running) return;
	running = false;
	invert_button();
	send_json("stop");
}

function copy(id)
{
	if (window.isSecureContext && navigator.clipboard)
	{
		navigator.clipboard.writeText(document.getElementById(id).value);
	}
}

function newProject()
{
	function setValue(data) { editor.setValue(data, -1); }

	switch(lang.value)
	{
		case "lua":
			active_file["name"] = "main.lua";
			setValue('for i=0,9 do\n\tprint(string.rep(" ", i) .. i)\nend');
			editor.session.setMode("ace/mode/lua");
			break;
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
	var data = e.data;
	if(e.data.charCodeAt(0) == 4)
	{
		const json = JSON.parse(e.data.slice(1));
		switch(json.do)
		{
			case "msg": stop(); data = json.data; break;
			case "saveconf": if(running) send_json("run", lang.value); return;
		}
	}
	term.write(data);
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
shareBut.addEventListener("click", () => {
	shareModalPublicId.value = "<public url>";
	shareModalEditId.value = "<edit url>";

	shareModal.show();
});
helpBut.addEventListener("click", () => helpModal.show());

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

if(!navigator.clipboard)
{
	document.querySelectorAll(".fa-copy").forEach((ele) => ele.parentElement.remove());
}