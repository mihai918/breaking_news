export async function GET() {
  return Response.json({
    resource: "https://breakingnews-five.vercel.app",
    authorization_servers: [
      "https://dev-eybmwvxjb2csb7op.us.auth0.com",
    ],
    scopes_supported: ["telegram:send"],
  });
}
