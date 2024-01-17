const express = require("express");
const path = require("path");
const os = require('os');
const pty = require('node-pty');
const WebSocket = require("ws");
const fs = require("fs");
const spawn = require("child_process").spawn;
const docker = require('dockerode');

const CONFIG_ERROR = {
	NO: -1,
	FILE_NOT_FOUND: 0,
}

const MSG_LEVEL = {
	INFO: "I",
	WARNING: "W",
	ERROR: "E",
	MSG: "M"
}

/**
 * @typedef {Object} Runner
 * @property {pty.IPty} proc - pty for interacting with running program
 * @property {string} file - name of the main file
 */

/**
 * @typedef {Object} User
 * @property {WebSocket} ws - websocket of user
 * @property {string} path - path to user home
 * @property {string} name - name of user
 * @property {pty.IPty} proc - normal pty terminal for interaction
 * @property {Runner} runner - running program data
 */

/**
 * @typedef {Object} Config
 * @property {string} mainFile
 * @property {CONFIG_ERROR} err
 */

const TIMEOUT = 1 * 60 * 1000;
const SOCKET_PORT = 3000;
const WEB_PORT = 3001;

const isWin = os.platform() === 'win32';
const shell = process.env[isWin ? 'COMSPEC' : 'SHELL'];
const args = isWin ? ["/k"] : [];
const app = express();
/** @type {User[]} */
const users = [];
const users_folder = path.resolve("./users");

if(!fs.existsSync(users_folder)) fs.mkdirSync(users_folder);

/** @param {string} program - name of program*/
function exe(program) { return isWin ? `${program}.exe` : program; }

/**
 * @param {!User} user 
 * @param {!string} filename
 * @returns {string}
 */
function get_user_file(user, filename) { return path.join(user.path, filename); }
//function undefined_check(toCheck, name) { if(toCheck === undefined) throw new Error(`${name} cannot be undefined`)}

/**
 * 
 * @param {!User} user 
 * @param {!string} msg 
 * @param {MSG_LEVEL|undefined} level 
 */
function send_message(user, msg, level)
{
	var newMsg = msg;
	if(level !== undefined)
	{
		if(level === MSG_LEVEL.INFO) newMsg = "\x1b[39;49m";
		else if(level === MSG_LEVEL.WARNING) newMsg = "\x1b[33;49m";
		else if(level === MSG_LEVEL.ERROR) newMsg = "\x1b[31;49m";
		else if(level === MSG_LEVEL.MSG) newMsg = "\x1b[32;49m";
		newMsg += msg + "\x1b[0m\n";
	}
	user.ws.send("\x04" + newMsg);
}

/**
 * @param {!User} user
 * @param {!string} lang
 * @returns {Config}
 */
function get_config(user, lang)
{
	// defaults
	var mainFile = `main.${lang}`;
	const configs = {
		"mainFile": mainFile,
		"err": CONFIG_ERROR.NO,
	};

	// .config file
	const configPath = get_user_file(user, ".config.json");
	if(fs.existsSync(configPath))
	{
		const configFile = fs.readFileSync(configPath, { encoding: "utf8" });
		const json = JSON.parse(configFile);

		if(json.mainFile && json.mainFile.length > 0 && path.resolve(get_user_file(user, json.mainFile)).length > user.path.length) configs.mainFile = json.mainFile;
	}

	if(!fs.existsSync(get_user_file(user, configs.mainFile))) configs.err = CONFIG_ERROR.FILE_NOT_FOUND;

	return configs;
}

/** @param {!User} user */
function log_start(user) { console.log(`${user.name} started file '${user.runner.file}', pid: ${user.runner.proc.pid}`) }
/** @param {!User} user */
function log_stop(user) { console.log(`${user.name} stopped file '${user.runner.file}', pid: ${user.runner.proc.pid}`) }
/** @param {!User} user */
function log_compile(user) { console.log(`${user.name} started compiling '${user.runner.file}', pid: ${user.runner.proc.pid}`) }

/**
 * @param {!User} user
 * @param {!string} cmd
 * @param {!string[]} args
 * @param {!Config} configs
 * @param {?pty.IEvent<string>} onExit
 * @returns {boolean} true if successfully started, false otherwise
 */
function start_process(user, cmd, args, configs, onExit)
{
	/*
		windows: no colors (until virtual terminal isn't enabled)
		linux: works
	*/
	const child = pty.spawn(cmd, args, {
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
	if(onExit === undefined)
	{
		child.on("exit", (e) => {
			send_message(user, `\nprogram ended with exit code ${e < 2147483648 ? e : e - Math.pow(2, 32)}\nPress ENTER to continue`, MSG_LEVEL.MSG);
		})
	}
	else child.on("exit", onExit);
	return child.pid != -1;
}

/**
 * @param {!User} user
 * @param {!string} cmd
 * @param {!string[]} args
 * @param {!Config} configs
 * @returns {boolean} true if successfully started, false otherwise
 */
function compile_process(user, cmd, args, configs)
{
	return start_process(user, cmd, args, configs, (e) => {
		if(e == "0")
		{
			configs.mainFile = exe("main");
			if(start_process(user, get_user_file(user, configs.mainFile), [], configs)) log_start(user);
		}
	});
}

/**
 * @param {!User} user
 * @param {!string} lang
 * @returns {boolean} true if started the executable, false otherwise
 */
function run(user, lang) {
	const configs = get_config(user, lang);
	if(configs.err != CONFIG_ERROR.NO)
	{
		switch(configs.err)
		{
			case CONFIG_ERROR.FILE_NOT_FOUND:
				send_message(user, `Error main file '${configs.mainFile}' doesn't exists`, MSG_LEVEL.ERROR);
				break;
		}
		return;
	}

	const mainFile = get_user_file(user, configs.mainFile);
	switch(lang)
	{
		case "py": start_process(user, exe("python"), [mainFile], configs); return true;
		case "js": start_process(user, exe("node"), [mainFile], configs); return true;
		case "c":
			fs.readdir(user.path, {recursive: true, encoding: "utf8"}, (err, files) => {
				var c_files = files.filter(f => path.extname(f).toLowerCase() == ".c");
				compile_process(user, exe("gcc"), ["-Wall", "-Os", "-s", "-o", exe("main")].concat(c_files), configs);
			});
			break;
		case "cpp":
			fs.readdir(user.path, {recursive: true, encoding: "utf8"}, (err, files) => {
				var cpp_files = files.filter(f => path.extname(f).toLowerCase() == ".cpp");
				compile_process(user, exe("g++"), ["-Wall", "-Os", "-s", "-o", exe("main")].concat(cpp_files), configs);
			});
			break;
		default: send_message(user, `Language '${lang}' is not supported`, MSG_LEVEL.ERROR);
	}
	return false;
}

const wss = new WebSocket.Server({ port: SOCKET_PORT });
wss.on('connection', (ws, req) => {
	console.log(`new session: ${req.socket.remoteAddress}`);

	// ToDo name -> hash/id
	var name = req.socket.remoteAddress;
	name = name.slice(name.lastIndexOf(":")+1);
	const user = {
		"ws": ws, 
		"path": path.join(users_folder, name),
		"runner": undefined,
		"name": name,
		"proc": undefined
	};
	
	fs.mkdir(user.path, ()=>{});

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
					fs.writeFileSync(get_user_file(user, filePath), data);
					console.log(`${name} saved file '${data.path}'`);
					break;
				case "run":
					// ToDo proper error handling
					if(run(user, data)) log_start(user);
					else log_compile(user);
					break;
				case "stop":
					// ToDo proper error handling
					if(user.runner == undefined) break;
					log_stop(user);
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
app.use("/@xterm", express.static(path.resolve("./node_modules/xterm")));
app.use("/@xterm", express.static(path.resolve("./node_modules/@xterm")));
app.use("/ace", express.static(path.resolve("./node_modules/ace-builds")));

const index_page = path.resolve("./pages/index.html");

app.get("/", (req, res) => {
	res.sendFile(index_page);
});

app.listen(WEB_PORT, console.log("started"));