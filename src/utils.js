'use strict';
const os = require('os');

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
	return d.toLocaleString();
}

/** @param {string} msg */
function log(msg) { console.log(`[${get_time()}]: ` + msg); }

module.exports = {
	log: log,
	get_time: get_time,
	undefined_check: undefined_check,
	exe: exe,
	isWin: isWin,
}