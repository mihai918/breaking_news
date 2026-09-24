import {
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";

const handler = protectedResourceHandler({
  authServerUrls: [
    "https://dev-eybmwvxjb2csb7op.us.auth0.com",
  ],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export {
  handler as GET,
  corsHandler as OPTIONS,
};
