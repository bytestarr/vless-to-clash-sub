# vless-to-clash-sub

[English README](./README.en.md)

[![Stargazers over time](https://starchart.cc/bytestarr/vless-to-clash-sub.svg?variant=adaptive)](https://starchart.cc/bytestarr/vless-to-clash-sub)

## 关于

这是一个运行在 Cloudflare Workers 上的 VLESS 转 Clash / Mihomo 订阅生成器。它会从 Worker 环境变量中读取多个 `NODE_` 开头的 VLESS 节点链接，自动解析为 Clash / Mihomo 可用的 YAML 配置，并通过带访问密钥的订阅链接返回。

项目适合把多台 VPS、3x-ui / x-ui 面板生成的多个 VLESS 节点集中管理成一个订阅。节点、订阅密钥和规则都通过 Cloudflare 环境变量配置，不需要把敏感信息写入 GitHub 仓库。

## 功能

- 自动读取所有 `NODE_` 开头的环境变量作为 VLESS 节点。
- 按环境变量名称排序，保证订阅输出稳定。
- 支持 `tcp`、`ws`、`grpc` 传输方式。
- 支持常见 VLESS 参数：`type`、`security`、`flow`、`sni`、`fp`、`pbk`、`sid`、`path`、`host`、`alpn`、`serviceName`。
- 支持 Reality 节点，并输出 Clash Meta / Mihomo 兼容的 `reality-opts`。
- 节点名称优先使用 VLESS URL 的 hash，例如 `#LA-Reality`。
- 如果 URL 没有 hash，则使用环境变量名后缀作为节点名，例如 `NODE_LA` 会变成 `LA`。
- 支持通过 `SUB_NAME` 自定义订阅名称。
- 通过 `SUB_TOKEN` 保护订阅访问。
- `CUSTOM_RULES_Provider` 为空时不输出 `rule-providers`，只有填写后才启用。
- `CUSTOM_RULES` 为空时使用默认规则。
- 返回适合订阅使用的响应头。

## 项目结构

```text
.
|-- .env.example
|-- .gitignore
|-- README.md
|-- README.en.md
|-- package.json
|-- src/
|   `-- index.js
`-- wrangler.toml
```

## 环境变量

| 变量名 | 是否必填 | 说明 |
| --- | --- | --- |
| `SUB_TOKEN` | 是 | 访问订阅链接所需的长随机密钥。 |
| `SUB_NAME` | 否 | 订阅名称。未填写时默认为 `VLESS Subscription`。 |
| `NODE_*` | 是 | VLESS 节点链接。所有 `NODE_` 开头的变量都会被自动加入订阅。 |
| `CUSTOM_RULES_Provider` | 否 | 原始 YAML 内容，会放在 `rule-providers:` 下方。为空时不输出 `rule-providers`。 |
| `CUSTOM_RULES` | 否 | Clash rules 内容，一行一条规则。行首可以带 `-` 或 `*`。 |

示例：

```env
SUB_TOKEN=replace-with-a-long-random-token
SUB_NAME=My VLESS Subscription
NODE_LA=vless://uuid@example.com:443?type=tcp&security=reality&pbk=public-key&sid=short-id&sni=example.com&fp=chrome&flow=xtls-rprx-vision#LA-Reality
NODE_JP=vless://uuid@example.net:443?type=ws&security=tls&sni=example.net&host=example.net&path=%2Fws#JP-WS
CUSTOM_RULES_Provider=""
CUSTOM_RULES="- GEOSITE,category-ads-all,REJECT
- GEOIP,private,DIRECT
- GEOSITE,cn,DIRECT
- GEOIP,cn,DIRECT
- MATCH,Proxy"
```

## 订阅访问

Worker 只响应 `/clash` 路径，并要求查询参数中的 `token` 与 `SUB_TOKEN` 一致。

订阅链接格式：

```text
https://sub.example.com/clash?token=replace-with-a-long-random-token
```

路径不匹配或 token 错误时会返回 `403 Forbidden`。

## 订阅名称

设置 `SUB_NAME` 后，生成的 YAML 顶部会包含：

```yaml
name: "My VLESS Subscription"
```

同时响应头中也会包含订阅标题，方便部分客户端识别订阅名称。

如果不设置 `SUB_NAME`，默认名称为：

```text
VLESS Subscription
```

## 添加节点

在 Cloudflare Worker 的 Variables and Secrets 中添加新的环境变量即可。

变量名必须以 `NODE_` 开头：

```text
NODE_LA=vless://...
NODE_JP=vless://...
NODE_SG=vless://...
NODE_DE=vless://...
```

新增、删除或修改节点后，不需要改代码。下一次请求订阅时 Worker 会自动读取最新变量。

## 自定义 Rule Providers

`CUSTOM_RULES_Provider` 默认留空。为空时，生成的 YAML 不会包含 `rule-providers`。

只有当你填写 `CUSTOM_RULES_Provider` 时，Worker 才会输出 `rule-providers:`。

示例：

```yaml
reject:
  type: http
  behavior: domain
  url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/reject.txt"
  path: ./ruleset/reject.yaml
  interval: 86400

gfw:
  type: http
  behavior: domain
  url: "https://cdn.jsdelivr.net/gh/Loyalsoldier/clash-rules@release/gfw.txt"
  path: ./ruleset/gfw.yaml
  interval: 86400
```

## 自定义 Rules

`CUSTOM_RULES` 一行一条规则。

示例：

```text
- GEOSITE,category-ads-all,REJECT
- GEOIP,private,DIRECT
- GEOSITE,cn,DIRECT
- GEOIP,cn,DIRECT
- MATCH,Proxy
```

如果 `CUSTOM_RULES` 为空，会使用以上默认规则。

## 防止变量在部署后被清空

项目已在 `wrangler.toml` 中设置：

```toml
keep_vars = true
```

这个配置会让 Cloudflare/Wrangler 在部署时保留 Dashboard 中配置的变量，避免 GitHub 自动部署时把 Dashboard 里的变量覆盖为空。

请不要把真实的 `SUB_TOKEN`、`NODE_...` 或自定义域名写进 `wrangler.toml`、README 或任何会提交到 GitHub 的文件。

推荐变量类型：

| 变量名 | 推荐类型 |
| --- | --- |
| `SUB_TOKEN` | Secret |
| `NODE_*` | Secret |
| `SUB_NAME` | Text 或 Secret |
| `CUSTOM_RULES_Provider` | Text 或 Secret |
| `CUSTOM_RULES` | Text 或 Secret |

## 通过 Cloudflare 网页部署

推荐使用 Cloudflare Dashboard 网页部署和绑定 GitHub：

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages。
3. 选择 Create。
4. 选择 Import a repository 或 Connect to Git。
5. 连接包含本项目的 GitHub 仓库。
6. 选择生产分支，通常是 `main`。
7. 项目名称可以使用 `vless-to-clash-sub`，也可以自定义。
8. 如果 Cloudflare 要求填写入口文件，使用 `src/index.js`。
9. 保存并部署。
10. 部署完成后打开 Worker 设置。
11. 进入 Variables and Secrets。
12. 添加 `SUB_TOKEN`、可选的 `SUB_NAME`、所有 `NODE_...`、以及可选的规则变量。
13. 如果 Cloudflare 提示需要重新部署，按提示重新部署。

绑定 GitHub 后，后续推送到所选分支可以自动触发 Cloudflare 部署，具体取决于 Cloudflare 项目设置。

## 绑定自定义域名

1. 打开 Cloudflare Dashboard。
2. 进入 Workers & Pages。
3. 打开这个 Worker。
4. 进入 Settings。
5. 打开 Triggers。
6. 添加 Custom Domain，例如 `sub.example.com`。
7. 等待 Cloudflare 激活域名。

绑定完成后，订阅链接类似：

```text
https://sub.example.com/clash?token=replace-with-a-long-random-token
```

## 在客户端中导入

Clash Verge：

1. 打开 Profiles。
2. 选择从 URL 新增配置。
3. 粘贴订阅链接。
4. 保存并更新订阅。

FiClash：

1. 打开 Profiles 或 Subscriptions。
2. 新增远程订阅。
3. 粘贴订阅链接。
4. 保存并刷新。

Mihomo：

可以把生成的 YAML 作为远程配置订阅使用，也可以下载后作为本地配置文件加载。

## 错误处理

- 请求路径不是 `/clash` 时返回 `403 Forbidden`。
- `token` 与 `SUB_TOKEN` 不一致时返回 `403 Forbidden`。
- 没有配置任何 `NODE_` 变量时返回 `500`，并说明缺少节点。
- 某个节点解析失败时返回 `500`，并指出失败的环境变量名称。

## 安全建议

- 使用足够长、随机的 `SUB_TOKEN`。
- `SUB_TOKEN` 和所有 `NODE_*` 建议使用 Cloudflare Secret 类型。
- 不要提交 `.env`、`.dev.vars`、真实节点、UUID、服务器域名、自定义域名或 token。
- 如果订阅链接泄露，请立即更换 `SUB_TOKEN`。
- 仓库中只保留代码和占位示例，生产配置全部放在 Cloudflare Dashboard。
