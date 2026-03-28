//映射表
const domain_mappings = {
  'www.example.com': { //访问域名
    origin: 'origin.example.com', //源站 ip/端口/域名
    host: 'host.example.com', //访问源站时使用的 Host 头（默认与origin相同）
    https: true, //是否使用 HTTPS 访问源站
    cache: true, //是否缓存响应，默认 false
    cacheTtl: 3600 //缓存时间，单位为秒，默认 3600（1小时）
  }
}

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  const url = new URL(request.url);
  const current_host = url.host;

  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return Response.redirect(url.href, 301);
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': request.headers.get('access-control-request-headers') || '*',
        'access-control-allow-credentials': 'true',
        'access-control-max-age': '86400',
      },
    });
  }

  const host_config = getProxyPrefix(current_host);
  if (!host_config) {
    return new Response('Proxy prefix not matched', { status: 404 });
  }

  const isCacheable = host_config.cache &&
    request.method === 'GET' &&
    !request.headers.get('Authorization') &&
    !request.headers.get('Cookie');

  let target_host = host_config.origin;

  if (!target_host) {
    return new Response('No matching target host for prefix', { status: 404 });
  }

  const new_url = new URL(request.url);
  new_url.protocol = host_config.https ? 'https:' : 'http:';
  new_url.host = target_host;

  const new_headers = new Headers(request.headers);
  new_headers.set('Host', host_config.host || target_host);
  new_headers.set('Referer', new_url.href);
  new_headers.set('X-Forwarded-Host', current_host);

  const shouldIncludeIP = host_config.ip_from !== undefined ? host_config.ip_from : true;
  if (shouldIncludeIP) {
    const clientIP = request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (clientIP) {
      new_headers.set('X-Forwarded-For', clientIP);
      new_headers.set('X-Real-IP', clientIP);
    }
  } else {
    new_headers.delete('X-Forwarded-For');
    new_headers.delete('X-Real-IP');
    new_headers.delete('X-Forwarded-Host');
    new_headers.delete('CF-Connecting-IP');
    new_headers.delete('True-Client-IP');
  }

  try {
    const response = await fetch(new_url.href, {
      method: request.method,
      headers: new_headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
      redirect: 'manual',
    });

    const response_headers = new Headers(response.headers);
    response_headers.set('access-control-allow-origin', '*');
    response_headers.set('access-control-allow-credentials', 'true');
    response_headers.delete('content-security-policy');
    response_headers.delete('content-security-policy-report-only');

    if (isCacheable) {
      const cacheTtl = host_config.cacheTtl || 3600; // 默认1小时
      response_headers.set('Cache-Control', `public, max-age=${cacheTtl}`);

      response_headers.set('X-Cache-Status', 'MISS');
      response_headers.set('X-Cache-TTL', cacheTtl.toString());
      // Vercel CDN 缓存: 使用 s-maxage 控制 CDN 缓存
      response_headers.set('CDN-Cache-Control', `public, s-maxage=${cacheTtl}`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response_headers,
    });
  } catch (err) {
    return new Response(`Proxy Error: ${err.message}`, { status: 502 });
  }
}

function getProxyPrefix(hostname) {
  for (const [prefix, config] of Object.entries(domain_mappings)) {
    if (hostname == prefix) {
      return config;
    } else if (prefix.endsWith('.') && hostname.startsWith(prefix)) {
      return config;
    }
  }
  return null;
}
