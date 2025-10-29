import { Context, Schema } from 'koishi';

declare module 'koishi' {
  interface Context {
    cron(input: string, callback: () => void): () => void;
    puppeteer: {
      render(content: string): Promise<string>;
    };
  }
}

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export const name = 'koishi-plugin-weekly-epic-freegame';
export const using = ['cron', 'puppeteer'] as const;

export interface Config {
  /** Epic 免费游戏 API 地址 */
  apiUrl: string;
  /** Cron 表达式,定时任务执行时间 */
  cronTime: string;
  /** 推送的QQ群号 */
  groupId: string;
}

export const schema: Schema<Config> = Schema.object({
  apiUrl: Schema.string().description('Epic 免费游戏 API 地址，60sapi官方提供的api地址为https://60s.123213.xyz/v2/epic').required(),
  cronTime: Schema.string().description('每日任务执行时间,Crontab 表达式').required(),
  groupId: Schema.string().description('接收推送的QQ群号').required(),
}).description('Epic 每周免费游戏推送插件配置');

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function apply(ctx: Context, config: Config) {
  const logger = ctx.logger('epic-weekly-free');
  if (!config.apiUrl) {
    logger.warn('未配置 API 地址，Epic 免费游戏插件未启用。');
    return;
  }
  // 缓存文件路径，用于保存上一次拉取的数据
  const cachePath = path.resolve(process.cwd(), 'epic_free_cache.json');

  // 构建 HTML 模板函数
  function buildHtml(title: string, items: any[]): string {
    const itemsHtml = items.map(item => {
      const gameTitle = escapeHtml(item.title || '');
      const gameDesc = escapeHtml(item.description || '');
      const cover = item.cover || '';
      return `
        <div class="item">
          <img class="cover" src="${cover}" alt="封面" />
          <div class="info">
            <h2 class="title">${gameTitle}</h2>
            <p class="desc">${gameDesc}</p>
          </div>
        </div>`;
    }).join('\n');
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

  // 获取 Epic 免费游戏信息的核心逻辑
  async function fetchGames() {
    try {
      const response = await axios.get(config.apiUrl);
      const data = response.data;
      const games: any[] = Array.isArray(data) ? data : data.data || [];
      if (!games || games.length === 0) {
        logger.info('未获取到任何游戏数据');
        return null;
      }
      return games;
    } catch (error) {
      logger.error('拉取 Epic 免费游戏信息失败:', error);
      throw error;
    }
  }

  // 发送游戏信息的核心逻辑
  async function sendGames(games: any[], session?: any) {
    // 按是否当前免费分类
    const nowFree = games.filter(item => item.is_free_now);
    const upcoming = games.filter(item => !item.is_free_now);

    // 生成两个分类的 HTML
    const htmlNow = buildHtml('现在免费游戏', nowFree);
    const htmlUpcoming = buildHtml('即将免费游戏', upcoming);

    // 使用 puppeteer 渲染成图片
    const imageNow = await ctx.puppeteer.render(htmlNow);
    const imageUpcoming = await ctx.puppeteer.render(htmlUpcoming);

    // 如果有 session，直接回复；否则推送到配置的群
    if (session) {
      await session.send(imageNow);
      await session.send(imageUpcoming);
    } else if (config.groupId) {
      // 推送到指定 QQ 群
      for (const bot of ctx.bots) {
        try {
          await bot.sendMessage(config.groupId, imageNow);
          await bot.sendMessage(config.groupId, imageUpcoming);
        } catch (err) {
          logger.error('发送图片消息失败:', err);
        }
      }
    }
  }

  // 注册指令
  ctx.command('epic-freegame', '获取最新的 Epic 免费游戏')
    .action(async ({ session }) => {
      await session.send('正在获取 Epic 免费游戏信息，请稍候...');
      try {
        const games = await fetchGames();
        if (games) {
          await sendGames(games, session);
        } else {
          await session.send('未获取到任何游戏数据');
        }
      } catch (error) {
        logger.error('Epic 免费游戏任务执行出错:', error);
        await session.send('获取 Epic 免费游戏信息失败，请稍后重试');
      }
    });

  // 定时任务
  if (!config.cronTime || !config.groupId) {
    logger.info('未配置执行时间或群号，定时推送未启用，但指令功能可用。');
    return;
  }

  ctx.cron(config.cronTime, async () => {
    try {
      // 读取上一次的数据
      let lastData: any[] | null = null;
      if (fs.existsSync(cachePath)) {
        try {
          const content = fs.readFileSync(cachePath, 'utf-8');
          lastData = JSON.parse(content);
        } catch (err) {
          logger.warn('读取缓存文件失败，将视为首次运行');
        }
      }

      // 获取最新游戏数据
      const games = await fetchGames();
      if (!games) return;

      // 比较数据是否更新
      const newDataString = JSON.stringify(games);
      const lastDataString = lastData ? JSON.stringify(lastData) : null;
      if (lastDataString === newDataString) {
        logger.info('Epic 免费游戏数据未更新');
        return;
      }

      // 数据有更新，发送并更新缓存
      logger.info('Epic 免费游戏数据已更新，正在推送...');
      await sendGames(games);

      // 更新缓存
      try {
        fs.writeFileSync(cachePath, JSON.stringify(games, null, 2), 'utf-8');
      } catch (err) {
        logger.error('写入缓存文件失败:', err);
      }
    } catch (error) {
      logger.error('Epic 免费游戏定时任务执行出错:', error);
    }
  });
}
