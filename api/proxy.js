//映射表

const domain_mappings = {
  'gh.etan.fun':{
    origin: 'github.com',
    https: true,
    ip_from: false
  },
  'tool.etan.fun' :{
    origin: 'test-website.3045387398.workers.dev',
    https: true
  }, 
  'hk3-bt.etan.fun' :{
    origin: 'hk3.etan.fun',
    https: true
  }, 
  'hk4-bt.etan.fun' :{
    origin: 'hk4.etan.fun',
    https: true
  }, 
  'us1-bt.etan.fun' :{
    origin: 'us1.etan.fun',
    https: true
  }, 
  'wall-api.etan.fun' :{
    origin: 'hk4.etan.fun',
    https: true
  }, 
  'oplst.etan.fun' :{
    origin: 'us2.rz101.com:5244',
    https: false
  },
  'wall.long-gao.com':{
    origin: 'vue-longgaowall.pages.dev',
    https: true
  },
  'wall-test.long-gao.com':{
    origin: 'vue-longgaowall.pages.dev',
    https: true
  },
  'long-gao.com':{
    origin: 'wall-d.rz7.top',
    https: true
  },
  'api-wall.long-gao.com':{
    origin: '38.246.251.121',
    host: 'api.long-gao.com',
    https: true
  },
  's.etan.fun':{
    origin: 'staticfile-e9s.pages.dev',
    https: true
  },
  's-o.etan.fun':{
    origin: 'static-b.rz7.top',
    https: true
  },
  'cdn.etan.fun': {
    origin: 'imgbed-cfpages.etan.fun',
    https: true,
    cache: true,
    cacheTtl: 86400 // 1天
  },
  'cdn.long-gao.com': {
    origin: 'imgbed-cfpages.etan.fun',
    https: true,
    cache: true,
    cacheTtl: 86400 // 1天
  },
  'f.rz7.top': {
    origin: 'imgbed-cfpages.etan.fun',
    https: true,
    cache: true,
    cacheTtl: 86400 // 1天
  },
  'blog.etan.fun': {
    origin: 'blog-cfpages.etan.fun',
    https: true
  },
  'gemini.etan.fun': {
    origin: 'gemini.google.com',
    https: true,
    ip_from: false
  },
  'wall-vc.long-gao.com':{
    origin: 'vue-longgaowall.pages.dev',
    https: true
  },
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
