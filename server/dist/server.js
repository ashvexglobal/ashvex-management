import './config/load-env.js';
import { app } from './app.js';
import { migrateLegacyCompanyData } from './config/company-migration.js';
import { connectDatabase } from './config/database.js';
const port = Number(process.env.PORT ?? 5008);
const mongoUri = process.env.MONGO_URI;
if (!mongoUri) {
    throw new Error('MONGO_URI is required. Copy server/.env.example to server/.env and configure MongoDB.');
}
await connectDatabase(mongoUri);
await migrateLegacyCompanyData();
app.listen(port, () => console.info(`Inventory API listening on http://localhost:${port}`));
