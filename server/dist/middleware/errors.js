import mongoose from 'mongoose';
export class AppError extends Error {
    statusCode;
    code;
    constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.name = 'AppError';
    }
}
export const notFound = (_request, response) => {
    response.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
};
export const errorHandler = (error, _request, response, _next) => {
    if (error instanceof AppError) {
        response.status(error.statusCode).json({ success: false, message: error.message, code: error.code });
        return;
    }
    if (error instanceof mongoose.Error.ValidationError) {
        response.status(400).json({ success: false, message: error.message, code: 'VALIDATION_ERROR' });
        return;
    }
    if (error instanceof mongoose.Error) {
        response.status(400).json({ success: false, message: error.message, code: 'DATABASE_ERROR' });
        return;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        response.status(409).json({ success: false, message: 'A record with this code already exists', code: 'DUPLICATE_RECORD' });
        return;
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 20) {
        response.status(503).json({
            success: false,
            message: 'Stock transactions require MongoDB replica-set mode. Use MongoDB Atlas or enable a local replica set.',
            code: 'TRANSACTIONS_UNSUPPORTED',
        });
        return;
    }
    console.error(error);
    response.status(500).json({ success: false, message: 'Internal server error', code: 'INTERNAL_ERROR' });
};
