# vless-to-clash-sub

Cloudflare Worker subscription generator for converting multiple VLESS node URLs into one Clash / Mihomo compatible YAML subscription.

The Worker reads every environment variable whose name starts with `NODE_`, parses the VLESS URL, converts each node into a `proxies` entry, adds `proxy-groups`, adds `rule-providers`, and returns a complete `clash.yaml` response from `/clash?token=...`.

No real node URL, UUID, server name, or token should be committed to this repository. Configure those values only in Cloudflare Worker environment variables or secrets.

## Features

- Reads unlimited VLESS nodes from `NODE_` environment variables.
- Sorts node variables by name for stable output.
- Supports `tcp`, `ws`, and `grpc` VLESS transport modes.
- Supports common VLESS parameters: `type`, `security`, `flow`, `sni`, `fp`, `pbk`, `sid`, `path`, `host`, `alpn`, and `serviceName`.
- Supports Reality nodes for Clash Meta / Mihomo with `reality-opts`.
- Uses the VLESS URL hash as the node name, for example `#LA-Reality`.
- Falls back to the environment variable suffix, for example `NODE_LA` becomes `LA`.
- Protects the subscription with `SUB_TOKEN`.
- Returns subscription-friendly headers: `text/yaml; charset=utf-8` and `cache-control: no-store`.

## Project Structure

```text
.
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── src/
│   └── index.js
└── wrangler.toml
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `SUB_TOKEN` | Yes | Long random token required to access `/clash`. |
| `NODE_*` | Yes | One or more VLESS URLs. Any variable beginning with `NODE_` is included. |
| `CUSTOM_RULES_Provider` | No | Raw YAML content placed under `rule-providers:`. |
| `CUSTOM_RULES` | No | Clash rules, one rule per line. Lines may start with `-` or `*`. |

Example:

```env
SUB_TOKEN=replace-with-a-long-random-token
NODE_LA=vless://uuid@example.com:443?type=tcp&security=reality&pbk=public-key&sid=short-id&sni=example.com&fp=chrome&flow=xtls-rprx-vision#LA-Reality
NODE_JP=vless://uuid@example.net:443?type=ws&security=tls&sni=example.net&host=example.net&path=%2Fws#JP-WS
```

## Add Nodes

Add a new Cloudflare Worker environment variable whose name starts with `NODE_`.

Examples:

```text
NODE_LA=vless://...
NODE_JP=vless://...
NODE_SG=vless://...
NODE_DE=vless://...
```

You do not need to modify code after adding a new node. The Worker discovers it automatically on the next request.

## Custom Rule Providers

Set `CUSTOM_RULES_Provider` to the YAML body that should appear under `rule-providers:`.

Example:

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

If `CUSTOM_RULES_Provider` is empty, the Worker uses the default `reject` and `gfw` providers shown above.

## Custom Rules

Set `CUSTOM_RULES` to one rule per line.

Example:

```text
- GEOSITE,category-ads-all,REJECT
- GEOIP,private,DIRECT
- GEOSITE,cn,DIRECT
- GEOIP,cn,DIRECT
- MATCH,Proxy
```

If `CUSTOM_RULES` is empty, the Worker uses those default rules.

## Deploy to Cloudflare Workers

Install dependencies:

```bash
npm install
```

Log in to Cloudflare:

```bash
npx wrangler login
```

Set secrets:

```bash
npx wrangler secret put SUB_TOKEN
npx wrangler secret put NODE_LA
npx wrangler secret put NODE_JP
```

Deploy:

```bash
npm run deploy
```

You can also configure variables in the Cloudflare Dashboard:

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Create or open `vless-to-clash-sub`.
4. Open Settings.
5. Open Variables and Secrets.
6. Add `SUB_TOKEN`, each `NODE_...`, and optional custom rule variables.
7. Deploy the Worker.

## Bind a Custom Domain

1. Open Cloudflare Dashboard.
2. Go to Workers & Pages.
3. Open the Worker.
4. Open Settings.
5. Open Triggers.
6. Add a Custom Domain, for example `sub.starrkang.me`.
7. Wait for Cloudflare to activate the route.

After binding the domain, your subscription URL will look like:

```text
https://sub.starrkang.me/clash?token=replace-with-a-long-random-token
```

## Import in Clash Verge / FiClash / Mihomo

Use the subscription URL:

```text
https://sub.starrkang.me/clash?token=replace-with-a-long-random-token
```

Clash Verge:

1. Open Profiles.
2. Add a new profile from URL.
3. Paste the subscription URL.
4. Save and update the profile.

FiClash:

1. Open Profiles or Subscriptions.
2. Add a remote subscription.
3. Paste the subscription URL.
4. Save and refresh.

Mihomo:

Use the generated YAML as a remote profile URL in your client, or download it and pass it to Mihomo as the config file.

## Error Handling

- If the request path is not `/clash`, the Worker returns `403 Forbidden`.
- If `token` does not match `SUB_TOKEN`, the Worker returns `403 Forbidden`.
- If no `NODE_` variables are configured, the Worker returns `500` with a clear error message.
- If a node fails to parse, the Worker returns `500` and names the failing environment variable.

## Security Notes

- Use a long random `SUB_TOKEN`.
- Do not commit `.env`, `.dev.vars`, real node URLs, UUIDs, private server domains, or tokens.
- Rotate `SUB_TOKEN` if it has ever been shared.
- Prefer Cloudflare Worker secrets for `SUB_TOKEN` and node URLs.
- Keep the GitHub repository free of sensitive production values.
