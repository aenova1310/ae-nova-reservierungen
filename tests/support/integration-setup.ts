import "dotenv/config";

// Integrationstests laufen immer gegen die Testdatenbank – niemals gegen DATABASE_URL.
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL fehlt (siehe .env.example)");
process.env.DATABASE_URL = testUrl;
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.CRON_SECRET ??= "test-cron-secret";
process.env.APP_URL ??= "http://localhost:3000";
delete process.env.RESEND_API_KEY;
