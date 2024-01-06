const express = require("express");
const app = express();
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");
const { Terminal } = require("@xterm/xterm");

function heartbeat() { this.isAlive = true; }

const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'];
const users = [];

const wss = new WebSocket.Server({ port: 3000 });
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
	ws.on('pong', heartbeat);
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
		if (user.ws.isAlive === false)
		{
			console.log("disconnected: " + user.ws._socket.remoteAddress);
			user.ws.removeAllListeners();
			user.ws.terminate();
			user.proc.onData().dispose();
			user.proc.kill();
			users.splice(i, 1);
			continue;
		}
		user.ws.isAlive = false;
		user.ws.ping();
	};
}, 5000);

app.use("/public", express.static(path.resolve("./public")));
app.use("/node_modules", express.static(path.resolve("./node_modules")));

const index_page = path.resolve("./pages/index.html");

app.get("/", (req, res) => {
	res.sendFile(index_page);
});

app.listen(3001, console.log("started"));