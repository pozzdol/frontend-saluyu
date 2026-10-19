// Cloudflare Pages Function: forwards /api/* to the Go API so the browser stays on one origin.
// The backend has no CORS and its refresh cookie is SameSite=Strict, so the proxy, not CORS,
// is what makes login work from Pages. API_ORIGIN can be overridden in the Pages settings.
export async function onRequest({ request, env }) {
  const origin = env.API_ORIGIN || "https://saluyu-service.fkriachmd.qzz.io"
  const url = new URL(request.url)
  const headers = new Headers(request.headers)
  headers.delete("host")
  return fetch(origin + url.pathname + url.search, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual",
  })
}
