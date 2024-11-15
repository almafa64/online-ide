'use strict';

const path = require("path");
const utils = require("./utils");
const express = require("express");

const app = express();
const PATH = "/online-ide";

app.use(`${PATH}/public`, express.static(path.resolve("./public")));
app.use(`${PATH}/@xterm`, express.static(path.resolve("./node_modules/xterm")));
app.use(`${PATH}/@xterm`, express.static(path.resolve("./node_modules/@xterm")));
app.use(`${PATH}/ace`, express.static(path.resolve("./node_modules/ace-builds")));
app.use(express.urlencoded({extended:true}));

app.set('view engine','ejs');
app.engine('html', require('ejs').renderFile);
app.set('views', path.resolve("./pages"));

app.get(`${PATH}/:lang`, (req, res) => {
	var lang = req.params.lang;
	switch(lang)
	{
		case "javascript":
		case "js":
			lang = "js";
			break;
		case "python":
		case "py":
			lang = "py";
			break;
		case "cpp":
			lang = "cpp";
			break
		case "c":
			lang = "c";
			break;
	}
	res.render("index", { "lang": lang });
});
app.get(`${PATH}/`, (req, res) => {
	if(req.query.id || req.query.eid) res.render("index", { "lang": "py" });
	else res.redirect(`${PATH}/python`);
});

module.exports = app;