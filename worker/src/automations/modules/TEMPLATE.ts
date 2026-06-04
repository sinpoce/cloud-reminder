// ─────────────────────────────────────────────────────────────────────────────
// 自定义自动化模块模板 / Custom automation module template
//
// 用法：
//   1. 复制本文件为 my-module.ts
//   2. 改 key / label / fields / run（key 必须唯一）
//   3. 在 ../registry.ts 里 import 并注册它
//   4. 重新部署（npm run deploy）—— 之后即可在「自动化」里直接使用
//
// 说明：Cloudflare Workers 禁止运行字符串代码（eval/new Function），所以模块
// 必须是真实的代码文件，而不是数据库里的文本。这样也更安全、可类型检查。
// ─────────────────────────────────────────────────────────────────────────────
import type { AutomationModule } from "../module";

const myModule: AutomationModule = {
  key: "my_module", // 唯一 id，会存为 automation.type
  label: "我的模块",
  description: "描述这个模块做什么。",
  icon: "puzzle", // 可选：globe / activity / puzzle / bell …（仅作图标提示）
  // fields 会在控制台自动渲染为表单；secret: true 的字段读取时会脱敏。
  fields: [
    { key: "api_key", label: "API Key", required: true, secret: true, placeholder: "..." },
    { key: "target", label: "目标", placeholder: "https://..." },
  ],

  // 任务本身。可用 await / fetch；请勿抛出异常 —— 失败时返回 failed 结果。
  async run(ctx) {
    const target = String(ctx.config.target ?? "");
    ctx.log(`开始处理 ${target}`);

    // …在这里实现你的逻辑，例如调用某个 API…
    // const res = await fetch(target, { headers: { Authorization: `Bearer ${ctx.config.api_key}` } });

    return {
      status: "success", // "success" | "partial" | "failed"
      summary: "完成", // 一句话结果（会记入运行记录，并用于通知）
      items: [
        // 可选：逐项结果，会显示在「运行结果」里
        { item: target || "示例", action: "ok", detail: "处理成功" },
      ],
    };
  },

  // 可选：实现后控制台会出现「测试连接」按钮。
  async test(ctx) {
    return { ok: !!ctx.config.api_key, detail: ctx.config.api_key ? "凭据已填写" : "未填写凭据" };
  },
};

export default myModule;
