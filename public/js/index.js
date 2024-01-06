const termDoc = document.getElementById('terminal');
const term = new Terminal({
	cursorBlink: true,
});
const fitAddon = new FitAddon.FitAddon();
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

const socket = new WebSocket("ws://localhost:3000");
term.onData(command => {
	socket.send(command);
});
socket.onmessage = (e) => term.write(e.data);
socket.onopen = (e) => resize(term);