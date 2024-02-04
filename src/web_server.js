const path = require("path");
const utils = require("./utils");
const express = require("express");

const app = express();
const WEB_PORT = 3001;

app.use("/public", express.static(path.resolve("./public")));
app.use("/@xterm", express.static(path.resolve("./node_modules/xterm")));
app.use("/@xterm", express.static(path.resolve("./node_modules/@xterm")));
app.use("/ace", express.static(path.resolve("./node_modules/ace-builds")));
app.use(express.urlencoded({extended:true}));

app.set('view engine','ejs');
app.engine('html', require('ejs').renderFile);
app.set('views', path.resolve("./pages"));

app.get("/:lang", (req, res) => {
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
app.get("/", (req, res) => {
	if(req.query.id || req.query.eid) res.render("index", { "lang": "py" });
	else res.redirect("/python");
});

app.listen(WEB_PORT, utils.log("started"));