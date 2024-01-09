const express = require("express");
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");
const fs = require("fs");
const spawn = require("child_process").spawn;

const TIMEOUT = 5000;
const SOCKET_PORT = 3000;
const WEB_PORT = 3001;

const shell = process.env[os.platform() === 'win32' ? 'COMSPEC' : 'SHELL'];
const app = express();
const users = [];

function run_python(name, user) {
	const child = spawn("python", [path.join(user.path, name)]);
	child.stdout.on("data", (data) => {
		console.log("d: '" + data.toString() + "'");
		user.ws.send(data.toString());
	});
	child.stderr.on("data", (data) => {
		console.log("e: '" + data.toString() + "'");
		user.ws.send(data.toString());
	});
	child.on("exit", () => {
		user.ws.send("program ended");
	});
}

function save_file(data, name, user)
{
	if(!fs.existsSync(user.path)) fs.mkdirSync(user.path);
	fs.writeFileSync(path.join(user.path, name), data);
	
}

const wss = new WebSocket.Server({ port: SOCKET_PORT });
wss.on('connection', (ws, req) => {
	console.log("new session: " + req.socket.remoteAddress);

	const proc = pty.spawn(shell, ["/k"], {
		name: 'xterm-color',
		cwd: process.cwd(),
		env: process.env,
		useConpty: true,	// windows: true: crash after proc.kill(), false: duplicated lines
	});

	const user = {
		"ws": ws, 
		"proc": proc,
		"path": path.resolve("./users/" + req.socket.remoteAddress.split(":")[3])
	};
	users.push(user);

	ws.isAlive = true;
	ws.on('error', console.error);
	ws.on('pong', () => ws.isAlive = true);
	ws.on('message', command => {
		if(command.at(0) == 4)
		{
			const json = JSON.parse(command.slice(1).toString());
			const data = json.data;
			switch(json.do)
			{
				case "size":
					proc.resize(data.w, data.h);
					break;
				case "run":
					save_file(data.data, data.name, user);
					run_python(data.name, user);
					break;
			}
		}
		else proc.write(command);
	});

	// ToDo proper input
	/*proc.on('data', (data) => {
		ws.send(data)
		console.log(data.charCodeAt(0) + `\t- '${data}'`);
	});*/
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