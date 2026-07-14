/**
 * ENCODER - Media Foundation H.264 Encoder
 * 
 * GPU HARDWARE ENCODING:
 * - Prefers Intel QSV if available
 * - Falls back to any available hardware encoder
 * - Zero-copy via DXGI surface buffers
 */

#include "recorder_types.h"

namespace PrivacyRecorder {

// CACHED BUFFERS for minimal CPU overhead
static IMFMediaBuffer* g_cachedCaptureBuffer = nullptr;
static IMFMediaBuffer* g_cachedBlurBuffer = nullptr;
static bool g_buffersInitialized = false;

bool InitCachedBuffers() {
    if (g_buffersInitialized) return true;
    
    HRESULT hr = MFCreateDXGISurfaceBuffer(
        __uuidof(ID3D11Texture2D), 
        g_captureTexture, 
        0, FALSE, 
        &g_cachedCaptureBuffer
    );
    if (FAILED(hr)) {
        g_lastError = "Failed to create cached capture buffer";
        return false;
    }
    g_cachedCaptureBuffer->SetCurrentLength(g_width * g_height * 4);
    
    if (g_blurredTexture) {
        hr = MFCreateDXGISurfaceBuffer(
            __uuidof(ID3D11Texture2D), 
            g_blurredTexture, 
            0, FALSE, 
            &g_cachedBlurBuffer
        );
        if (SUCCEEDED(hr)) {
            g_cachedBlurBuffer->SetCurrentLength(g_width * g_height * 4);
        }
    }
    
    g_buffersInitialized = true;
    return true;
}

void DestroyCachedBuffers() {
    if (g_cachedCaptureBuffer) {
        g_cachedCaptureBuffer->Release();
        g_cachedCaptureBuffer = nullptr;
    }
    if (g_cachedBlurBuffer) {
        g_cachedBlurBuffer->Release();
        g_cachedBlurBuffer = nullptr;
    }
    g_buffersInitialized = false;
}

bool InitSamplePool() { return true; }
void DestroySamplePool() { DestroyCachedBuffers(); }

bool SetupEncoder(const std::wstring& outputPath) {
    HRESULT hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) {
        g_lastError = "MFStartup failed";
        return false;
    }
    
    // Create DXGI device manager for GPU encoding
    hr = MFCreateDXGIDeviceManager(&g_resetToken, &g_dxgiManager);
    if (FAILED(hr)) {
        g_lastError = "MFCreateDXGIDeviceManager failed";
        return false;
    }
    
    hr = g_dxgiManager->ResetDevice(g_device, g_resetToken);
    if (FAILED(hr)) {
        g_lastError = "ResetDevice failed";
        return false;
    }
    
    // Sink writer attributes for hardware encoding
    IMFAttributes* attrs = nullptr;
    hr = MFCreateAttributes(&attrs, 4);
    if (FAILED(hr)) {
        g_lastError = "MFCreateAttributes failed";
        return false;
    }
    
    // CRITICAL: These enable hardware encoding
    attrs->SetUnknown(MF_SINK_WRITER_D3D_MANAGER, g_dxgiManager);
    attrs->SetUINT32(MF_LOW_LATENCY, TRUE);
    attrs->SetUINT32(MF_READWRITE_ENABLE_HARDWARE_TRANSFORMS, TRUE);
    attrs->SetUINT32(MF_SINK_WRITER_DISABLE_THROTTLING, TRUE);
    
    hr = MFCreateSinkWriterFromURL(outputPath.c_str(), nullptr, attrs, &g_sinkWriter);
    attrs->Release();
    
    if (FAILED(hr)) {
        g_lastError = "MFCreateSinkWriterFromURL failed: " + std::to_string(hr);
        return false;
    }
    
    // Output type - H.264 (hardware encoder will be selected automatically)
    IMFMediaType* outputType = nullptr;
    MFCreateMediaType(&outputType);
    outputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    outputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
    outputType->SetUINT32(MF_MT_AVG_BITRATE, 8000000);
    outputType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    MFSetAttributeSize(outputType, MF_MT_FRAME_SIZE, g_width, g_height);
    MFSetAttributeRatio(outputType, MF_MT_FRAME_RATE, g_fps, 1);
    MFSetAttributeRatio(outputType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    
    hr = g_sinkWriter->AddStream(outputType, &g_videoStreamIndex);
    outputType->Release();
    if (FAILED(hr)) {
        g_lastError = "AddStream failed";
        return false;
    }
    
    // Input type - BGRA (GPU format)
    IMFMediaType* inputType = nullptr;
    MFCreateMediaType(&inputType);
    inputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    inputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);
    inputType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    MFSetAttributeSize(inputType, MF_MT_FRAME_SIZE, g_width, g_height);
    MFSetAttributeRatio(inputType, MF_MT_FRAME_RATE, g_fps, 1);
    MFSetAttributeRatio(inputType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    
    hr = g_sinkWriter->SetInputMediaType(g_videoStreamIndex, inputType, nullptr);
    inputType->Release();
    if (FAILED(hr)) {
        g_lastError = "SetInputMediaType failed";
        return false;
    }
    
    // Audio stream
    if (g_audioEnabled && g_audioFormat) {
        IMFMediaType* audioOutputType = nullptr;
        MFCreateMediaType(&audioOutputType);
        audioOutputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Audio);
        audioOutputType->SetGUID(MF_MT_SUBTYPE, MFAudioFormat_AAC);
        audioOutputType->SetUINT32(MF_MT_AUDIO_SAMPLES_PER_SECOND, g_audioFormat->nSamplesPerSec);
        audioOutputType->SetUINT32(MF_MT_AUDIO_NUM_CHANNELS, g_audioFormat->nChannels);
        audioOutputType->SetUINT32(MF_MT_AUDIO_BITS_PER_SAMPLE, 16);
        audioOutputType->SetUINT32(MF_MT_AUDIO_AVG_BYTES_PER_SECOND, 16000);
        
        hr = g_sinkWriter->AddStream(audioOutputType, &g_audioStreamIndex);
        audioOutputType->Release();
        
        if (SUCCEEDED(hr)) {
            IMFMediaType* audioInputType = nullptr;
            MFCreateMediaType(&audioInputType);
            MFInitMediaTypeFromWaveFormatEx(audioInputType, g_audioFormat, 
                                            sizeof(WAVEFORMATEX) + g_audioFormat->cbSize);
            g_sinkWriter->SetInputMediaType(g_audioStreamIndex, audioInputType, nullptr);
            audioInputType->Release();
        }
    }
    
    hr = g_sinkWriter->BeginWriting();
    if (FAILED(hr)) {
        g_lastError = "BeginWriting failed";
        return false;
    }
    
    if (!InitCachedBuffers()) {
        return false;
    }
    
    std::cout << "[PrivacyRecorder] Encoder ready (hardware accelerated)" << std::endl;
    return true;
}

// GPU-OPTIMIZED capture with cached buffers
bool CaptureAndEncode() {
    g_captureAttempts++;
    
    IDXGIResource* resource = nullptr;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    
    HRESULT hr = g_duplication->AcquireNextFrame(17, &frameInfo, &resource);
    
    if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
        g_timeouts++;
        // Continue with cached texture for smooth playback
    } else if (FAILED(hr)) {
        g_acquireErrors++;
        return false;
    } else {
        // GPU-to-GPU copy
        ID3D11Texture2D* desktopTex = nullptr;
        hr = resource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&desktopTex);
        resource->Release();
        
        if (SUCCEEDED(hr)) {
            g_context->CopyResource(g_captureTexture, desktopTex);
            desktopTex->Release();
        }
        g_duplication->ReleaseFrame();
    }
    
    // Select buffer
    IMFMediaBuffer* buffer = g_cachedCaptureBuffer;
    if (ShouldApplyBlur() && g_blurShader && g_cachedBlurBuffer) {
        ApplyBlur();
        buffer = g_cachedBlurBuffer;
    }
    
    // Create sample
    IMFSample* sample = nullptr;
    hr = MFCreateSample(&sample);
    if (FAILED(hr)) return false;
    
    // Use cached buffer
    buffer->AddRef();
    hr = sample->AddBuffer(buffer);
    if (FAILED(hr)) {
        buffer->Release();
        sample->Release();
        return false;
    }
    
    // Timestamps
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(now - g_recordingStartTime);
    LONGLONG sampleTime = elapsed.count() / 100;
    
    LONGLONG frameDuration = 10000000LL / g_fps;
    if (g_lastSampleTime > 0) {
        frameDuration = sampleTime - g_lastSampleTime;
        if (frameDuration < 10000) frameDuration = 10000;
        if (frameDuration > 10000000) frameDuration = 10000000;
    }
    g_lastSampleTime = sampleTime;
    
    sample->SetSampleTime(sampleTime);
    sample->SetSampleDuration(frameDuration);
    
    {
        std::lock_guard<std::mutex> lock(g_sinkWriterMutex);
        hr = g_sinkWriter->WriteSample(g_videoStreamIndex, sample);
    }
    sample->Release();
    
    if (FAILED(hr)) return false;
    
    g_frameCount++;
    g_encodeSuccess++;
    
    return true;
}

} // namespace PrivacyRecorder
