const WSSERVER_IP = location.hostname;
const WSSERVER_PORT = "3000";

const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
});
const fitAddon = new FitAddon.FitAddon();
const socket = new WebSocket("ws://" + WSSERVER_IP + ":" + WSSERVER_PORT);

const runBut = document.getElementById("run_button");
const stopBut = document.getElementById("stop_button");

term.loadAddon(fitAddon);
term.attachCustomKeyEventHandler((e) => {
	if (e.code.match(/F.+/) !== null) return false;
});
term.open(termDoc);

function resize(evt)
{
	if(socket.readyState !== socket.OPEN) return;
	const terminal_size = { w: evt.cols, h: evt.rows };
	socket.send("\x04" + JSON.stringify(terminal_size));
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
}
socket.onopen = (e) => resize(term);

const editor = ace.edit("editor", {
    "selectionStyle": "line",
    "highlightActiveLine": true,
    "highlightSelectedWord": true,
    "readOnly": false,
    "copyWithEmptySelection": false,
    "cursorStyle": "ace",
    "mergeUndoDeltas": true,
    "behavioursEnabled": true,
    "wrapBehavioursEnabled": true,
    "enableAutoIndent": true,
    "keyboardHandler": "ace/keyboard/vscode",
    "showLineNumbers": true,
    "relativeLineNumbers": false,
    "enableKeyboardAccessibility": false,
    "customScrollbar": false,
    "hScrollBarAlwaysVisible": false,
    "vScrollBarAlwaysVisible": false,
    "highlightGutterLine": true,
    "animatedScroll": false,
    "showInvisibles": false,
    "showPrintMargin": false,
    "printMarginColumn": 80,
    "printMargin": false,
    "fadeFoldWidgets": false,
    "showFoldWidgets": true,
    "displayIndentGuides": true,
    "highlightIndentGuides": true,
    "showGutter": true,
    "fontSize": 12,
    "scrollPastEnd": 1,
    "fixedWidthGutter": false,
    "theme": "ace/theme/monokai",
    "maxPixelHeight": 0,
    "useTextareaForIME": true,
    "useSvgGutterIcons": false,
    "showFoldedAnnotations": false,
    "scrollSpeed": 2,
    "dragDelay": 0,
    "dragEnabled": true,
    "focusTimeout": 0,
    "tooltipFollowsMouse": true,
    "firstLineNumber": 1,
    "overwrite": false,
    "newLineMode": "auto",
    "useWorker": false,
    "useSoftTabs": true,
    "navigateWithinSoftTabs": false,
    "tabSize": 4,
    "wrap": 80,
    "indentedSoftWrap": true,
    "foldStyle": "markbegin",
    "mode": "ace/mode/javascript",
    "enableMultiselect": true,
    "enableBlockSelect": true,
    "loadDroppedFile": true,
    "enableEmmet": true,
    "enableBasicAutocompletion": true,
    "enableLiveAutocompletion": true,
    "liveAutocompletionDelay": 0,
    "liveAutocompletionThreshold": 0,
    "enableSnippets": true,
});
editor.setTheme("ace/theme/monokai");
editor.session.setMode("ace/mode/javascript");

runBut.addEventListener("click", () => {

});

stopBut.addEventListener("click", () => {

});