var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  apply: () => apply,
  name: () => name,
  schema: () => schema,
  using: () => using
});
module.exports = __toCommonJS(src_exports);
var import_koishi = require("koishi");
var import_axios = __toESM(require("axios"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var name = "koishi-plugin-weekly-epic-freegame";
var using = ["cron", "puppeteer"];
var schema = import_koishi.Schema.object({
  apiUrl: import_koishi.Schema.string().description("Epic 免费游戏 API 地址，60sapi官方提供的api地址为https://60s.123213.xyz/v2/epic").required(),
  cronTime: import_koishi.Schema.string().description("每日任务执行时间,Crontab 表达式").required(),
  groupId: import_koishi.Schema.string().description("接收推送的QQ群号").required()
}).description("Epic 每周免费游戏推送插件配置");
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
__name(escapeHtml, "escapeHtml");
function apply(ctx, config) {
  const logger = ctx.logger("epic-weekly-free");
  if (!config.apiUrl) {
    logger.warn("未配置 API 地址，Epic 免费游戏插件未启用。");
    return;
  }
  const cachePath = path.resolve(process.cwd(), "epic_free_cache.json");
  function buildHtml(title, items) {
    const itemsHtml = items.map((item) => {
      const gameTitle = escapeHtml(item.title || "");
      const gameDesc = escapeHtml(item.description || "");
      const cover = item.cover || "";
      return `
        <div class="item">
          <img class="cover" src="${cover}" alt="封面" />
          <div class="info">
            <h2 class="title">${gameTitle}</h2>
            <p class="desc">${gameDesc}</p>
          </div>
        </div>`;
    }).join("\n");
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  body { margin: 0; padding: 20px; font-family: "Microsoft YaHei", sans-serif; background: #fff; color: #000; }
  h1 { font-size: 24px; margin: 10px 0; }
  .item { display: flex; align-items: flex-start; margin: 10px 0; padding: 10px; border-bottom: 1px solid #ccc; }
  .cover { width: 150px; height: auto; margin-right: 10px; }
  .info { flex: 1; }
  .title { font-size: 18px; margin: 0 0 5px; }
  .desc { font-size: 14px; margin: 0; }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${itemsHtml}
</body>
</html>`;
  }
  __name(buildHtml, "buildHtml");
  async function fetchGames() {
    try {
      const response = await import_axios.default.get(config.apiUrl);
      const data = response.data;
      const games = Array.isArray(data) ? data : data.data || [];
      if (!games || games.length === 0) {
        logger.info("未获取到任何游戏数据");
        return null;
      }
      return games;
    } catch (error) {
      logger.error("拉取 Epic 免费游戏信息失败:", error);
      throw error;
    }
  }
  __name(fetchGames, "fetchGames");
  async function sendGames(games, session) {
    const nowFree = games.filter((item) => item.is_free_now);
    const upcoming = games.filter((item) => !item.is_free_now);
    const htmlNow = buildHtml("现在免费游戏", nowFree);
    const htmlUpcoming = buildHtml("即将免费游戏", upcoming);
    const imageNow = await ctx.puppeteer.render(htmlNow);
    const imageUpcoming = await ctx.puppeteer.render(htmlUpcoming);
    if (session) {
      await session.send(imageNow);
      await session.send(imageUpcoming);
    } else if (config.groupId) {
      for (const bot of ctx.bots) {
        try {
          await bot.sendMessage(config.groupId, imageNow);
          await bot.sendMessage(config.groupId, imageUpcoming);
        } catch (err) {
          logger.error("发送图片消息失败:", err);
        }
      }
    }
  }
  __name(sendGames, "sendGames");
  ctx.command("epic-freegame", "获取最新的 Epic 免费游戏").action(async ({ session }) => {
    await session.send("正在获取 Epic 免费游戏信息，请稍候...");
    try {
      const games = await fetchGames();
      if (games) {
        await sendGames(games, session);
      } else {
        await session.send("未获取到任何游戏数据");
      }
    } catch (error) {
      logger.error("Epic 免费游戏任务执行出错:", error);
      await session.send("获取 Epic 免费游戏信息失败，请稍后重试");
    }
  });
  if (!config.cronTime || !config.groupId) {
    logger.info("未配置执行时间或群号，定时推送未启用，但指令功能可用。");
    return;
  }
  ctx.cron(config.cronTime, async () => {
    try {
      let lastData = null;
      if (fs.existsSync(cachePath)) {
        try {
          const content = fs.readFileSync(cachePath, "utf-8");
          lastData = JSON.parse(content);
        } catch (err) {
          logger.warn("读取缓存文件失败，将视为首次运行");
        }
      }
      const games = await fetchGames();
      if (!games) return;
      const newDataString = JSON.stringify(games);
      const lastDataString = lastData ? JSON.stringify(lastData) : null;
      if (lastDataString === newDataString) {
        logger.info("Epic 免费游戏数据未更新");
        return;
      }
      logger.info("Epic 免费游戏数据已更新，正在推送...");
      await sendGames(games);
      try {
        fs.writeFileSync(cachePath, JSON.stringify(games, null, 2), "utf-8");
      } catch (err) {
        logger.error("写入缓存文件失败:", err);
      }
    } catch (error) {
      logger.error("Epic 免费游戏定时任务执行出错:", error);
    }
  });
}
__name(apply, "apply");
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  apply,
  name,
  schema,
  using
});
