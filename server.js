const express = require("express");
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");
const fs = require("fs");
const spawn = require("child_process").spawn;
const docker = require('dockerode');

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

function get_program(program) { return isWin ? `${program}.exe` : program; }
function get_user_file(user, filename) { return path.join(user.path, filename); }
function undefined_check(toCheck, name) { if(toCheck === undefined) throw new Error(`${name} cannot be undefined`)}

const LEVEL_INFO = "I";
const LEVEL_WARNING = "W";
const LEVEL_ERROR = "E";
const LEVEL_MSG = "M";

function send_message(user, msg, level)
{
	undefined_check(user, "user");
	undefined_check(msg, "msg");
	var newMsg = msg;
	if(level !== undefined)
	{
		if(level === LEVEL_INFO) newMsg = "\x1b[39;49m";
		else if(level === LEVEL_WARNING) newMsg = "\x1b[33;49m";
		else if(level === LEVEL_ERROR) newMsg = "\x1b[31;49m";
		else if(level === LEVEL_MSG) newMsg = "\x1b[32;49m";
		newMsg += msg + "\x1b[0m\n";
	}
	user.ws.send("\x04" + newMsg);
}

function get_config(user, lang)
{
	// defaults
	var mainFile = `main.${lang}`;
	const configs = {
		"mainFile": mainFile,
		"err": -1
	};

	// .config file
	const configPath = get_user_file(user, ".config.json");
	if(fs.existsSync(configPath))
	{
		const configFile = fs.readFileSync(configPath, { encoding: "utf8" });
		const json = JSON.parse(configFile);

		if(json.mainFile && json.mainFile.length > 0 && path.resolve(get_user_file(user, json.mainFile)).length > user.path.length) configs.mainFile = json.mainFile;
	}

	if(!fs.existsSync(get_user_file(user, configs.mainFile))) configs.err = 0;

	return configs;
}

function run_python(user) {
	const configs = get_config(user, "py");
	if(configs.err != -1)
	{
		switch(configs.err)
		{
			case 0: send_message(user, `Error main file '${configs.mainFile}' doesn't exists`, LEVEL_ERROR); break;
		}
		return;
	}
	/*
		windows: no colors (until virtual terminal isn't enabled)
		linux: works
	*/
	const child = pty.spawn(get_program("python"), [get_user_file(user, configs.mainFile)], {
		cwd: user.path,
		env: process.env,
		name: "xterm-color",
		useConpty: false,
		cols: user.proc.cols,
		rows: user.proc.rows,
	})
	user.runner = { "proc": child, "file": configs.mainFile };
	child.on("data", data => {
		user.ws.send(data);
	});
	child.on("exit", () => {
		send_message(user, "\nprogram ended\nPress ENTER to continue", LEVEL_MSG);
	})
}

function save_file(data, filePath, user)
{
	if(!fs.existsSync(user.path)) fs.mkdirSync(user.path);
	fs.writeFileSync(get_user_file(user, filePath), data);
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