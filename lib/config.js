// What is connected? Lets the site run in demo mode with no accounts, and go live by adding env vars.
export const dbConfigured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
export const paymentsConfigured = () => dbConfigured() && Boolean(process.env.PAYSTACK_SECRET_KEY);
