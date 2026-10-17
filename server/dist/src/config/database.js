import { setServers } from 'node:dns';
import { resolveSrv, Resolver } from 'node:dns/promises';
import mongoose from 'mongoose';
const defaultDnsServers = ['1.1.1.1', '8.8.8.8'];
export async function connectDatabase(uri) {
    mongoose.set('strictQuery', true);
    const target = new URL(uri);
    if (target.protocol === 'mongodb+srv:')
        await ensureAtlasSrvResolution(target.hostname);
    try {
        await mongoose.connect(uri, { autoIndex: false, serverSelectionTimeoutMS: 8000 });
    }
    catch (error) {
        const address = target.protocol === 'mongodb+srv:'
            ? `MongoDB Atlas cluster ${target.hostname}`
            : `MongoDB server ${target.hostname}:${target.port || '27017'}`;
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(`MongoDB connection failed at ${address}. Check network access, the Atlas IP access list, and database credentials. ${details}`);
    }
    mongoose.connection.on('disconnected', () => {
        console.error(`MongoDB disconnected from ${mongoose.connection.host}:${mongoose.connection.port}; check network access and database availability.`);
    });
    console.info(`MongoDB connected: ${mongoose.connection.name}`);
}
async function ensureAtlasSrvResolution(hostname) {
    const srvName = `_mongodb._tcp.${hostname}`;
    try {
        await resolveSrv(srvName);
        return;
    }
    catch {
        const configuredServers = process.env.MONGO_DNS_SERVERS
            ?.split(',')
            .map((server) => server.trim())
            .filter(Boolean);
        const fallbackServers = configuredServers?.length ? configuredServers : defaultDnsServers;
        const resolver = new Resolver();
        try {
            resolver.setServers(fallbackServers);
            await resolver.resolveSrv(srvName);
            setServers(fallbackServers);
            console.warn('System DNS could not resolve MongoDB Atlas SRV records; using fallback DNS for this API process.');
        }
        catch (error) {
            const code = error && typeof error === 'object' && 'code' in error ? ` (${String(error.code)})` : '';
            throw new Error(`Could not resolve MongoDB Atlas SRV records for ${hostname}${code}. Check system DNS/network access or configure MONGO_DNS_SERVERS.`);
        }
    }
}
