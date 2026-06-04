# Microsoft 365 E5 续订模块

通过 OAuth **登录授权**拿到 `refresh_token`，再让 Cloud Reminder 定期用它换取 access token、调用一批只读 Microsoft Graph 接口来「模拟活跃」，从而保活 **Microsoft 365 E5 开发者订阅**（微软按账户是否在调用 API 判断是否为活跃开发者）。

本模块只做**核心 API 调用**；调度、统计与通知由 Cloud Reminder 负责。

---

## 一、注册 Azure 应用 — 拿 Client ID / Client Secret

1. 用你的 E5 管理员账号登录 [Azure 门户](https://portal.azure.com) → **Microsoft Entra ID（Azure AD）** → **应用注册** → **新注册**。
2. 名称随意；**受支持的账户类型**选「**任何组织目录中的账户（多租户）**」；**重定向 URI** 选「公共客户端/本机」并填 `http://localhost:53682/`（rclone 授权用）。注册。
3. 记下「**应用程序(客户端) ID**」——即 **Client ID**。
4. **API 权限 → 添加权限 → Microsoft Graph → 委派的权限**，勾选（够用即可）：
   `offline_access`、`User.Read`、`User.Read.All`、`Files.Read.All`、`Files.ReadWrite.All`、`Mail.Read`、`Mail.ReadWrite`、`MailboxSettings.Read`、`Directory.Read.All`、`Sites.Read.All`。
   添加后点「**授予管理员同意**」。
5. （机密客户端可选）**证书和密码 → 新建客户端密码 → 复制「值」**——即 **Client Secret**。公共客户端可不建、留空。

## 二、登录授权 — 拿 Refresh Token（核心：登录调用方式）

用 [rclone](https://rclone.org/downloads/)（任意系统）在命令行执行：

```bash
rclone authorize "onedrive" "<Client ID>" "<Client Secret>"
# 公共客户端没有 secret 时：rclone authorize "onedrive" "<Client ID>"
```

它会自动打开浏览器 → 用你的 **E5 账号登录并同意授权** → 命令行随即输出一段 JSON，其中的 `"refresh_token":"..."` 就是要用的 **Refresh Token**。

> 这一步就是「登录调用的方式」：你本人登录授权**一次**，拿到长期有效（90 天滚动）的 refresh_token；之后模块用它自动登录、调用，无需再交互。

## 三、在 Cloud Reminder 里配置

新建自动化 → 选「**Microsoft 365 E5 续订**」：

| 字段 | 说明 |
| --- | --- |
| **Client ID** | 第一步的「应用程序(客户端) ID」 |
| **Client Secret** | 机密客户端填；公共客户端留空 |
| **Refresh Token** | 第二步拿到的 refresh_token |
| **租户** | 默认 `common`，一般不用改 |

- 运行计划建议**每天 1–4 次**（如 `0 */8 * * *` 每 8 小时）。
- 「**结果通知**」选一个渠道（Telegram / Bark / 邮箱等），用于失败告警。
- 保存后点「**测试连接**」验证登录、点「**立即运行**」跑一次。

## 四、统计与通知

- 卡片实时显示：**登录成功 / 失败**、本次「调用成功 / 失败」次数、**累计**成功 / 失败次数。
- 每次运行都会**自动保存轮换后的新 refresh_token**，确保长期不过期。
- **连续失败告警**：仅当持续失败（登录失败，或所有接口都失败）**超过 10 分钟**时，才通过通知渠道推送——偶发的单次失败不会打扰你；恢复成功后自动清除。

## 说明

- 保活成功率取决于微软策略；调用本身即产生活跃记录，部分接口因权限不足返回 4xx 属正常，不影响保活。
- refresh_token 为 90 天滚动有效：只要保活任务持续运行（每次自动轮换续期），即可长期有效；若长期停用导致过期，重做第二步即可。
