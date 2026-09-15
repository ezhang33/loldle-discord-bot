const test = require("node:test");
const assert = require("node:assert/strict");
const { ChatLimits } = require("../src/chat/limits");
const { buildMessages, renderText } = require("../src/chat/context");
const { stripThinking } = require("../src/chat/provider");

test("ChatLimits: per-user window and daily cap", () => {
    const l = new ChatLimits({ perUserPerMinute: 2, dailyCap: 3 });
    assert.equal(l.check("a", "d1", 0), null);
    assert.equal(l.check("a", "d1", 1000), null);
    assert.equal(l.check("a", "d1", 2000), "user");
    assert.equal(l.check("b", "d1", 2000), null);
    assert.equal(l.check("b", "d1", 3000), "daily");
    // Window slides.
    assert.equal(l.check("a", "d1", 61_000), "daily");
    // New day resets the cap.
    assert.equal(l.check("a", "d2", 61_000), null);
    assert.equal(l.dayCount, 1);
});

const user = (id, name) => ({ id, username: name, displayName: name });
const msg = (over) => ({
    id: "1",
    content: "",
    author: user("101", "edward"),
    member: null,
    mentions: { users: new Map() },
    attachments: new Map(),
    embeds: [],
    stickers: new Map(),
    ...over,
});

test("renderText replaces mentions and describes empty messages", () => {
    const m = msg({
        content: "<@900> hi, meet <@102>",
        mentions: { users: new Map([["102", user("102", "sam")]]) },
    });
    assert.equal(renderText(m, "900", "Faker"), "@Faker hi, meet @sam");
    assert.equal(renderText(msg({ embeds: [{}] }), "900", "Faker"), "(sent an embed)");
});

test("buildMessages: roles, author prefix, images only where allowed", () => {
    const png = { contentType: "image/png", url: "https://cdn/x.png" };
    const pdf = { contentType: "application/pdf", url: "https://cdn/x.pdf" };
    const history = [
        msg({ id: "1", content: "what champ is this", attachments: new Map([["a", png]]) }),
        msg({ id: "2", author: user("900", "Faker"), content: "no idea" }),
        msg({
            id: "3",
            content: "<@900> look again",
            member: { displayName: "Ed" },
            attachments: new Map([
                ["a", png],
                ["b", pdf],
            ]),
        }),
    ];
    const out = buildMessages(history, {
        botUserId: "900",
        botName: "Faker",
        images: true,
        imageMessageIds: new Set(["3"]),
    });
    assert.equal(out.length, 3);
    assert.deepEqual(out[0], { role: "user", content: "edward (<@101>): what champ is this" }); // id 1 not allowed images
    assert.deepEqual(out[1], { role: "assistant", content: "no idea" });
    assert.equal(out[2].role, "user");
    assert.equal(out[2].content[0].text, "Ed (<@101>): @Faker look again");
    assert.deepEqual(out[2].content.slice(1), [{ type: "image_url", image_url: { url: "https://cdn/x.png" } }]);

    const textOnly = buildMessages(history, { botUserId: "900", botName: "Faker", images: false, imageMessageIds: new Set(["3"]) });
    assert.equal(typeof textOnly[2].content, "string");
});

test("stripThinking removes leaked reasoning", () => {
    assert.equal(stripThinking("<think>hmm\nokay</think>\n\nhi there"), "hi there");
    assert.equal(stripThinking("plain"), "plain");
});
