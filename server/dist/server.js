import './src/config/load-env.js';
import { app } from './app.js';
import { migrateLegacyCompanyData } from './src/config/company-migration.js';
import { connectDatabase } from './src/config/database.js';
const port = Number(process.env.PORT ?? 5008);
const mongoUri = process.env.MONGO_URI;
const healthCheckUrl = process.env.HEALTH_CHECK_URL ?? `http://127.0.0.1:${port}/api/health`;
const healthCheckIntervalMs = 2 * 60 * 1000;
if (!mongoUri) {
    throw new Error('MONGO_URI is required. Copy server/.env.example to server/.env and configure MongoDB.');
}
await connectDatabase(mongoUri);
await migrateLegacyCompanyData();
app.listen(port, () => {
    console.info(`Inventory API listening on http://localhost:${port}`);
    console.info(`Health check scheduled every 2 minutes: ${healthCheckUrl}`);
    setInterval(async () => {
        try {
            const response = await fetch(healthCheckUrl, { signal: AbortSignal.timeout(10_000) });
            if (!response.ok) {
                console.error(`Health check failed with HTTP ${response.status}: ${healthCheckUrl}`);
            }
        }
        catch (error) {
            console.error(`Health check request failed: ${healthCheckUrl}`, error);
        }
    }, healthCheckIntervalMs);
});
