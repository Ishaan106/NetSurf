/**
 * AUDIO CAPTURE - WASAPI Loopback Audio (Optimized)
 * 
 * Captures system audio using WASAPI loopback mode
 * OPTIMIZED: No continuous silence writes - only writes when audio data exists
 */

#include "recorder_types.h"

namespace PrivacyRecorder {

bool SetupAudio() {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) {
        g_lastError = "CoInitialize failed";
        return false;
    }
    
    IMMDeviceEnumerator* enumerator = nullptr;
    hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL,
                          __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
    if (FAILED(hr)) {
        g_lastError = "MMDeviceEnumerator failed";
        return false;
    }
    
    hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &g_audioDevice);
    enumerator->Release();
    if (FAILED(hr)) {
        g_lastError = "GetDefaultAudioEndpoint failed";
        return false;
    }
    
    hr = g_audioDevice->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&g_audioClient);
    if (FAILED(hr)) {
        g_lastError = "AudioClient Activate failed";
        return false;
    }
    
    hr = g_audioClient->GetMixFormat(&g_audioFormat);
    if (FAILED(hr)) {
        g_lastError = "GetMixFormat failed";
        return false;
    }
    
    hr = g_audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
                                   10000000, 0, g_audioFormat, nullptr);
    if (FAILED(hr)) {
        g_lastError = "AudioClient Initialize failed: " + std::to_string(hr);
        return false;
    }
    
    hr = g_audioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&g_captureClient);
    if (FAILED(hr)) {
        g_lastError = "GetService CaptureClient failed";
        return false;
    }
    
    return true;
}

void AudioCaptureLoop() {
    if (!g_captureClient || !g_audioClient) {
        return;
    }
    
    g_audioFrames = 0;
    
    // Drain buffered audio
    UINT32 packetLength = 0;
    g_captureClient->GetNextPacketSize(&packetLength);
    while (packetLength > 0) {
        BYTE* data = nullptr;
        UINT32 numFrames = 0;
        DWORD flags = 0;
        g_captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
        g_captureClient->ReleaseBuffer(numFrames);
        g_captureClient->GetNextPacketSize(&packetLength);
    }
    
    g_audioClient->Start();
    
    while (g_audioRunning) {
        g_captureClient->GetNextPacketSize(&packetLength);
        
        // Only process when there's actual audio data
        while (packetLength > 0) {
            BYTE* data = nullptr;
            UINT32 numFrames = 0;
            DWORD flags = 0;
            
            HRESULT hr = g_captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
            if (SUCCEEDED(hr) && numFrames > 0) {
                IMFSample* sample = nullptr;
                MFCreateSample(&sample);
                
                IMFMediaBuffer* buffer = nullptr;
                DWORD bufferSize = numFrames * g_audioFormat->nBlockAlign;
                MFCreateMemoryBuffer(bufferSize, &buffer);
                
                BYTE* bufferData = nullptr;
                buffer->Lock(&bufferData, nullptr, nullptr);
                
                if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                    memset(bufferData, 0, bufferSize);
                } else {
                    memcpy(bufferData, data, bufferSize);
                }
                
                buffer->Unlock();
                buffer->SetCurrentLength(bufferSize);
                sample->AddBuffer(buffer);
                buffer->Release();
                
                // Sample-count based timestamps
                LONGLONG sampleTime = (g_audioFrames * 10000000LL) / g_audioFormat->nSamplesPerSec;
                LONGLONG sampleDuration = (numFrames * 10000000LL) / g_audioFormat->nSamplesPerSec;
                
                sample->SetSampleTime(sampleTime);
                sample->SetSampleDuration(sampleDuration);
                
                {
                    std::lock_guard<std::mutex> lock(g_sinkWriterMutex);
                    if (g_sinkWriter) {
                        g_sinkWriter->WriteSample(g_audioStreamIndex, sample);
                    }
                }
                sample->Release();
                
                g_audioFrames += numFrames;
                g_captureClient->ReleaseBuffer(numFrames);
            }
            
            g_captureClient->GetNextPacketSize(&packetLength);
        }
        
        // Sleep 20ms when no audio (not 10ms, reduces CPU)
        // No silence padding - just skip frames when no audio
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    
    g_audioClient->Stop();
}

} // namespace PrivacyRecorder
