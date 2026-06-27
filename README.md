# ☁️ Cloud Reminder

<sub>云端提醒 · 部署在 Cloudflare Workers 上的自托管提醒 & 自动化服务</sub>

> A self-hosted **reminder & automation** service that runs entirely on **Cloudflare Workers** (D1 + Cron). Schedule pushes to **Telegram / WeCom / Feishu / Email / Bark / Webhook**, run built-in automation modules (including DigitalPlat domain renewal), and even write custom code modules right in your browser. Lightweight, edge-native, near-zero cost — one-click deploy.
>
> <sub>自托管的提醒与自动化服务，全程运行在 Cloudflare Workers（D1 + Cron）。按计划推送到 Telegram / 企业微信 / 飞书 / 邮箱 / Bark / Webhook，内置自动化模块（含 DigitalPlat 域名续订），还能在浏览器里直接写自定义代码模块。轻量、边缘原生、近乎零成本，一键部署。</sub>

<p align="center">
  <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/sinpoce/cloud-reminder">
    <img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare" />
  </a>
</p>

<p align="center">
  <em>One Worker: API · per-minute Cron · D1 database · built-in React console</em><br>
  <sub>单个 Worker：API · 每分钟 Cron · D1 数据库 · 内置 React 控制台</sub>
</p>

---

## ✨ Features

<sub>功能特性</sub>

- 🔔 **Three trigger types** — one-time (exact moment), **interval repeat** (every N minutes/hours/days/weeks/months/years, e.g. every 180 days or yearly), and **scheduled repeat** (pick frequency / weekday / time visually — no Cron required). <br><sub>三种触发方式 — 一次性、间隔重复（每 N 分钟/时/天/周/月/年）、定时重复（可视化选频率/星期/时间，无需手写 Cron）。</sub>
- 🎛 **Custom repeat cycles** — one-click presets or a custom "every N units"; the scheduled mode has a visual builder, with a raw Cron field still available in advanced mode. <br><sub>自定义周期 — 预设一键选择或自定义「每 N 个单位」；定时模式提供可视化构建器，高级模式仍可写 Cron。</sub>
- 🧪 **Test with the real payload** — hit "Test send" while editing a reminder to push your **actual title/body** to the selected channels immediately, with per-channel success/failure reasons. <br><sub>测试发送真实内容 — 编辑时点「测试发送」，立即把真实标题/内容推到所选渠道，并显示每个渠道的成功/失败原因。</sub>
- 🌍 **Time-zone aware** — every reminder carries its own IANA time zone; scheduling is computed precisely on the Worker (month/year repeats handle end-of-month days automatically). <br><sub>时区感知 — 每条提醒可单独设时区，调度在 Worker 上按时区精确计算（按月/年重复自动处理月末日）。</sub>
- 🌗 **Light / dark theme** — light by default, one-click dark, choice remembered locally. <br><sub>浅色 / 深色主题 — 默认浅色，一键切换深色，选择本地记忆。</sub>
- 📡 **Multi-channel push** — Telegram, WeCom, Feishu (with signing), **Email (Resend / SMTP)**, **Bark (iOS)**, and a generic Webhook; each channel has a **customizable message template**. <br><sub>多渠道推送 — Telegram、企业微信、飞书（支持签名）、邮箱（Resend / SMTP）、Bark（iOS）、通用 Webhook；每个渠道可自定义消息模板。</sub>
- 🔌 **Channel connectivity test** — send a test message straight from a channel card to verify the token / webhook works. <br><sub>渠道连通性测试 — 渠道卡片一键发送测试消息，快速验证 Token / Webhook 是否可用。</sub>
- 🤖 **Automation platform** — scheduled edge tasks built as **modules**: ships with "DigitalPlat domain renewal" and "HTTP health check"; write **custom code modules in the browser** (run in a QuickJS WASM sandbox) or as typed files; results can be pushed to your channels. <br><sub>自动化模块平台 — 按计划运行的边缘任务，模块化：内置「DigitalPlat 域名续订」「HTTP 健康检查」；可在浏览器里写自定义代码模块（QuickJS WASM 沙箱），也可写文件式模块；结果可推送到通知渠道。</sub>
- 📊 **Dashboard & delivery log** — stats, upcoming triggers, and per-push success/failure history. <br><sub>概览看板 / 发送记录 — 统计、即将触发、每次推送的成功/失败日志。</sub>
- 🎨 **Polished UI** — glassmorphism, responsive, works on desktop and mobile. <br><sub>专业 UI — 玻璃拟态、响应式，桌面与移动端均可用。</sub>
- 🔐 **Single-admin auth** — default password `admin` (zero-config login); PBKDF2-hashed in D1, brute-force lockout (10 wrong tries → 30-min lock), auto-generated session key. <br><sub>单管理员鉴权 — 默认密码 `admin`（零配置登录），PBKDF2 哈希存于 D1，登录防暴破（错 10 次锁 30 分钟），会话密钥自动生成。</sub>
- ⚡ **Edge-native** — D1 (SQLite) storage, a Cron Trigger dispatching every minute, no server to run. <br><sub>边缘原生 — D1（SQLite）存储，Cron 每分钟派发，无需自建服务器。</sub>

> 🔑 **Default login password: `admin`** — change it **immediately** after first login under *Settings → Change admin password* (your instance is publicly reachable). <br><sub>🔑 默认登录密码 `admin` —— 登录后请立刻在「设置 → 修改管理员密码」里改掉（公网可访问）。</sub>

---

## 📸 Screenshots

<sub>界面预览</sub>

| Login | Dashboard |
| :---: | :---: |
| ![Login](docs/screenshots/login.png) | ![Dashboard](docs/screenshots/dashboard.png) |

| Reminders | Channels |
| :---: | :---: |
| ![Reminders](docs/screenshots/reminders.png) | ![Channels](docs/screenshots/channels.png) |

---

## 🧱 Architecture

<sub>架构</sub>

```
                         ┌──────────────────────────────────────────────┐
   Browser ─HTTPS/JWT─▶  │         Cloudflare Worker (single service)    │
                         │                                              │
                         │  Static Assets  →  React console (web/dist)  │
                         │  Hono API       →  /api/*                    │
                         │  ⏰ Cron "* * * * *" → dispatch due items/min │
                         │                          │                   │
                         │   ┌──────────────┬───────┼───────┬─────────┐ │
                         │   ▼              ▼       ▼       ▼         ▼ │
                         │ Telegram       WeCom   Feishu  Email   Webhook│
                         │                          │                   │
                         │                          ▼                   │
                         │                 D1 (SQLite) reminders/...     │
                         └──────────────────────────────────────────────┘
```

**One Worker does everything**: it serves the frontend via Workers Static Assets, handles the API with Hono, and dispatches due reminders/automations every minute via Cron. The frontend and API are same-origin, so there is no CORS to configure. (For local development the frontend and backend run separately — see below.)

<sub>一个 Worker 搞定全部：用 Static Assets 托管前端、Hono 处理 API、Cron 每分钟派发。前端与 API 同源，无需 CORS（本地开发时前后端分开跑，见下文）。</sub>

---

## 📁 Project layout

<sub>目录结构</sub>

```
cloud-reminder/
├── wrangler.jsonc          # unified deploy config (Worker + Static Assets + D1 + Cron); used by the button
├── worker/                 # Cloudflare Worker: API + Cron + channels + automations
│   ├── src/
│   │   ├── index.ts        # Hono app + scheduled() + static-asset fallback
│   │   ├── auth.ts         # JWT, password hashing, auth middleware
│   │   ├── db.ts / db-init.ts   # D1 access / auto-create tables on first run
│   │   ├── schedule.ts     # time-zone-aware Cron / interval math
│   │   ├── channels/       # telegram / wechat / feishu / email / webhook
│   │   ├── automations/    # module platform (digitalplat / httpcheck / custom-code sandbox)
│   │   └── routes/         # reminders / channels / automations / settings / meta
│   ├── schema.sql · migrations/
│   └── wrangler.toml       # local dev / Worker-API-only
└── web/                    # React + Vite + Tailwind console (built output served by the Worker)
    └── src/{pages,components,lib}
```

---

## 🚀 Deploy

<sub>部署 — 两种方式：A 一键部署（最简单）或 B 手动部署</sub>

There are two ways: **A. One-click deploy (easiest)** or **B. Manual deploy**.

### Option A · One-click deploy to Cloudflare (recommended)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sinpoce/cloud-reminder)

Click the button — Cloudflare **copies this repo into your own GitHub account** (a standalone repo — note it is a **content copy, not a fork**), **creates a D1 database**, builds the frontend, and deploys **one Worker** (serving the console, the API, and the per-minute Cron). Tables are **created automatically** on first visit, so no manual migration is needed.

> <sub>点上面的按钮，Cloudflare 会把本仓库复制一份到你的 GitHub 账户（独立仓库，是内容副本，不是 fork）→ 自动创建 D1 → 构建前端 → 部署为一个 Worker（同时托管控制台、API、每分钟 Cron）。数据库表首次访问自动创建，无需迁移。</sub>

> 🔄 **Updating later**: because it is a standalone copy (not a fork), it does **not** auto-sync when this repo releases a new version. See **"🔄 Update to the latest version"** below; if you want one-click web updates, use the **Fork method** described there. <br><sub>后续更新：因为是独立副本（非 fork），主仓库发新版不会自动同步。更新见下方「🔄 更新到最新版本」；想要网页一键更新，改用其中的 Fork 方式。</sub>

**Works with zero config**: the default login password is **`admin`**, and the session (JWT) key is auto-generated on first run and stored in D1 — no secret to set before you can log in.

> ⚠️ **Change the password immediately after your first login, under *Settings*.** The default `admin` is for out-of-the-box use only and your instance is public. To customize, set optional secrets in *Worker → Settings → Variables*: `ADMIN_PASSWORD` (override the default) and `JWT_SECRET` (override the auto-generated session key). <br><sub>⚠️ 首次登录后请立刻在「设置」里改密码！默认 `admin` 仅为开箱即用、公网可访问。可在 Worker → Settings → Variables 设置可选 Secret：`ADMIN_PASSWORD`、`JWT_SECRET`。</sub>

### Option B · Manual deploy (single Worker, same result as one-click)

Prerequisites: a free [Cloudflare account](https://dash.cloudflare.com/sign-up), **Node 18+**, and Wrangler (`npm i -g wrangler` then `wrangler login` — browser auth, no API token needed).

<sub>前置：免费 Cloudflare 账号、Node 18+、Wrangler（`npm i -g wrangler` 后 `wrangler login` 浏览器授权）。</sub>

Run from the **repo root**:

```bash
# 1) Create the D1 database, then paste the returned database_id into d1_databases in the root wrangler.jsonc
wrangler d1 create cloud_reminder

# 2) Install deps and deploy (builds the frontend + deploys the unified Worker: console + API + per-minute Cron)
npm --prefix worker install && npm --prefix web install
wrangler deploy            # uses the root wrangler.jsonc

# 3) (optional) Override the default password / session key; both work without this (password "admin", JWT auto-generated)
wrangler secret put ADMIN_PASSWORD
wrangler secret put JWT_SECRET
```

Open `https://cloud-reminder.<your-subdomain>.workers.dev`:

- tables are **created on first visit**, no migration needed;
- log in with the default password **`admin`**, then **change it ASAP** under *Settings*.

> The frontend is bundled same-origin via **Workers Static Assets** — no separate Pages deploy, no CORS / API URL to configure. The Cron (`* * * * *`) is already set in `wrangler.jsonc`. <br><sub>前端以 Workers Static Assets 与 Worker 同源打包 —— 无需单独部署 Pages、无需配置 CORS。Cron 已在 wrangler.jsonc 中配置。</sub>

---

## 🔌 Configure notification channels

<sub>配置通知渠道 — 登录后进入「通知渠道 → 添加渠道」，按类型填写</sub>

After logging in, go to **Channels → Add channel** and fill in by type:

### Telegram
1. Send `/newbot` to [@BotFather](https://t.me/BotFather) to get a **Bot Token**.
2. Send your bot a message, then open `https://api.telegram.org/bot<token>/getUpdates` and find `chat.id`.
3. Enter the **Bot Token** and **Chat ID**.

### WeCom (企业微信)
1. In a WeCom group, "**Add group bot**".
2. Copy its **Webhook URL** and paste it into "Webhook URL".

### Feishu (飞书)
1. In a Feishu group: "**Settings → Group bots → Add custom bot**".
2. Copy the **Webhook URL**; if "signature verification" is on, put the secret into **Signing Secret**.

### Email (Resend or SMTP)
Choose one delivery method:
- **Resend API** (easiest): create an **API Key** at [resend.com](https://resend.com); the sender must be a verified domain (use `onboarding@resend.dev` for testing).
- **SMTP**: your provider's SMTP server, e.g. QQ `smtp.qq.com:465`, Gmail `smtp.gmail.com:465`, 163 `smtp.163.com:465`; the **password is an "app/authorization code", not your login password**. Port **465 = SSL, 587 = STARTTLS** (Cloudflare Workers does not support port 25).

> 📧 Emails use a built-in branded HTML template (card layout with event / body / time), editable per channel under "Email template"; placeholders `{{title}} {{body}} {{time}}`. <br><sub>📧 邮件用内置 HTML 模板（卡片式，含事件/内容/时间），可在渠道「邮件模板」里改；占位符 {{title}} {{body}} {{time}}。</sub>

### Bark (iOS push)
1. Install the **Bark** iOS app and **paste its full "push URL"** (e.g. `https://api.day.app/xxxxxx`) into **Bark URL / Device Key** — server and device key are detected automatically.
2. You can also enter just the trailing Device Key; self-hosted Bark servers work too, with optional sound and group.

### Generic Webhook
`POST` a JSON body `{ "title", "body", "timestamp" }` to your URL. Works with Discord, Slack, n8n, your own service, etc.

> Click "**Test**" on a channel card to verify connectivity instantly. <br><sub>添加后点卡片上的「测试」即可立即验证连通性。</sub>
>
> 💬 **Message templates**: every channel has a built-in default `🔔 {{title}}` / `{{body}}` / `🕐 {{time}}`, editable per channel; clear it to fall back to the default. Placeholders: `{{title}}`, `{{body}}`, `{{time}}` (in the reminder's time zone). <br><sub>💬 消息模板：每个渠道有内置默认模板，可自行修改，清空则回退默认。占位符：{{title}} 标题、{{body}} 内容、{{time}} 触发时间（按提醒时区）。</sub>

---

## 🕒 How reminders & scheduling work

<sub>提醒与调度是怎么工作的</sub>

- All times are stored in the database as **UTC seconds**; each reminder carries its own IANA time zone.
- The Worker's `scheduled()` runs once a minute:
  1. query reminders where `enabled = 1 and next_run <= now`;
  2. send concurrently to all of that reminder's channels and write a `deliveries` log;
  3. **one-time** reminders end after sending (`next_run = NULL`); **repeat / Cron** reminders recompute their next run in their time zone.

<sub>所有时间以 UTC 秒存储，每条提醒带自己的时区；Worker 每分钟跑一次 scheduled()：查到期项 → 并发发往各渠道并记日志 → 一次性发完结束，周期/Cron 按时区算下次。</sub>

### Custom repeat rules

**① Interval repeat** — the most intuitive "every so often": <br><sub>① 周期重复 — 最直观的「每隔多久一次」：</sub>

- From your **start time**, fire every "`N` × `unit`"; units are **minute / hour / day / week / month / year**, `N` a positive integer.
- Presets: daily, weekly, biweekly, monthly, quarterly, **every 180 days**, semi-annually, **yearly**; or enter any value under "custom interval", e.g. `every 45 days`, `every 3 months`, `every 2 years`.
- Triggers align to the **whole minute** (Cron checks each minute).
- "Day / week" keep the **local wall-clock time** in the chosen zone (no drift across DST).
- "Month / year" advance by calendar: if the start day is the **29th–31st**, months that are too short fall back to the **last day of that month** (e.g. 1/31 → 2/28, 6/30).

### Scheduled repeat (calendar-based)

Best for "daily / certain weekdays / certain day-of-month" rules — uses a **visual builder by default, no expression to write**. Pick frequency + weekday(s)/date + time and the UI shows a plain-language description (e.g. `Weekdays 09:00`). For more complex rules, switch to **Cron (advanced)** and write the 5 fields `min hour day month weekday` (`*` `,` `-` `/` supported; `0`/`7` both mean Sunday).

<sub>定时重复（按日历）：适合「每天/每周几/每月几号」，默认用可视化构建器；复杂规则可切到 Cron 高级模式手写 5 段表达式。</sub>

> Rule of thumb: use **interval repeat** for fixed gaps (every N days/months/years); use **scheduled repeat** for calendar alignment (weekdays, day-of-month). <br><sub>经验法则：固定间隔用「间隔重复」，日历对齐用「定时重复」。</sub>

### 🧪 Test send

While editing a reminder, click "**Test send**" to push your **actual title and body** to the selected channels right away (no need to save first), returning per-channel success/failure. The ⚡ button in the reminder list sends the real content too.

<sub>测试发送：编辑时点「测试发送」即可把真实标题/内容立即推到所选渠道（无需先保存），并返回每渠道结果；列表里的 ⚡ 按钮同样发真实内容。</sub>

---

## 🤖 Automations (modular)

<sub>自动化（模块化）</sub>

**Automations** is a **module platform**: each capability is a **module**, and you create **scheduled instances** of a module that run on Cron at the edge. Two modules ship out of the box:

| Module | What it does |
| --- | --- |
| **DigitalPlat domain renewal** | When a domain has <120 days left, calls the DigitalPlat API to free-renew it for 1 year. <br><sub>到期前（剩余少于 120 天）自动调用 API 免费续订 1 年。</sub> |
| **HTTP health check** | Periodically requests a URL; flags bad status / timeout / missing keyword as unhealthy (can alert). <br><sub>定时请求 URL，状态码异常/超时/缺关键字即判异常，可告警。</sub> |

Each automation = a chosen module + form config + run schedule (visual Cron) + result notification channel. Runs are written to a "run history" and notify you via the selected channel on result/failure; sensitive module fields (e.g. tokens) are echoed back masked.

<sub>每个自动化 = 模块 + 表单配置 + 运行计划（可视化 Cron）+ 结果通知渠道；运行写入「运行记录」，有结果/失败时通知你；敏感字段脱敏回显。</sub>

### ✍️ A. Write a custom module in the browser (no deploy)

For users who can code: New automation → choose "**Custom code**" → write JS in the editor, save, done. <br><sub>面向会写代码的用户：新建自动化 → 选「自定义代码」→ 写 JS 保存即用。</sub>

- Runs in a **QuickJS (compiled to WASM) sandbox** — Workers forbid `eval`/runtime-compiled WASM, but the QuickJS engine is compiled at build time and *interprets* your JS string at runtime, which is both allowed and sandboxed.
- Available inside: `config` (your settings), `console.log()`, `await fetchJson/fetchText/httpRequest(url, opts)`, `await sleep(ms)`.
- Return `{ status, summary, items:[{item,action,detail}] }` or a string.
- Limits: ≤15 s per run (anti-loop), 64 MB; outbound only via the APIs above. Config keys containing `token/secret/key/password` are stored masked.

<sub>运行在 QuickJS（WASM）沙箱里（Workers 禁 eval/运行时编译 WASM，QuickJS 在构建时编译、运行时解释你的 JS）；沙箱内可用 config、console.log、fetchJson/fetchText/httpRequest、sleep；单次 ≤15 秒、64MB；含 token/secret/key/password 的配置脱敏保存。</sub>

```js
// Example: monitor a GitHub repo's star count
const repo = await fetchJson("https://api.github.com/repos/" + config.repo);
return {
  status: "success",
  summary: config.repo + " ★ " + repo.stargazers_count,
  items: [{ item: config.repo, action: "ok", detail: "stars " + repo.stargazers_count }],
};
```

> ⚙️ The QuickJS engine ships as WASM with the Worker (vendored to `worker/src/automations/quickjs.wasm`, ~0.5 MB). After upgrading quickjs-emscripten, run `npm run vendor:wasm` to recopy it. <br><sub>⚙️ QuickJS 引擎以 WASM 随 Worker 部署（已 vendored，约 0.5MB）；升级后用 npm run vendor:wasm 重拷。</sub>

### ✍️ B. File-based modules (how built-ins are written, type-safe)

1. Copy [`worker/src/automations/modules/TEMPLATE.ts`](worker/src/automations/modules/TEMPLATE.ts) to `my-module.ts`.
2. Implement the interface (`key` / `label` / `fields` / `run`, optional `test`):
   ```ts
   const myModule: AutomationModule = {
     key: "my_module",
     label: "My module",
     description: "…",
     fields: [{ key: "api_key", label: "API Key", required: true, secret: true }],
     async run(ctx) {
       // ctx.config holds the user's form values; ctx.log() records logs
       const res = await fetch("https://api.example.com", {
         headers: { Authorization: `Bearer ${ctx.config.api_key}` },
       });
       return { status: res.ok ? "success" : "failed", summary: `HTTP ${res.status}`, items: [] };
     },
   };
   export default myModule;
   ```
3. Import and register it in [`worker/src/automations/registry.ts`](worker/src/automations/registry.ts).
4. `npm run deploy` — the new module appears under "Automations → New automation".

The form declared by `fields` is rendered automatically by the console (incl. `secret` masking, `number`/`textarea` types) — no frontend changes needed. <br><sub>fields 声明的表单由控制台自动渲染（含脱敏、number/textarea 类型），无需改前端。</sub>

### DigitalPlat domain renewal · usage & notes

1. Create an API Token (like `dp_live_…`) at [dash.domain.digitalplat.org/dashboard/api/keys](https://dash.domain.digitalplat.org/dashboard/api/keys).
2. New automation → "DigitalPlat domain renewal" → enter the token, advance-renew days (default **120**), and a schedule (daily recommended).
3. "Test connection" verifies the token; "Run now" runs once with the window logic.

> 📌 **Renewal window (important)**: DigitalPlat free renewal only opens when **<120 days remain**; calls outside the window are rejected (500). So it renews only within **120 days** of expiry; domains not yet in the window show "X days left, not in the renewal window". Set it to run **daily** and it auto-renews for 1 year as soon as the window opens. <br><sub>📌 续订窗口（重要）：DigitalPlat 免费续费仅在「剩余少于 120 天」时开放，窗口外会被拒（500）。设为每天运行即可，窗口一开自动续 1 年。</sub>

> ⚠️ **Cloudflare bot protection**: DigitalPlat's API site has Cloudflare bot blocking; this module passes its UA-based challenge with a browser UA + client hints (verified working on the Worker). If it tightens later, the module **fails gracefully** rather than silently. <br><sub>⚠️ DigitalPlat 的 API 开了 Cloudflare Bot 拦截，本模块带浏览器 UA + 客户端提示头通过其挑战；若日后收紧会优雅报错而非静默失败。</sub>

### 🌗 Theme

The console defaults to **light mode**; click the top-right to switch to **dark mode**, remembered in the browser (`localStorage`). <br><sub>控制台默认浅色，右上角可切深色，选择记忆在本地。</sub>

---

## 🔄 Update to the latest version

<sub>更新到最新版本 — 分两件事：① 更新代码 ② 数据库迁移（仅新版新增表/字段时）</sub>

Updating is two things: **① update the code** (get new features) and **② database migration** (only when a new version adds tables/columns).

### ① Update the code

The idea: **get the repo that Cloudflare is connected to onto the latest code, and it rebuilds and redeploys automatically.** Pick the path matching how you deployed 👇

#### A · You used the one-click button (standalone copy repo)

The button created a **standalone copy repo** in your account (named like `cloud-reminder-xxxx`) that Cloudflare auto-builds. It is **not a fork**, so GitHub's "Sync fork" doesn't apply — pull upstream from the command line:

```bash
# Replace <you>/<your-copy-repo> with the repo in your account
git clone https://github.com/<you>/<your-copy-repo>.git
cd <your-copy-repo>
git remote add upstream https://github.com/sinpoce/cloud-reminder.git
git fetch upstream
git reset --hard upstream/main      # overwrite with the official latest (cleanest if you never edited the repo)
git push --force origin main        # after pushing, Cloudflare rebuilds and ships (~1–3 min)
```

> Your channels / reminders live in Cloudflare **D1**; updating only the code does not touch data. If you edited the repo (e.g. added a custom module), use `git merge upstream/main` instead of `reset --hard` and resolve conflicts. <br><sub>你的数据都在 D1 里，只更新代码不动数据；若你改过仓库代码，把 reset --hard 换成 git merge upstream/main 并手动处理冲突。</sub>

#### B · Want one-click web updates later? Use a Fork (recommended)

If you haven't set up yet (or are willing to redo it once), a **Fork** is the easiest — future updates are a single click on the web, no command line.

1. Click **Fork** at the top right of this repo (a **real fork**, linked to upstream).
2. Cloudflare Dashboard → **Workers & Pages → Create → Workers → Connect to Git**, select your fork; Cloudflare reads the root [`wrangler.jsonc`](wrangler.jsonc) and auto-creates D1, the per-minute Cron, and the build command.
3. When a new version ships, open your fork → **"Sync fork" → Update branch**; Cloudflare detects the update and **redeploys automatically**. All on the web.

<sub>想以后网页一键更新就用 Fork：Fork 本仓库 → Cloudflare 连接你的 fork（自动建 D1、设 Cron）→ 以后点「Sync fork」即自动重新部署。</sub>

#### C · You deployed locally with `wrangler deploy`

```bash
git pull
npm --prefix worker install && npm --prefix web install
wrangler deploy
```

### ② Database migration (only when a new version adds tables/columns)

**Fresh deploys need nothing** (`schema.sql` is current; tables auto-create on first visit). Upgrading from an older version, run the migrations you need against the live DB:

```bash
cd worker
wrangler d1 execute cloud_reminder --remote --file=./migrations/0001_add_interval.sql       # interval repeat
wrangler d1 execute cloud_reminder --remote --file=./migrations/0002_add_automations.sql    # automations
wrangler d1 execute cloud_reminder --remote --file=./migrations/0003_add_custom_modules.sql # custom code modules
wrangler d1 execute cloud_reminder --remote --file=./migrations/0004_add_settings.sql       # settings (password / default TZ)
```

> These migrations are idempotent (`IF NOT EXISTS`); re-running them is safe. <br><sub>这些迁移是幂等的（IF NOT EXISTS），重复执行安全。</sub>

---

## 💻 Local development

<sub>本地开发 — 前后端分开跑；生产是同一个 Worker 一起部署</sub>

```bash
# Terminal A — start the Worker (local D1, tables auto-create)
cd worker
cp .dev.vars.example .dev.vars     # optional: local ADMIN_PASSWORD / JWT_SECRET
npm install
npm run dev                        # http://localhost:8787

# Terminal B — start the console
cd web
npm install
npm run dev                        # http://localhost:5173 (/api proxied to 8787)
```

Open http://localhost:5173 and log in with **`admin`** (or the password in `.dev.vars`).

> Want to test Cron dispatch locally? Run `curl "http://localhost:8787/cdn-cgi/handler/scheduled"` to trigger one dispatch. <br><sub>想本地验证 Cron 派发？运行上面的 curl 手动触发一次调度。</sub>

---

## 🔐 Security notes

<sub>安全说明</sub>

- **The default password is `admin`** — change it under *Settings* right after deploying (stored as a PBKDF2 hash in D1; plaintext is never persisted). The session JWT key is auto-generated on first run and stored in D1, or override it with the `ADMIN_PASSWORD` / `JWT_SECRET` secrets. <br><sub>默认密码 `admin`，部署后请第一时间在「设置」里改（PBKDF2 哈希存于 D1，明文不落库）；会话密钥首次运行自动生成，也可用 Secret 覆盖。</sub>
- Sensitive fields — channel tokens/webhooks, custom-module secrets — are stored in your own D1 and returned **masked** by read endpoints. <br><sub>渠道 Token/Webhook、模块密钥等敏感字段存在你自己的 D1 中，读取接口脱敏返回。</sub>
- In the unified deploy the console and API are **same-origin**, so there is no cross-origin; `ALLOWED_ORIGINS="*"` is therefore safe (only tighten it if you split the frontend onto another domain). <br><sub>统一部署下控制台与 API 同源，不涉及跨域，ALLOWED_ORIGINS="*" 因此是安全的（仅当前端拆到别的域名时才需收紧）。</sub>
- Custom code modules run in the **QuickJS WASM sandbox** (15 s / 64 MB caps, restricted APIs) and only you can create them — a single-admin model suited to personal / small-team self-hosting. <br><sub>自定义代码模块运行在 QuickJS WASM 沙箱里（15秒/64MB、受限 API），且只有你能创建 —— 单管理员模型，适合个人/小团队自托管。</sub>

<p align="center"><sub>Built for the edge · a single Cloudflare Worker (Static Assets + D1 + Cron)</sub></p>
<p align="center"><b>SINPOCE</b></p>
