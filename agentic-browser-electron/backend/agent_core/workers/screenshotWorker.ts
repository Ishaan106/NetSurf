/**
 * Screenshot Worker Thread
 * Offloads CPU-intensive image encoding from the Main Process
 * 
 * This worker receives raw image buffers and encodes them to base64 JPEG,
 * ensuring the Main Process UI thread is never blocked during screenshot operations.
 */

import { parentPort, workerData } from 'worker_threads';

interface EncodeMessage {
    type: 'encode';
    requestId: string;
    buffer: Buffer;
    format: 'jpeg' | 'png';
    quality?: number; // 0-100 for JPEG
}

interface EncodeResult {
    type: 'encoded';
    requestId: string;
    base64: string;
    imageType: 'image/jpeg' | 'image/png';
}

interface ErrorResult {
    type: 'error';
    requestId: string;
    error: string;
}

if (!parentPort) {
    throw new Error('This file must be run as a Worker Thread');
}

parentPort.on('message', async (message: EncodeMessage) => {
    if (message.type !== 'encode') return;

    try {
        const { requestId, buffer, format, quality = 80 } = message;

        // Convert buffer to base64
        // The buffer is already in the correct format from webContents.capturePage()
        const base64 = Buffer.from(buffer).toString('base64');

        const result: EncodeResult = {
            type: 'encoded',
            requestId,
            base64,
            imageType: format === 'jpeg' ? 'image/jpeg' : 'image/png',
        };

        parentPort!.postMessage(result);
    } catch (error) {
        const result: ErrorResult = {
            type: 'error',
            requestId: message.requestId,
            error: error instanceof Error ? error.message : 'Unknown encoding error',
        };
        parentPort!.postMessage(result);
    }
});

// Signal ready
parentPort.postMessage({ type: 'ready' });
