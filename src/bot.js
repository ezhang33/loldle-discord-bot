const fs = require("node:fs");
const path = require("node:path");
const { Client, Collection, GatewayIntentBits } = require("discord.js");
const config = require("./config");
const { open } = require("./db");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.config = config;
client.db = open(config.dbPath);
client.commands = new Collection();

const commandsDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
    const command = require(path.join(commandsDir, file));
    client.commands.set(command.data.name, command);
}

const eventsDir = path.join(__dirname, "events");
for (const file of fs.readdirSync(eventsDir).filter((f) => f.endsWith(".js"))) {
    const event = require(path.join(eventsDir, file));
    const handler = (...args) => event.execute(...args, client);
    if (event.once) client.once(event.name, handler);
    else client.on(event.name, handler);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
        client.destroy();
        client.db.close();
        process.exit(0);
    });
}

client.login(config.token);
