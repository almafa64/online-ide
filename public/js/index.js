const WSSERVER_IP = "94.21.108.74";
const WSSERVER_PORT = "3000";

const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
});
const fitAddon = new FitAddon.FitAddon();
const socket = new WebSocket("ws://" + WSSERVER_IP + ":" + WSSERVER_PORT);

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
socket.onmessage = (e) => term.write(e.data);
socket.onopen = (e) => resize(term);