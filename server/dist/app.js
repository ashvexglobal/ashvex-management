import cors from 'cors';
import express from 'express';
import { errorHandler, notFound } from './src/middleware/errors.js';
import { inventoryRouter, masterRouter } from './src/modules/inventory/routes.js';
import { businessRouter } from './src/modules/business-routes.js';
export const app = express();
const configuredOrigins = (process.env.CLIENT_URL ?? 'http://localhost:1429')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const isPrivateIpv4 = (hostname) => {
    const octets = hostname.split('.').map(Number);
    const secondOctet = octets[1] ?? -1;
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255))
        return false;
    return octets[0] === 10
        || (octets[0] === 172 && secondOctet >= 16 && secondOctet <= 31)
        || (octets[0] === 192 && octets[1] === 168);
};
app.use(cors({
    origin(origin, callback) {
        if (!origin || configuredOrigins.includes(origin))
            return callback(null, true);
        if (process.env.NODE_ENV !== 'production') {
            try {
                const url = new URL(origin);
                const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
                if (url.protocol === 'http:' && url.port === '1429' && (localHost || isPrivateIpv4(url.hostname))) {
                    return callback(null, true);
                }
            }
            catch {
                return callback(new Error('Invalid CORS origin'));
            }
        }
        return callback(new Error('Origin is not allowed by CORS'));
    },
}));
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_request, response) => response.json({ success: true, data: { status: 'ok', database: 'mongodb' } }));
app.use('/api/inventory', inventoryRouter);
app.use('/api', masterRouter);
app.use('/api', businessRouter);
app.use(notFound);
app.use(errorHandler);
