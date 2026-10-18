/**
 * Pass-through for /api/auth/* to the Auth Worker over the service binding.
 * Credentials flow natively (no credential-adapter processing on auth
 * routes). Response Set-Cookie values are preserved individually via
 * getSetCookie() — renewal cookies must survive both allow and deny paths.
 */
export async function forwardAuthRequest(
  fetcher: Fetcher,
  incoming: Request,
  sanitizedHeaders: Headers,
): Promise<Response> {
  const url = new URL(incoming.url);
  const target = `https://auth.internal${url.pathname}${url.search}`;

  const upstream = await fetcher.fetch(
    new Request(target, {
      method: incoming.method,
      headers: sanitizedHeaders,
      body: incoming.body,
      // @ts-expect-error duplex is required when streaming a request body
      duplex: "half",
    }),
  );

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
