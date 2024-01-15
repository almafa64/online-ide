const express = require("express");
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");
const fs = require("fs");
const spawn = require("child_process").spawn;

const TIMEOUT = 1 * 60 * 1000;
const SOCKET_PORT = 3000;
const WEB_PORT = 3001;

const isWin = os.platform() === 'win32';
const shell = process.env[isWin ? 'COMSPEC' : 'SHELL'];
const args = isWin ? ["/k"] : [];
const app = express();
const users = [];
const users_folder = path.resolve("./users");

if(!fs.existsSync(users_folder)) fs.mkdirSync(users_folder);

function get_program(program) { return isWin ? `${program}.exe` : program }

function run_python(user) {
	/*
		windows: no colors (until virtual terminal isn't enabled)
		linux: works
	*/
	const child = pty.spawn(get_program("python"), [path.join(user.path, "main.py")], {
		cwd: user.path,
		env: process.env,
		name: "xterm-color",
		useConpty: false,
		cols: user.proc.cols,
		rows: user.proc.rows,
	})
	user.runner = { "proc": child, "file": "main.py" };
	child.on("data", data => {
		user.ws.send(data);
	});
	child.on("exit", () => {
		user.ws.send("\nprogram ended\n");
		user.ws.send("Press ENTER to continue");
	})
}

function save_file(data, filePath, user)
{
	if(!fs.existsSync(user.path)) fs.mkdirSync(user.path);
	fs.writeFileSync(path.join(user.path, filePath), data);
}

const wss = new WebSocket.Server({ port: SOCKET_PORT });
wss.on('connection', (ws, req) => {
	console.log(`new session: ${req.socket.remoteAddress}`);

	const name = req.socket.remoteAddress.split(":")[3];
	const user = {
		"ws": ws, 
		"path": path.join(users_folder, name),
		"runner": undefined,
		"name": name
	};

	/*
	useConpty
		windows
			true: crash after proc.kill()
			false: duplicated lines after resize from narrow to wide
		linux
			works
	*/
	const proc = pty.spawn(shell, args, {
		name: 'xterm-color',
		cwd: user.path,
		env: process.env,
		useConpty: false,
	});

	user["proc"] = proc;
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
					if(user.runner !== undefined) user.runner.proc.resize(data.w, data.h);
					else proc.resize(data.w, data.h);
					break;
				case "save":
					save_file(data.data, data.path, user);
					console.log(`${name} saved file '${data.path}'`);
					break;
				case "run":
					// language = data
					run_python(user);
					// ToDo proper error handling
					if(user.runner == undefined) break;
					console.log(`${name} started file '${user.runner.file}', pid: ${user.runner.proc.pid}`);
					break;
				case "stop":
					// ToDo proper error handling
					if(user.runner == undefined) break;
					console.log(`${name} stopped file '${user.runner.file}', pid: ${user.runner.proc.pid}`);
					proc.resize(user.runner.proc.cols, user.runner.proc.rows);
					user.runner.proc.kill();
					user.runner = undefined;
					break;
			}
		}
		else if(user.runner !== undefined) user.runner.proc.write(command);
		else proc.write(command);
	});

	proc.on('data', (data) => {
		ws.send(data);
	});
})

setInterval(() => {
	var i = users.length;
	while(i--)
	{
		const user = users[i];
		const ws = user.ws;
		const proc = user.proc;
		const runner = user.runner;
		if (ws.isAlive === false)
		{
			console.log(`disconnected: ${ws._socket.remoteAddress}`);
			ws.removeAllListeners();
			ws.terminate();
			proc.kill();
			if(runner != undefined) runner.proc.kill();
			users.splice(i, 1);
			continue;
		}
		ws.isAlive = false;
		ws.ping();
	};
}, TIMEOUT);

app.use("/public", express.static(path.resolve("./public")));
app.use("/@xterm", express.static(path.resolve("./node_modules/@xterm")));
app.use("/ace", express.static(path.resolve("./node_modules/ace-builds")));

const index_page = path.resolve("./pages/index.html");

app.get("/", (req, res) => {
	res.sendFile(index_page);
});

app.listen(WEB_PORT, console.log("started"));