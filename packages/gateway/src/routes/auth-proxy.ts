/**
 * Pass-through for /api/auth/* to the Auth Worker over the service binding.
 * Credentials flow natively (no credential-adapter processing on auth
 * routes). Response Set-Cookie values are preserved individually via
 * getSetCookie() — renewal cookies must survive both allow and deny paths.
 *
 * CRIT-3 fix: bounded by an explicit deadline. A slow or unresponsive Auth
 * Worker must not hold the gateway request open indefinitely.
 */
export async function forwardAuthRequest(
  fetcher: Fetcher,
  incoming: Request,
  sanitizedHeaders: Headers,
  deadlineMs: number,
): Promise<Response> {
  const url = new URL(incoming.url);
  const target = `https://auth.internal${url.pathname}${url.search}`;

  const proxyInit: RequestInit = {
    method: incoming.method,
    headers: sanitizedHeaders,
  };
  if (incoming.body !== null) {
    proxyInit.body = incoming.body;
    // @ts-expect-error duplex is required when streaming a request body
    proxyInit.duplex = "half";
  }

  const abort = new AbortController();
  const timer = setTimeout(
    () => abort.abort(new DOMException("Auth deadline exceeded", "TimeoutError")),
    deadlineMs,
  );

  let upstream: Response;
  try {
    upstream = await fetcher.fetch(new Request(target, proxyInit), {
      signal: abort.signal,
    });
  } catch {
    // Fail closed: the auth surface is unreachable or too slow.
    return Response.json(
      { code: "AUTH_UNAVAILABLE", message: "Authorization service unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  } finally {
    clearTimeout(timer);
  }

  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (name.toLowerCase() !== "set-cookie") headers.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("Set-Cookie", cookie);
  }
  headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
