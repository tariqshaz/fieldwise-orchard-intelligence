import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { supabase } from "@/integrations/supabase/client";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Attach the caller's Supabase session token to server-function calls.
 *
 * The generated `attachSupabaseAuth` middleware reads the browser's Supabase
 * session and passes the bearer token on. Reading the session requires a
 * usable Supabase client, and a deployment whose public Supabase settings are
 * missing, malformed or quoted wrongly has none — the client construction then
 * throws inside the browser, and because this middleware runs before every
 * server-function call, that failure breaks every server function in the app,
 * including public products such as the weather forecast that need no
 * authentication at all.
 *
 * A missing session is not an error for a public call, so the token is
 * attached when one exists and the call proceeds without it when it does not.
 * The server still decides what a call needs.
 */
const attachSupabaseAuthSafely = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    // The generated middleware reads the browser's Supabase session and
    // attaches the bearer token; this is the same step, guarded.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    return next({ headers: {} });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuthSafely],
  requestMiddleware: [errorMiddleware],
}));
