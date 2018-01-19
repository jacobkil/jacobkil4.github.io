const dj = require("dankjson");
const request = require("request");
const express = require("express");
const exphbs = require("express-handlebars");
const c = require("chalk");
const Promise = require("promise");
const bodyParser = require("body-parser");

let app = express();

// View engine
app.engine("hbs", exphbs({extname: ".hbs", defaultLayout: "layout.hbs"}));
app.set("view engine", "hbs");
app.set("views", "views");

// Serve static files
app.use(express.static("static"));

// Body Parser
app.use(bodyParser.urlencoded({
  extended: true
}));

// Config defaults
let defaults = {
    tokens: [
        "TOKEN"
    ],
    proxies: [
        "IP:PORT"
    ],
    port: 1337
}

let active;
let proxies = {};
let tokens = {};

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

let settings = {
    invite: "",
    id: "",
    message: "",
    character: "§",
    joinDelay: 500,
    messageDelay: 1000,
    delayPadding: 250
}

class Bot {

    constructor(token, proxy) {
        this.token = token;
        this.proxy = proxy;

        this.fails = 0;
    }

    req(method, url, form) {
        return new Promise((resolve, reject) => {
            request({
                method: method,
                url: url,
                proxy: "http://" + this.proxy,
                headers: {
                    authorization: this.token
                },
                form: form
            }, (error, response, body) => {
                if (!error && body) return resolve(body);
                reject();
            });
        });
    }

}

function working(object) {
    let ret = [];
    for (var key in object) {
        if (!object.hasOwnProperty(key)) return;
        if (object[key]) ret.push(key);
    }
    return ret;
}

// Routing
app.post("/", (req, res) => {
    if (active) {
        active = false;
    } else {
        active = true;

        let invite = req.body.invite;
        let id = req.body.id;
        let message = req.body.message;
        let character = req.body.character;
        let joinDelay = req.body.joinDelay;
        let messageDelay = req.body.messageDelay;
        let delayPadding = req.body.delayPadding;

        settings.invite = invite;
        settings.id = id;
        settings.message = message;
        settings.character = character;
        settings.joinDelay = joinDelay;
        settings.messageDelay = messageDelay;
        settings.delayPadding = delayPadding;

        let workingProxies = working(proxies);
        let workingTokens = working(tokens);
        let bots = [];
        let z = 0;
        let a = 0;

        workingTokens.forEach(token => {
            let proxy = workingProxies[z];
            
            bots.push(new Bot(token, proxy));

            z++;
            if (z > workingProxies.length) z = 0;
        });

        function loop() {
            if (!active) return;

            let bot = bots[a];

            bot.req("POST", "https://discordapp.com/api/v6/invite/" + invite).then(body => {
                if (!active) return;

                let interval = setInterval(() => {
                    if (!active) return clearInterval(interval);

                    let content = "";
                    for (var i = 0; i < message.length; i++) {
                        let char = message[i];
                        if (char == character) content += chars.charAt(Math.floor(Math.random() * chars.length));
                        else content += char;
                    }

                    bot.req("POST", "https://discordapp.com/api/v6/channels/" + id + "/messages", {content: content}).then(body => {
                        let json = JSON.parse(body);

                        if (!json.content) {
                            return bot.fails++;
                        }

                        bot.fails = 0;
                    }).catch(() => {
                        bot.fails++;
                    });

                    if (bot.fails >= 3) {
                        console.log(c.red("REMOVE") + " bot removed");
                        bots.splice(bots.indexOf(bot), 1);

                        if (bots.length == 0) {
                            console.log(c.red("STOPPED") + " all bots were removed");
                            active = false;
                        }

                        clearInterval(interval);
                    }
                }, messageDelay);
            });

            a++;
            if (a < bots.length) setTimeout(() => loop(), joinDelay);
        }

        loop();
    }
    res.redirect("/");
});

app.get("/", (req, res) => {
    res.render("main", {active: active, settings: settings, proxyCount: working(proxies).length, tokenCount: working(tokens).length});
});

app.get("/status", (req, res) => {
    res.render("status", {active: active, proxies: proxies, tokens: tokens, proxyCount: working(proxies).length, tokenCount: working(tokens).length});
});

// Token & porxy index
let x = 0;
let y = 0;

function test(proxy, token) {
    return new Promise((resolve, reject) => {
        let resolved;

        new Bot(token, proxy).req("GET", "https://discordapp.com/api/v6/users/@me").then(body => {
            if (resolved) return;
            resolved = true;

            let json = JSON.parse(body);

            if (json.code == 0) {
                console.log(c.red("FAIL") + " TOKEN " + token);
                tokens[token] = false;
                y++;
            } else {
                console.log(c.green("PASS") + " TOKEN " + token);
                tokens[token] = true;
                y++;
            }

            console.log(c.green("PASS") + " PROXY " + proxy);
            resolve(proxies[proxy] = true);
        }).catch(() => {
            if (resolved) return;
            resolved = true;

            console.log(c.red("FAIL") + " PROXY " + proxy);
            resolve(proxies[proxy] = false);
        });

        setTimeout(() => {
            if (resolved) return;
            resolved = true;

            console.log(c.red("FAIL") + " PROXY " + proxy);
            resolve(proxies[proxy] = false);
        }, 5000);
    });
}

dj(["../config.json"], [defaults], 4).then(config => {

    config = config.config;

    // Proxy & Token checking loop
    function loop() {
        let proxy = config.proxies[x];
        let token = config.tokens[y];

        test(proxy, token).then(() => {
            x++;
            if (x == config.proxies.length) x = 0;
            if (y == config.tokens.length) y = 0;
            setTimeout(() => loop(), 5000);
        });
    }

    app.listen(config.port, () => {
        console.log(c.blue("APP RUNNING"));
        console.log("Visit localhost:" + config.port + " with your webbrowser");

        loop();
    });

});