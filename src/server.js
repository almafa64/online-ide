'use strict';

const utils = require("./utils");
const path = require("path");
const pty = require('node-pty');
const WebSocket = require("ws");
const fs = require("fs");
const fsPromise = require("fs/promises");
const spawn = require("child_process").spawn;
const docker = require('dockerode');
const sqlite3 = require("better-sqlite3");
const server = require("http").createServer();

/** @enum {number}*/
const CONFIG_ERROR = {
	NO: 0,
	FILE_NOT_FOUND: 1,
	FILE_READ_ERROR: 2,
}

/** @enum {string}*/
const MSG_LEVEL = {
	INFO: "I",
	WARNING: "W",
	ERROR: "E",
	MSG: "M"
}

/** @enum {number}*/
const RUN_RETURN = {
	ERROR: -1,
	RUN: 0,
	COMPILE: 1,
}

/**
 * @typedef {Object} Runner
 * @property {pty.IPty} proc pty for interacting with running program
 * @property {string} file name of the main file
 */

/**
 * @typedef {Object} Project
 * @property {string} public_id
 * @property {string} edit_id
 * @property {string} pass
 * @property {number} ttl
 */

/**
 * @typedef {Object} User
 * @property {WebSocket} ws websocket of user
 * @property {string} path path to user home
 * @property {string} name name of user
 * @property {pty.IPty} proc normal pty terminal for interaction
 * @property {?Runner} runner running program data
 * @property {?Project} project opened project
 */

/**
 * @typedef {Object} Config
 * @property {string} mainFile
 * @property {CONFIG_ERROR} err
 */

const TIMEOUT = 1 * 60 * 1000;
const PORT = 3001;

const shell = process.env[utils.isWin ? 'COMSPEC' : 'SHELL'];
const args = utils.isWin ? ["/k"] : [];
/** @type {User[]} */
const users = [];
const users_folder = path.resolve("./users");

fs.mkdirSync(users_folder, { recursive: true });

const db_folder = path.resolve("./db");
fs.mkdirSync(db_folder, { recursive: true });
const db = sqlite3(path.join(db_folder, "db.db"));
db.pragma('journal_mode = WAL');
db.pragma('cache_size = -31250');
db.prepare(`create table if not exists "projects"(
	public_id text primary key,
	edit_id text NOT NULL UNIQUE,
	pass text NOT NULL,
	lang text NOT NULL,
	ttl number NOT NULL
)`).run();
const insert_project = db.prepare(`insert into projects (public_id, edit_id, pass, lang, ttl) values (?, ?, ?, ?, ?)`);
const get_eid_project = db.prepare(`select * from projects where edit_id = ?`);
const get_id_project = db.prepare(`select * from projects where public_id = ?`);

server.on("request", require("./web_server")); // pass requests to web server

/**
 * @param {!User} user
 * @param {!string} filename
 * @returns {string|undefined}
 */
function get_user_file(user, filename)
{
	const file_path = path.resolve(path.join(user.path, filename));
	if(!file_path.startsWith(user.path)) return undefined;
	return file_path;
}

/**
 * @param {User} user
 * @param {*} task name of task
 * @param {*} data
 */
function send_json(user, task, data)
{
	const toSend = (data === undefined) ? { "do": task } : { "do": task, "data": data };
	user.ws.send("\x04" + JSON.stringify(toSend));
}

/**
 * @param {!User} user
 * @param {!string} msg
 * @param {MSG_LEVEL|undefined} level
 */
function send_message(user, msg, level)
{
	var newMsg = msg;
	if(level !== undefined)
	{
		switch (level) {
			case MSG_LEVEL.INFO: newMsg = "\x1b[39;49m"; break;
			case MSG_LEVEL.WARNING: newMsg = "\x1b[33;49m"; break;
			case MSG_LEVEL.ERROR: newMsg = "\x1b[31;49m"; break;
			case MSG_LEVEL.MSG: newMsg = "\x1b[32;49m"; break;
		}
		newMsg += msg + "\x1b[0m\n";
	}
	send_json(user, "msg", newMsg);
}

/**
 * @param {!User} user
 * @param {!string} lang
 * @returns (Check err to see if failed)
 */
async function get_config_async(user, lang)
{
	/** @type {Config} */
	const config = {
		"mainFile": `main.${lang}`,
		"err": CONFIG_ERROR.NO,
	};

	// .config file
	const configPath = get_user_file(user, ".config.json");
	try {
		const data = await fsPromise.readFile(configPath, { encoding: "utf8" });
		const json = JSON.parse(data);
		
			// set main file to the main file from config if it exists and it is in the user directory
		if(json.mainFile && json.mainFile.length > 0)
		{
			const jsonMain = get_user_file(user, json.mainFile);
			if(jsonMain && jsonMain.startsWith(user.path))
				config.mainFile = json.mainFile;
		}
	}
	catch {}

	if(!fs.existsSync(get_user_file(user, config.mainFile)))
		config.err = CONFIG_ERROR.FILE_NOT_FOUND;

	return config;
	
}

/** @param {!User} user */
function log_start(user) { utils.user_log(user, `started file '${user.runner.file}', pid: ${user.runner.proc.pid}`); }
/** @param {!User} user */
function log_stop(user) { utils.user_log(user, `stopped file '${user.runner.file}', pid: ${user.runner.proc.pid}`); }
/** @param {!User} user */
function log_compile(user) { utils.user_log(user, `started compiling '${user.runner.file}', pid: ${user.runner.proc.pid}`); }
/** @param {!User} user */
function log_save(user, path) { utils.user_log(user, `saved file '${path}'`); }
/** @param {!User} user */
function log_save_fail(user, path) { utils.user_log(user, `failed to save file '${path}'`); }

/**
 * @param {!User} user
 * @param {!string} cmd
 * @param {!string[]} args
 * @param {!Config} config
 * @param {?pty.IEvent<string>} onExit
 * @returns {boolean} true if successfully started, false otherwise
 */
function start_process(user, cmd, args, config, onExit)
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
	
	user.runner = { "proc": child, "file": config.mainFile };
	
	child.onData(data => user.ws.send(data));
	child.onExit(e => {
		const code = e.exitCode < 2147483648 ? e.exitCode : e.exitCode - Math.pow(2, 32);
		if(onExit === undefined)
			send_message(user, `\nprogram ended with exit code ${code}\nPress ENTER to continue`, MSG_LEVEL.MSG);
		else
			onExit(code);
	});

	return child.pid != -1;
}

/**
 * @param {!User} user
 * @param {!string} cmd
 * @param {!string[]} args
 * @param {!Config} config
 * @returns {boolean} true if successfully started, false otherwise
 */
function compile_process(user, cmd, args, config)
{
	return start_process(user, cmd, args, config, (e) => {
		if(e != "0")
		{
			send_message(user, `compiler returned ${e}`, MSG_LEVEL.ERROR);
			utils.user_log(user, `compiling failed: ${e}`);
			return;
		}

		config.mainFile = utils.exe("main");
		user.runner.proc.kill();
		if(start_process(user, get_user_file(user, config.mainFile), [], config))
			log_start(user);
	});
}

/**
 * @param {!User} user
 * @param {!string} lang
 * @returns {Promise<RUN_RETURN>}
 */
async function run(user, lang) {
	const config = await get_config_async(user, lang);
	if(config.err !== CONFIG_ERROR.NO)
	{
		switch(config.err)
		{
			case CONFIG_ERROR.FILE_NOT_FOUND:
				send_message(user, `Error main file '${config.mainFile}' doesn't exists`, MSG_LEVEL.ERROR);
				break;
		}
		return Promise.reject(RUN_RETURN.ERROR);
	}

	const mainFile = get_user_file(user, config.mainFile);
	switch(lang)
	{
		case "lua": start_process(user, utils.exe("lua"), [mainFile], config); return RUN_RETURN.RUN;
		case "py": start_process(user, utils.exe("python"), [mainFile], config); return RUN_RETURN.RUN;
		case "js": start_process(user, utils.exe("node"), [mainFile], config); return RUN_RETURN.RUN;
		case "c": {
			const files = await fsPromise.readdir(user.path, {recursive: true, encoding: "utf8"})
			const c_files = files.filter(f => path.extname(f).toLowerCase() == ".c");
			compile_process(user, utils.exe("gcc"), ["-Wall", "-Os", "-s", "-o", utils.exe("main")].concat(c_files), config);
			return RUN_RETURN.COMPILE;
		}
		case "cpp": {
			const files = await fsPromise.readdir(user.path, {recursive: true, encoding: "utf8"})
			const cpp_files = files.filter(f => path.extname(f).toLowerCase() == ".cpp");
			compile_process(user, utils.exe("g++"), ["-Wall", "-Os", "-s", "-o", utils.exe("main")].concat(cpp_files), config);
			return RUN_RETURN.COMPILE;
		}
		default:
			send_message(user, `Language '${lang}' is not supported`, MSG_LEVEL.ERROR);
			return Promise.reject(RUN_RETURN.ERROR);
	}
}

const wss = new WebSocket.Server({ server: server });
wss.on('connection', async (ws, req) => {
	ws.ip = req.headers["x-real-ip"] || ws._socket.remoteAddress;

	if(req.headers.origin !== "https://themoonbase.dnet.hu")
	{
		utils.log(`Blocked ${req.headers.origin} (${ws.ip}). origin didnt match`);
		ws.terminate();
		return;
	}

	utils.log(`${ws.ip} connected`);

	const queries = new URL(req.url, "ws://"+req.headers.host).searchParams;

	/**@type Project*/
	var project;
	if(queries.size > 0)
	{
		const id = queries.get("id");
		const eid = queries.get("eid");
		if(id) project = get_id_project.get(id);
		else if(eid) project = get_eid_project.get(eid);
	}

	if(project)
	{
		
	}
	else
	{
		project = {
			"public_id": "",
			"edit_id": "",
			"pass": "",
			"ttl": -1,
		}

	}

	// ToDo name -> hash/id
	var name = ws.ip;
	name = name.slice(name.lastIndexOf(":")+1);
	/** @type {User} */
	const user = {
		"ws": ws,
		"path": path.join(users_folder, name),
		"runner": undefined,
		"name": name,
		"proc": undefined,
		"project": project
	};

	await fsPromise.mkdir(user.path, { recursive: true });

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

	user.proc = proc;
	users.push(user);

	ws.isAlive = true;
	ws.on('error', console.error);
	ws.on('pong', () => ws.isAlive = true);
	ws.on('message', async command => {
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
				case "save": // ToDo turn this into POST request
					const saveFile = get_user_file(user, data.path);
					if(!saveFile)
					{
						send_message(user, `failed to save ${data.path}\n`);
						log_save_fail(user, data.path);
						break
					}
					await fsPromise.writeFile(saveFile, data.data, {encoding: "utf8"});
					send_json(user, "saveconf");
					log_save(user, data.path);
					break;
				case "run":
					const ret = await run(user, data);
					if(ret == RUN_RETURN.RUN) log_start(user);
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
		if (ws.isAlive === false)
		{
			const runner = user.runner;
			utils.log(`${ws.ip} disconnected`);
			ws.removeAllListeners();
			ws.terminate();
			user.proc.kill();
			if(runner != undefined) runner.proc.kill();
			users.splice(i, 1);
			continue;
		}
		ws.isAlive = false;
		ws.ping();
	};
}, TIMEOUT);

server.listen(PORT, () => utils.log(`server started on ${PORT}`))