/**
 * Convert audio blob to WAV 16kHz mono PCM
 */
export async function convertToWav16kMono(audioBlob: Blob): Promise<ArrayBuffer> {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000,
    });

    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // Resample to 16kHz mono
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    const pcmData = renderedBuffer.getChannelData(0);

    // Build WAV file
    const wavBuffer = encodeWav(pcmData, 16000);
    audioContext.close();
    return wavBuffer;
}

/**
 * Encode PCM float32 samples to WAV format
 */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
    const numSamples = samples.length;
    const bitsPerSample = 16;
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = numSamples * (bitsPerSample / 8);
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write PCM samples (float32 → int16)
    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }

    return buffer;
}

function writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
