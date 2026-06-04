# Microsoft 365 E5 续订模块

通过 OAuth **登录授权**拿到 `refresh_token`，再让 Cloud Reminder 定期用它换取 access token、调用一批只读 Microsoft Graph 接口来「模拟活跃」，从而保活 **Microsoft 365 E5 开发者订阅**（微软按账户是否在调用 API 判断是否为活跃开发者）。

本模块只做**核心 API 调用**；调度、统计与通知由 Cloud Reminder 负责。

---

## 一、注册 Azure 应用 — 拿 Client ID

1. 用你的 E5 管理员账号登录 [Azure 门户](https://portal.azure.com) → **Microsoft Entra ID（Azure AD）** → **应用注册** → **新注册**。
2. 名称随意；**受支持的账户类型**选「**任何组织目录中的账户（多租户）**」。
3. **重定向 URI**：平台选「**Web**」，填你的 Cloud Reminder 回调地址：
   ```
   https://你的-Cloud-Reminder-地址/api/e5/callback
   ```
   （编辑 E5 自动化时，登录卡片里会显示这一串，直接复制即可。）
4. 注册后记下「**应用程序(客户端) ID**」——即 **Client ID**。
5. **API 权限 → 添加权限 → Microsoft Graph → 委派的权限**，勾选（够用即可）：
   `offline_access`、`User.Read`、`User.Read.All`、`Files.Read.All`、`Mail.Read`、`MailboxSettings.Read`、`Directory.Read.All`、`Sites.Read.All`，然后点「**授予管理员同意**」。
6. **（可选，但更稳）证书和密码 → 新建客户端密码 → 复制「值」**——即 **Client Secret**。
   - 建了就在登录时一起填（机密客户端）；不建则留空，本模块会用 **PKCE** 完成授权（公共客户端）。

---

## 二、获取 Refresh Token

### 方式 A · 网页登录授权（推荐，无需命令行）

1. 在 Cloud Reminder 新建自动化 → 选「**Microsoft 365 E5 续订**」。
2. 顶部「微软账号登录授权」卡片里：填好 **Client ID**（和 **Client Secret**，若创建了）→ 输入**微软账号** → 点「**用微软账号登录**」。
3. 弹出微软登录页 → 登录并同意授权 → 窗口自动关闭，**Refresh Token 已自动填好**。保存即可。

> 前提：第一步的「重定向 URI」已填入本站的 `…/api/e5/callback`（登录卡片里有现成地址）。

### 方式 B · 用 rclone 手动获取（备选）

```bash
rclone authorize "onedrive" "<Client ID>" "<Client Secret>"
# 公共客户端没有 secret 时：rclone authorize "onedrive" "<Client ID>"
```
浏览器登录授权后，命令行输出 JSON 里的 `"refresh_token":"..."` 即是。手动粘进 **Refresh Token** 字段。

---

## 三、在 Cloud Reminder 里配置

| 字段 | 说明 |
| --- | --- |
| **Client ID** | 第一步的「应用程序(客户端) ID」 |
| **Client Secret** | 创建了就填；公共客户端留空 |
| **Refresh Token** | 方式 A 自动填 / 方式 B 手动粘 |
| **租户** | 默认 `common`，一般不用改 |

- 运行计划建议**每天 1–4 次**（如 `0 */8 * * *` 每 8 小时）。
- 「**结果通知**」选一个渠道（Telegram / Bark / 邮箱），用于失败告警。

---

## 四、统计与通知

- 卡片实时显示：**登录成功 / 失败**、本次「调用成功 / 失败」次数、**累计**成功 / 失败次数。
- 每次运行都会**自动保存轮换后的新 refresh_token**，确保长期不过期。
- **连续失败告警**：仅当持续失败（登录失败，或所有接口都失败）**超过 10 分钟**时，才通过通知渠道推送——偶发的单次失败不会打扰你；恢复成功后自动清除。

## 说明

- 保活成功率取决于微软策略；调用本身即产生活跃记录，部分接口因权限不足返回 4xx 属正常，不影响保活。
- refresh_token 为 90 天滚动有效：只要保活任务持续运行（每次自动轮换续期），即可长期有效；若长期停用导致过期，重新登录授权即可。
