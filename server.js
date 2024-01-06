const express = require("express");
const app = express();
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");

const TIMEOUT = 5000;
const SOCKET_PORT = 3000;
const WEB_PORT = 3001;

const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'];
const users = [];

const wss = new WebSocket.Server({ port: SOCKET_PORT });
wss.on('connection', (ws, req) => {
	console.log("new session: " + req.socket.remoteAddress);

	const proc = pty.spawn(shell, ["/k"], {
		name: 'xterm-color',
		cwd: process.cwd(),
		env: process.env,
		useConpty: false,	// look into this
	});

	users.push({
		"ws": ws, 
		"proc": proc
	});

	ws.isAlive = true;
	ws.on('error', console.error);
	ws.on('pong', () => ws.isAlive = true);
	ws.on('message', command => {
		if(command.at(0) == 4)
		{
			const text = command.slice(1).toString();
			// text can be used to make switch
			const size = JSON.parse(text);
			proc.resize(size.w, size.h);
		}
		else proc.write(command);
	});

	proc.on('data', (data) => {
		ws.send(data)
		console.log(data.charCodeAt(0) + `\t- '${data}'`);
	});
})

setInterval(() => {
	var i = users.length;
	while(i--)
	{
		const user = users[i];
		const ws = user.ws;
		const proc = user.proc;
		if (ws.isAlive === false)
		{
			console.log("disconnected: " + ws._socket.remoteAddress);
			ws.removeAllListeners();
			ws.terminate();
			proc.onData().dispose();
			proc.kill();
			users.splice(i, 1);
			continue;
		}
		ws.isAlive = false;
		ws.ping();
	};
}, TIMEOUT);

app.use("/public", express.static(path.resolve("./public")));
app.use("/node_modules", express.static(path.resolve("./node_modules")));

const index_page = path.resolve("./pages/index.html");

app.get("/", (req, res) => {
	res.sendFile(index_page);
});

app.listen(WEB_PORT, console.log("started"));