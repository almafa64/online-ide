'use strict';
const os = require('os');
const fs = require('fs');

const log_stream = fs.createWriteStream("latest.log", { encoding: "utf8", flags: "w" });

const isWin = os.platform() === 'win32';

/** @param {string} program name of program */
function exe(program) { return isWin ? `${program}.exe` : program; }

/**
 * @param {!any} toCheck the var to check
 * @param {!string} name name of variable thats beingt checked
 * @throws if toCheck == undefined
 */
function undefined_check(toCheck, name) { if(toCheck === undefined) throw new Error(`${name} cannot be undefined`)}

function get_time()
{
	var d = new Date();
	return d.toLocaleString("en-GB", {
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
		/*timeZone: "UTC",
		timeZoneName: "short"*/
	});
}

/** @param {string} msg */
function log(msg)
{
	const text = `[${get_time()}] ${msg}`;
	console.log(text);
	log_stream.write(text + "\n");
}

/** 
 * @param {import('./server').User} user
 * @param {string} msg 
 */
function user_log(user, msg)
{
	log(`'${user.name}' ${msg}`)
}

module.exports = {
	log: log,
	user_log: user_log,
	get_time: get_time,
	undefined_check: undefined_check,
	exe: exe,
	isWin: isWin,
}