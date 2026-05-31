const DEFAULT_RULES = [
  "GEOSITE,category-ads-all,REJECT",
  "GEOIP,private,DIRECT",
  "GEOSITE,cn,DIRECT",
  "GEOIP,cn,DIRECT",
  "MATCH,Proxy",
];

const SUBSCRIPTION_PATH = "/clash";
const DEFAULT_SUBSCRIPTION_NAME = "VLESS Subscription";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (!isAuthorized(url, env)) {
        return textResponse("Forbidden", 403);
      }

      const subscriptionName = getSubscriptionName(env);
      const yaml = buildSubscription(env);
      return new Response(yaml, {
        status: 200,
        headers: {
          "content-type": "text/yaml; charset=utf-8",
          "cache-control": "no-store",
          "profile-title": encodeURIComponent(subscriptionName),
          "content-disposition": `inline; filename="${sanitizeFilename(subscriptionName)}.yaml"`,
        },
      });
    } catch (error) {
      return textResponse(error.message || "Internal Server Error", 500);
    }
  },
};

export function isAuthorized(url, env) {
  return url.pathname === SUBSCRIPTION_PATH && Boolean(env.SUB_TOKEN) && url.searchParams.get("token") === env.SUB_TOKEN;
}

export function buildSubscription(env) {
  const nodeEntries = Object.entries(env)
    .filter(([key, value]) => key.startsWith("NODE_") && typeof value === "string" && value.trim())
    .sort(([left], [right]) => left.localeCompare(right));

  if (nodeEntries.length === 0) {
    throw new Error("No VLESS nodes configured. Add at least one NODE_ environment variable.");
  }

  const parsed = [];
  const errors = [];

  for (const [key, value] of nodeEntries) {
    try {
      parsed.push(parseVlessUrl(key, value));
    } catch (error) {
      errors.push(`${key}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Failed to parse VLESS node configuration: ${errors.join("; ")}`);
  }

  return renderClashYaml(parsed, env);
}

export function parseVlessUrl(envName, rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("invalid URL");
  }

  if (url.protocol !== "vless:") {
    throw new Error("URL protocol must be vless://");
  }

  const uuid = decodeURIComponent(url.username || "");
  if (!uuid) {
    throw new Error("missing UUID");
  }

  const server = url.hostname;
  if (!server) {
    throw new Error("missing server host");
  }

  const port = Number(url.port || 443);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("invalid port");
  }

  const params = url.searchParams;
  const network = (params.get("type") || "tcp").toLowerCase();
  if (!["tcp", "ws", "grpc"].includes(network)) {
    throw new Error(`unsupported network type "${network}"`);
  }

  const security = (params.get("security") || "").toLowerCase();
  const name = decodeURIComponent(url.hash ? url.hash.slice(1) : envName.replace(/^NODE_/, ""));
  const proxy = {
    name: name || envName.replace(/^NODE_/, ""),
    type: "vless",
    server,
    port,
    uuid,
    network,
    udp: true,
  };

  if (security === "tls" || security === "reality") {
    proxy.tls = true;
  }

  addParam(proxy, "flow", params.get("flow"));
  addParam(proxy, "servername", params.get("sni"));
  addParam(proxy, "client-fingerprint", params.get("fp"));

  const alpn = parseCsv(params.get("alpn"));
  if (alpn.length > 0) {
    proxy.alpn = alpn;
  }

  if (security === "reality") {
    const publicKey = params.get("pbk");
    if (!publicKey) {
      throw new Error("Reality node missing pbk");
    }

    proxy["reality-opts"] = {
      "public-key": publicKey,
    };

    addParam(proxy["reality-opts"], "short-id", params.get("sid"));
  }

  if (network === "ws") {
    proxy["ws-opts"] = {};
    addParam(proxy["ws-opts"], "path", params.get("path"));

    const host = params.get("host");
    if (host) {
      proxy["ws-opts"].headers = { Host: host };
    }
  }

  if (network === "grpc") {
    proxy["grpc-opts"] = {};
    addParam(proxy["grpc-opts"], "grpc-service-name", params.get("serviceName"));
  }

  return proxy;
}

export function renderClashYaml(proxies, env) {
  const proxyNames = proxies.map((proxy) => proxy.name);
  const subscriptionName = getSubscriptionName(env);
  const ruleProviders = normalizeRawYaml(env.CUSTOM_RULES_Provider);
  const rules = parseRules(env.CUSTOM_RULES);

  const doc = {
    name: subscriptionName,
    "mixed-port": 7890,
    "allow-lan": false,
    mode: "rule",
    "log-level": "info",
    proxies,
    "proxy-groups": [
      {
        name: "Proxy",
        type: "select",
        proxies: [...proxyNames, "DIRECT"],
      },
      {
        name: "Auto",
        type: "url-test",
        proxies: proxyNames,
        url: "http://www.gstatic.com/generate_204",
        interval: 300,
      },
    ],
  };

  const lines = [];
  lines.push(...yamlLines(doc));
  if (ruleProviders) {
    lines.push("rule-providers:");
    lines.push(...indentLines(ruleProviders, 2));
  }
  lines.push("rules:");
  for (const rule of rules) {
    lines.push(`  - ${quoteYamlString(rule)}`);
  }
  lines.push("");

  return lines.join("\n");
}

function parseRules(rawRules) {
  if (!rawRules || !rawRules.trim()) {
    return DEFAULT_RULES;
  }

  return rawRules
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""));
}

function normalizeRawYaml(value) {
  return String(value || "").trimEnd();
}

function getSubscriptionName(env) {
  const name = String(env.SUB_NAME || "").trim();
  return name || DEFAULT_SUBSCRIPTION_NAME;
}

function sanitizeFilename(value) {
  return String(value)
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "subscription";
}

function addParam(target, key, value) {
  if (value !== null && value !== undefined && value !== "") {
    target[key] = value;
  }
}

function parseCsv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function yamlLines(value, indent = 0) {
  if (Array.isArray(value)) {
    return arrayYamlLines(value, indent);
  }

  if (value && typeof value === "object") {
    return objectYamlLines(value, indent);
  }

  return [`${" ".repeat(indent)}${formatYamlScalar(value)}`];
}

function objectYamlLines(object, indent) {
  const lines = [];
  for (const [key, value] of Object.entries(object)) {
    const prefix = `${" ".repeat(indent)}${key}:`;
    if (isScalar(value)) {
      lines.push(`${prefix} ${formatYamlScalar(value)}`);
    } else if (Array.isArray(value) && value.length === 0) {
      lines.push(`${prefix} []`);
    } else {
      lines.push(prefix);
      lines.push(...yamlLines(value, indent + 2));
    }
  }
  return lines;
}

function arrayYamlLines(array, indent) {
  const lines = [];
  for (const item of array) {
    const prefix = `${" ".repeat(indent)}-`;
    if (isScalar(item)) {
      lines.push(`${prefix} ${formatYamlScalar(item)}`);
    } else {
      lines.push(prefix);
      lines.push(...yamlLines(item, indent + 2));
    }
  }
  return lines;
}

function indentLines(value, spaces) {
  const padding = " ".repeat(spaces);
  return String(value)
    .split(/\r?\n/)
    .map((line) => (line ? `${padding}${line}` : line));
}

function isScalar(value) {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatYamlScalar(value) {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (value === null) {
    return "null";
  }

  return quoteYamlString(String(value));
}

function quoteYamlString(value) {
  return JSON.stringify(value);
}

function textResponse(message, status) {
  return new Response(message, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
