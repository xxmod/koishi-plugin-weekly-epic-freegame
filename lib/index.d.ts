import { Context, Schema } from 'koishi';
declare module 'koishi' {
    interface Context {
        cron(input: string, callback: () => void): () => void;
        puppeteer: {
            render(content: string): Promise<string>;
        };
    }
}
export declare const name = "koishi-plugin-weekly-epic-freegame";
export declare const using: readonly ["cron", "puppeteer"];
export interface Config {
    /** Epic 免费游戏 API 地址 */
    apiUrl: string;
    /** Cron 表达式,定时任务执行时间 */
    cronTime: string;
    /** 推送的QQ群号 */
    groupId: string;
}
export declare const schema: Schema<Config>;
export declare function apply(ctx: Context, config: Config): void;
