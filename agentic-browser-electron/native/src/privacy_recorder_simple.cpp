/**
 * PRIVACY RECORDER - Zero-Copy GPU Pipeline with Audio
 * 
 * TRUE ZERO-COPY GPU Pipeline:
 *   DXGI → GPU Texture → Blur Shader (optional) → MediaFoundation Encoder → MP4
 *                         ↑ GPU ↑
 * 
 * Audio: WASAPI Loopback (system audio)
 */

#include <napi.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>
#include <Mfobjects.h>
#include <mmdeviceapi.h>
#include <Audioclient.h>
#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <chrono>
#include <shlobj.h>
#include <vector>

#pragma comment(lib, "d3d11.lib")
#pragma comment(lib, "dxgi.lib")
#pragma comment(lib, "d3dcompiler.lib")
#pragma comment(lib, "mf.lib")
#pragma comment(lib, "mfplat.lib")
#pragma comment(lib, "mfuuid.lib")
#pragma comment(lib, "mfreadwrite.lib")
#pragma comment(lib, "ole32.lib")

namespace PrivacyRecorder {

// ============ VIDEO GLOBALS ============
static ID3D11Device* g_device = nullptr;
static ID3D11DeviceContext* g_context = nullptr;
static IDXGIOutputDuplication* g_duplication = nullptr;
static IDXGIOutput1* g_output = nullptr;
static ID3D11Texture2D* g_captureTexture = nullptr;
static ID3D11Texture2D* g_blurredTexture = nullptr;  // For privacy blur output
static IMFDXGIDeviceManager* g_dxgiManager = nullptr;
static IMFSinkWriter* g_sinkWriter = nullptr;
static std::mutex g_sinkWriterMutex;  // CRITICAL: SinkWriter is NOT thread-safe
static DWORD g_videoStreamIndex = 0;
static DWORD g_audioStreamIndex = 0;
static UINT g_resetToken = 0;

// Blur shader resources
static ID3D11ComputeShader* g_blurShader = nullptr;
static ID3D11UnorderedAccessView* g_blurUAV = nullptr;
static ID3D11ShaderResourceView* g_captureSRV = nullptr;

// ============ AUDIO GLOBALS ============
static IMMDevice* g_audioDevice = nullptr;
static IAudioClient* g_audioClient = nullptr;
static IAudioCaptureClient* g_captureClient = nullptr;
static WAVEFORMATEX* g_audioFormat = nullptr;
static std::thread g_audioThread;
static std::atomic<bool> g_audioRunning{false};

// ============ CONFIG ============
static uint32_t g_width = 0;
static uint32_t g_height = 0;
static uint32_t g_fps = 60;
static uint64_t g_frameCount = 0;
static std::atomic<bool> g_recording{false};
static std::atomic<bool> g_initialized{false};
static std::atomic<bool> g_audioEnabled{false};
static std::atomic<bool> g_privacyEnabled{false};
static std::thread g_recordingThread;
static std::string g_lastError;
static std::string g_captureError;

// Real-time timestamps for audio sync
static std::chrono::steady_clock::time_point g_recordingStartTime;
static LONGLONG g_lastSampleTime = 0;

// Diagnostic counters
static std::atomic<uint64_t> g_loopIterations{0};
static std::atomic<uint64_t> g_captureAttempts{0};
static std::atomic<uint64_t> g_timeouts{0};
static std::atomic<uint64_t> g_acquireErrors{0};
static std::atomic<uint64_t> g_encodeSuccess{0};
static std::atomic<uint64_t> g_audioFrames{0};

// ============ INITIALIZATION ============

bool CreateD3DDevice() {
    D3D_FEATURE_LEVEL featureLevels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0
    };
    
    D3D_FEATURE_LEVEL featureLevel;
    
    HRESULT hr = D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr,
        D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
        featureLevels, 2, D3D11_SDK_VERSION,
        &g_device, &featureLevel, &g_context
    );
    
    if (FAILED(hr)) {
        g_lastError = "Failed to create D3D11 device";
        return false;
    }
    
    // Enable multithread protection for MF
    ID3D10Multithread* mt = nullptr;
    if (SUCCEEDED(g_device->QueryInterface(__uuidof(ID3D10Multithread), (void**)&mt))) {
        mt->SetMultithreadProtected(TRUE);
        mt->Release();
    }
    
    std::cout << "[PrivacyRecorder] D3D11 device created" << std::endl;
    return true;
}

bool SetupDXGI(int monitorIndex) {
    IDXGIDevice* dxgiDevice = nullptr;
    if (FAILED(g_device->QueryInterface(__uuidof(IDXGIDevice), (void**)&dxgiDevice))) {
        g_lastError = "QueryInterface IDXGIDevice failed";
        return false;
    }
    
    IDXGIAdapter* adapter = nullptr;
    if (FAILED(dxgiDevice->GetAdapter(&adapter))) {
        dxgiDevice->Release();
        g_lastError = "GetAdapter failed";
        return false;
    }
    dxgiDevice->Release();
    
    IDXGIOutput* output = nullptr;
    if (FAILED(adapter->EnumOutputs(monitorIndex, &output))) {
        adapter->Release();
        g_lastError = "EnumOutputs failed";
        return false;
    }
    adapter->Release();
    
    if (FAILED(output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&g_output))) {
        output->Release();
        g_lastError = "QueryInterface IDXGIOutput1 failed";
        return false;
    }
    output->Release();
    
    DXGI_OUTPUT_DESC desc;
    g_output->GetDesc(&desc);
    g_width = desc.DesktopCoordinates.right - desc.DesktopCoordinates.left;
    g_height = desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top;
    
    if (FAILED(g_output->DuplicateOutput(g_device, &g_duplication))) {
        g_lastError = "DuplicateOutput failed";
        return false;
    }
    
    std::cout << "[PrivacyRecorder] DXGI setup: " << g_width << "x" << g_height << std::endl;
    return true;
}

bool CreateCaptureTexture() {
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = g_width;
    desc.Height = g_height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    // Important: These flags are required for MediaFoundation DXGI buffer
    desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED;
    
    HRESULT hr = g_device->CreateTexture2D(&desc, nullptr, &g_captureTexture);
    if (FAILED(hr)) {
        g_lastError = "CreateTexture2D failed: " + std::to_string(hr);
        std::cerr << "[PrivacyRecorder] CreateTexture2D failed: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    std::cout << "[PrivacyRecorder] Capture texture created" << std::endl;
    return true;
}

// Test that DXGI capture works by acquiring one frame
bool TestCapture() {
    IDXGIResource* resource = nullptr;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    
    // Try multiple times with longer timeout
    for (int attempt = 0; attempt < 3; attempt++) {
        HRESULT hr = g_duplication->AcquireNextFrame(500, &frameInfo, &resource);
        
        if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
            continue;  // Try again
        }
        
        if (FAILED(hr)) {
            g_lastError = "TestCapture AcquireNextFrame failed: " + std::to_string(hr);
            return false;
        }
        
        // Success - release and return
        resource->Release();
        g_duplication->ReleaseFrame();
        std::cout << "[PrivacyRecorder] Test capture successful!" << std::endl;
        return true;
    }
    
    g_lastError = "TestCapture timeout - is there screen activity?";
    return false;
}

// ============ SELECTIVE BLUR DETECTION ============

// Cached blur result - updated efficiently in recording loop
static std::atomic<bool> g_cachedBlurResult{false};
static std::chrono::steady_clock::time_point g_lastBlurCheck;
static const auto BLUR_CHECK_INTERVAL = std::chrono::milliseconds(100);  // Check 10x per second

// Blur patterns for messaging apps
static const wchar_t* g_blurPatterns[] = {
    L"whatsapp",          // WhatsApp
    L"telegram",          // Telegram
    L"signal",            // Signal
    L"messenger",         // FB Messenger
    L"- gmail",           // Gmail message view
    L"inbox -",           // Gmail inbox with subject preview
    nullptr
};

// Check window title against blur patterns
static bool CheckWindowForBlur(HWND hwnd) {
    if (!hwnd) return false;
    
    wchar_t title[512];
    GetWindowTextW(hwnd, title, 512);
    
    // Convert to lowercase for matching
    std::wstring titleLower(title);
    for (auto& c : titleLower) c = towlower(c);
    
    for (int i = 0; g_blurPatterns[i] != nullptr; i++) {
        if (titleLower.find(g_blurPatterns[i]) != std::wstring::npos) {
            return true;
        }
    }
    return false;
}

// Update blur check - called from recording loop
void UpdateBlurCheck() {
    if (!g_privacyEnabled) {
        g_cachedBlurResult = false;
        return;
    }
    
    // Check cache - only update every 100ms to minimize overhead
    auto now = std::chrono::steady_clock::now();
    if (now - g_lastBlurCheck < BLUR_CHECK_INTERVAL) {
        return;
    }
    g_lastBlurCheck = now;
    
    // Check ONLY foreground window for privacy patterns
    // This is more reliable than EnumWindows which finds too many matches
    HWND foreground = GetForegroundWindow();
    g_cachedBlurResult = CheckWindowForBlur(foreground);
}

// Check if foreground window should be blurred - uses cached value
bool ShouldApplyBlur() {
    if (!g_privacyEnabled) return false;
    return g_cachedBlurResult;
}

// ============ BLUR RESOURCES (Zero-Copy GPU) ============

// Fast 5x5 Gaussian blur - optimized for minimal GPU impact
const char* g_blurShaderCode = R"(
Texture2D<float4> inputTex : register(t0);
RWTexture2D<float4> outputTex : register(u0);

// 5-tap Gaussian weights
static const float weights[5] = { 0.06, 0.24, 0.40, 0.24, 0.06 };

[numthreads(16, 16, 1)]
void CSMain(uint3 id : SV_DispatchThreadID) {
    uint width, height;
    outputTex.GetDimensions(width, height);
    
    if (id.x >= width || id.y >= height) return;
    
    // Fast 5x5 blur with 8-pixel spacing for wider effect
    float4 sum = float4(0, 0, 0, 0);
    float totalWeight = 0;
    
    for (int dy = -2; dy <= 2; dy++) {
        for (int dx = -2; dx <= 2; dx++) {
            int2 pos = int2(id.xy) + int2(dx * 8, dy * 8);
            pos = clamp(pos, int2(0, 0), int2(width - 1, height - 1));
            
            float weight = weights[dy + 2] * weights[dx + 2];
            sum += inputTex.Load(int3(pos, 0)) * weight;
            totalWeight += weight;
        }
    }
    
    outputTex[id.xy] = sum / totalWeight;
}
)";

bool CreateBlurResources() {
    // Create blurred texture (output of blur shader)
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = g_width;
    desc.Height = g_height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_UNORDERED_ACCESS | D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
    desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED;
    
    HRESULT hr = g_device->CreateTexture2D(&desc, nullptr, &g_blurredTexture);
    if (FAILED(hr)) {
        g_lastError = "CreateBlurredTexture failed: " + std::to_string(hr);
        return false;
    }
    
    // Create SRV for input texture
    D3D11_SHADER_RESOURCE_VIEW_DESC srvDesc = {};
    srvDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    srvDesc.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
    srvDesc.Texture2D.MipLevels = 1;
    
    hr = g_device->CreateShaderResourceView(g_captureTexture, &srvDesc, &g_captureSRV);
    if (FAILED(hr)) {
        g_lastError = "CreateCaptureSRV failed: " + std::to_string(hr);
        return false;
    }
    
    // Create UAV for output texture
    D3D11_UNORDERED_ACCESS_VIEW_DESC uavDesc = {};
    uavDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    uavDesc.ViewDimension = D3D11_UAV_DIMENSION_TEXTURE2D;
    
    hr = g_device->CreateUnorderedAccessView(g_blurredTexture, &uavDesc, &g_blurUAV);
    if (FAILED(hr)) {
        g_lastError = "CreateBlurUAV failed: " + std::to_string(hr);
        return false;
    }
    
    // Compile blur shader
    ID3DBlob* shaderBlob = nullptr;
    ID3DBlob* errorBlob = nullptr;
    
    hr = D3DCompile(g_blurShaderCode, strlen(g_blurShaderCode), "BlurShader",
                    nullptr, nullptr, "CSMain", "cs_5_0", D3DCOMPILE_OPTIMIZATION_LEVEL3,
                    0, &shaderBlob, &errorBlob);
    
    if (FAILED(hr)) {
        if (errorBlob) {
            g_lastError = "Blur shader compile: " + std::string((char*)errorBlob->GetBufferPointer());
            errorBlob->Release();
        }
        return false;
    }
    
    hr = g_device->CreateComputeShader(shaderBlob->GetBufferPointer(), 
                                        shaderBlob->GetBufferSize(), nullptr, &g_blurShader);
    shaderBlob->Release();
    if (errorBlob) errorBlob->Release();
    
    if (FAILED(hr)) {
        g_lastError = "CreateComputeShader failed: " + std::to_string(hr);
        return false;
    }
    
    std::cout << "[PrivacyRecorder] Blur resources created (GPU compute shader)" << std::endl;
    return true;
}

void ApplyBlur() {
    // Set shader and resources
    g_context->CSSetShader(g_blurShader, nullptr, 0);
    g_context->CSSetShaderResources(0, 1, &g_captureSRV);
    g_context->CSSetUnorderedAccessViews(0, 1, &g_blurUAV, nullptr);
    
    // Dispatch - 16x16 thread groups
    UINT groupsX = (g_width + 15) / 16;
    UINT groupsY = (g_height + 15) / 16;
    g_context->Dispatch(groupsX, groupsY, 1);
    
    // Unbind
    ID3D11UnorderedAccessView* nullUAV = nullptr;
    ID3D11ShaderResourceView* nullSRV = nullptr;
    g_context->CSSetUnorderedAccessViews(0, 1, &nullUAV, nullptr);
    g_context->CSSetShaderResources(0, 1, &nullSRV);
}

// ============ WASAPI AUDIO SETUP ============

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
    
    // Get default audio output device (for loopback capture)
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
    
    // Initialize for loopback capture (system audio)
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
    
    std::cout << "[PrivacyRecorder] WASAPI audio setup: " << g_audioFormat->nSamplesPerSec 
              << "Hz, " << g_audioFormat->nChannels << " channels" << std::endl;
    return true;
}

void AudioCaptureLoop() {
    if (!g_captureClient || !g_audioClient) return;
    
    // CRITICAL: Drain any buffered audio from before recording started
    // WASAPI loopback may have old samples that would cause timeline mismatch
    UINT32 packetLength = 0;
    g_captureClient->GetNextPacketSize(&packetLength);
    while (packetLength > 0) {
        BYTE* data = nullptr;
        UINT32 numFrames = 0;
        DWORD flags = 0;
        g_captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
        g_captureClient->ReleaseBuffer(numFrames);  // Discard old samples
        g_captureClient->GetNextPacketSize(&packetLength);
    }
    
    g_audioClient->Start();
    
    // Audio uses wall-clock timestamps synced with video - no need to wait
    while (g_audioRunning) {
        // ===== CAPTURE REAL AUDIO =====
        // With wall-clock timestamps, audio naturally syncs to video timeline
        // No frame-based silence padding needed
        UINT32 packetLength = 0;
        g_captureClient->GetNextPacketSize(&packetLength);
        
        while (packetLength > 0) {
            BYTE* data = nullptr;
            UINT32 numFrames = 0;
            DWORD flags = 0;
            UINT64 devicePos = 0;
            
            HRESULT hr = g_captureClient->GetBuffer(&data, &numFrames, &flags, &devicePos, nullptr);
            if (SUCCEEDED(hr)) {
                // Create audio sample
                if (g_sinkWriter && numFrames > 0) {
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
                    
                    // SAMPLE-COUNT BASED TIMING (matches video's frame-index approach)
                    // Audio timestamp = g_audioFrames × sample_duration
                    // Video timestamp = g_frameCount × frame_duration
                    // Both use synthetic monotonic timestamps for consistent A/V sync
                    LONGLONG sampleTime = (g_audioFrames * 10000000LL) / g_audioFormat->nSamplesPerSec;
                    LONGLONG sampleDuration = (numFrames * 10000000LL) / g_audioFormat->nSamplesPerSec;
                    
                    sample->SetSampleTime(sampleTime);
                    sample->SetSampleDuration(sampleDuration);
                    
                    {
                        std::lock_guard<std::mutex> lock(g_sinkWriterMutex);
                        g_sinkWriter->WriteSample(g_audioStreamIndex, sample);
                    }
                    sample->Release();
                    
                    g_audioFrames += numFrames;
                }
                
                g_captureClient->ReleaseBuffer(numFrames);
            }
            
            g_captureClient->GetNextPacketSize(&packetLength);
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(5));
    }
    
    g_audioClient->Stop();
}

bool SetupEncoder(const std::wstring& outputPath) {
    HRESULT hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) {
        g_lastError = "MFStartup failed";
        return false;
    }
    
    // Create DXGI device manager for zero-copy
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
    
    // Create sink writer attributes
    IMFAttributes* attrs = nullptr;
    hr = MFCreateAttributes(&attrs, 2);
    if (FAILED(hr)) {
        g_lastError = "MFCreateAttributes failed";
        return false;
    }
    
    attrs->SetUnknown(MF_SINK_WRITER_D3D_MANAGER, g_dxgiManager);
    attrs->SetUINT32(MF_LOW_LATENCY, TRUE);
    
    // Create sink writer
    hr = MFCreateSinkWriterFromURL(outputPath.c_str(), nullptr, attrs, &g_sinkWriter);
    attrs->Release();
    
    if (FAILED(hr)) {
        g_lastError = "MFCreateSinkWriterFromURL failed: " + std::to_string(hr);
        return false;
    }
    
    // Output type - H.264
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
    
    // Input type - BGRA (matches DXGI_FORMAT_B8G8R8A8_UNORM)
    // MFVideoFormat_RGB32 = BGRA in little-endian (0x00D3D232)
    IMFMediaType* inputType = nullptr;
    MFCreateMediaType(&inputType);
    inputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    inputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32);  // RGB32 = BGRA in MF
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
    
    // Add audio stream if audio is enabled
    if (g_audioEnabled && g_audioFormat) {
        // Audio output type - AAC
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
        if (FAILED(hr)) {
            g_lastError = "AddStream audio failed";
            return false;
        }
        
        // Audio input type - from WASAPI format (use MFInitMediaTypeFromWaveFormatEx)
        IMFMediaType* audioInputType = nullptr;
        MFCreateMediaType(&audioInputType);
        
        // Use MFInitMediaTypeFromWaveFormatEx to set all attributes from WAVEFORMATEX
        hr = MFInitMediaTypeFromWaveFormatEx(audioInputType, g_audioFormat, 
                                              sizeof(WAVEFORMATEX) + g_audioFormat->cbSize);
        if (FAILED(hr)) {
            g_lastError = "MFInitMediaTypeFromWaveFormatEx failed: " + std::to_string(hr);
            audioInputType->Release();
            return false;
        }
        
        hr = g_sinkWriter->SetInputMediaType(g_audioStreamIndex, audioInputType, nullptr);
        audioInputType->Release();
        if (FAILED(hr)) {
            g_lastError = "SetInputMediaType audio failed: " + std::to_string(hr);
            return false;
        }
        
        std::cout << "[PrivacyRecorder] Audio stream added" << std::endl;
    }
    
    hr = g_sinkWriter->BeginWriting();
    if (FAILED(hr)) {
        g_lastError = "BeginWriting failed";
        return false;
    }
    
    std::cout << "[PrivacyRecorder] Encoder ready" << std::endl;
    return true;
}

// ============ RECORDING LOOP ============

bool CaptureAndEncode() {
    g_captureAttempts++;
    
    IDXGIResource* resource = nullptr;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    
    HRESULT hr = g_duplication->AcquireNextFrame(100, &frameInfo, &resource);
    if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
        g_timeouts++;
        return true;  // No new frame yet
    }
    if (FAILED(hr)) {
        g_acquireErrors++;
        if (g_frameCount == 0) {
            g_captureError = "AcquireNextFrame failed: " + std::to_string(hr);
        }
        return false;
    }
    
    // Get desktop texture
    ID3D11Texture2D* desktopTex = nullptr;
    hr = resource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&desktopTex);
    resource->Release();
    if (FAILED(hr)) {
        std::cerr << "[PrivacyRecorder] QueryInterface texture failed" << std::endl;
        g_duplication->ReleaseFrame();
        return false;
    }
    
    // GPU-to-GPU copy (ZERO COPY - no CPU involved)
    g_context->CopyResource(g_captureTexture, desktopTex);
    desktopTex->Release();
    g_duplication->ReleaseFrame();
    
    // Apply privacy blur if foreground window matches patterns (GPU compute shader - zero copy)
    ID3D11Texture2D* outputTexture = g_captureTexture;
    if (ShouldApplyBlur() && g_blurShader) {
        ApplyBlur();
        outputTexture = g_blurredTexture;
    }
    
    // Create sample with DXGI surface buffer - TRUE ZERO COPY
    IMFSample* sample = nullptr;
    hr = MFCreateSample(&sample);
    if (FAILED(hr)) {
        g_captureError = "MFCreateSample failed: " + std::to_string(hr);
        return false;
    }
    
    IMFMediaBuffer* buffer = nullptr;
    hr = MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), outputTexture, 0, FALSE, &buffer);
    if (FAILED(hr)) {
        g_captureError = "MFCreateDXGISurfaceBuffer failed: " + std::to_string(hr);
        sample->Release();
        return false;
    }
    
    // CRITICAL: Set buffer length - required for WriteSample to work
    DWORD bufferLength = g_width * g_height * 4;  // 4 bytes per pixel (BGRA)
    hr = buffer->SetCurrentLength(bufferLength);
    if (FAILED(hr)) {
        g_captureError = "SetCurrentLength failed: " + std::to_string(hr);
        buffer->Release();
        sample->Release();
        return false;
    }
    
    hr = sample->AddBuffer(buffer);
    buffer->Release();
    if (FAILED(hr)) {
        g_captureError = "AddBuffer failed: " + std::to_string(hr);
        sample->Release();
        return false;
    }
    
    // FRAME-INDEX BASED TIMING (uniform timestamps)
    // ================================================
    // Uses frame count × frame duration for perfectly uniform timestamps
    // 
    // Why: RecordingLoop uses deadline-based pacing to capture at ~60 FPS
    // Frame-index timestamps ensure encoder sees uniform 16.67ms spacing
    // This prevents the jitter that causes audio breaks
    //
    LONGLONG frameDuration = 10000000LL / g_fps;  // 166666 for 60 FPS (100-ns units)
    LONGLONG sampleTime = g_frameCount * frameDuration;
    
    sample->SetSampleTime(sampleTime);
    sample->SetSampleDuration(frameDuration);
    
    {
        std::lock_guard<std::mutex> lock(g_sinkWriterMutex);
        hr = g_sinkWriter->WriteSample(g_videoStreamIndex, sample);
    }
    sample->Release();
    
    if (FAILED(hr)) {
        if (g_frameCount == 0) {
            g_captureError = "WriteSample failed: " + std::to_string(hr);
        }
        return false;
    }
    
    g_frameCount++;
    g_encodeSuccess++;
    if (g_frameCount == 1) {
        std::cout << "[PrivacyRecorder] First frame captured!" << std::endl;
    } else if (g_frameCount % 60 == 0) {
        std::cout << "[PrivacyRecorder] Encoded " << g_frameCount << " frames" << std::endl;
    }
    
    return true;
}

void RecordingLoop() {
    // Set thread to BELOW_NORMAL priority - browser rendering takes precedence
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    
    g_loopIterations = 0;
    g_lastSampleTime = 0;
    g_recordingStartTime = std::chrono::steady_clock::now();
    
    // Deadline-based pacing for consistent frame timing
    // Instead of measuring each frame and sleeping remainder,
    // we target fixed deadlines: t=0, t=16.67ms, t=33.33ms, etc.
    auto frameInterval = std::chrono::nanoseconds(1000000000 / g_fps);
    auto nextFrameDeadline = std::chrono::steady_clock::now() + frameInterval;
    
    while (g_recording) {
        // Update blur check for privacy detection (100ms interval, minimal overhead)
        UpdateBlurCheck();
        
        // Capture and encode
        g_loopIterations++;
        CaptureAndEncode();
        
        // Deadline-based pacing - wait until next frame deadline
        // This prevents drift and ensures consistent 60 FPS
        auto now = std::chrono::steady_clock::now();
        if (now < nextFrameDeadline) {
            std::this_thread::sleep_until(nextFrameDeadline);
        }
        
        // Set next deadline (maintains consistent timing even if frame was slow)
        nextFrameDeadline += frameInterval;
        
        // If we're more than 2 frames behind, reset deadline to avoid burst catching up
        now = std::chrono::steady_clock::now();
        if (nextFrameDeadline < now - frameInterval * 2) {
            nextFrameDeadline = now + frameInterval;
        }
    }
}

// ============ CLEANUP ============

void Cleanup() {
    g_recording = false;
    if (g_recordingThread.joinable()) g_recordingThread.join();
    
    if (g_sinkWriter) {
        g_sinkWriter->Finalize();
        g_sinkWriter->Release();
        g_sinkWriter = nullptr;
    }
    if (g_dxgiManager) { g_dxgiManager->Release(); g_dxgiManager = nullptr; }
    if (g_captureTexture) { g_captureTexture->Release(); g_captureTexture = nullptr; }
    if (g_duplication) { g_duplication->Release(); g_duplication = nullptr; }
    if (g_output) { g_output->Release(); g_output = nullptr; }
    if (g_context) { g_context->Release(); g_context = nullptr; }
    if (g_device) { g_device->Release(); g_device = nullptr; }
    
    MFShutdown();
    g_initialized = false;
    g_frameCount = 0;
}

// ============ N-API EXPORTS ============

Napi::Value Init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    int monitor = info.Length() > 0 ? info[0].As<Napi::Number>().Int32Value() : 0;
    
    if (g_initialized) Cleanup();
    
    if (!CreateD3DDevice() || !SetupDXGI(monitor) || !CreateCaptureTexture()) {
        result.Set("success", false);
        result.Set("error", g_lastError);
        return result;
    }
    
    // Test that capture works
    if (!TestCapture()) {
        result.Set("success", false);
        result.Set("error", g_lastError);
        Cleanup();
        return result;
    }
    
    g_initialized = true;
    result.Set("success", true);
    result.Set("width", g_width);
    result.Set("height", g_height);
    result.Set("refreshRate", 60);
    return result;
}

Napi::Value StartRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    if (!g_initialized) {
        result.Set("success", false);
        result.Set("error", "Not initialized");
        return result;
    }
    
    if (g_recording) {
        result.Set("success", true);
        return result;
    }
    
    // Get config from options
    g_fps = 60;
    g_audioEnabled = false;
    g_privacyEnabled = false;
    
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object opts = info[0].As<Napi::Object>();
        if (opts.Has("fps")) {
            int fps = opts.Get("fps").As<Napi::Number>().Int32Value();
            if (fps > 0) g_fps = fps;
        }
        if (opts.Has("audio")) {
            g_audioEnabled = opts.Get("audio").As<Napi::Boolean>().Value();
        }
        if (opts.Has("privacyEnabled")) {
            g_privacyEnabled = opts.Get("privacyEnabled").As<Napi::Boolean>().Value();
        }
    }
    
    // Setup privacy blur resources if enabled
    if (g_privacyEnabled) {
        if (!CreateBlurResources()) {
            result.Set("success", false);
            result.Set("error", g_lastError);
            return result;
        }
    }
    
    // Setup audio capture if enabled
    if (g_audioEnabled) {
        if (!SetupAudio()) {
            std::cout << "[PrivacyRecorder] Audio setup failed: " << g_lastError << std::endl;
            g_audioEnabled = false;  // Continue without audio
        }
    }
    
    // Generate output path
    wchar_t docsPath[MAX_PATH];
    SHGetFolderPathW(nullptr, CSIDL_PERSONAL, nullptr, 0, docsPath);
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    wchar_t filename[256];
    wcsftime(filename, 256, L"\\PrivacyRecording_%Y%m%d_%H%M%S.mp4", localtime(&time));
    std::wstring outputPath = docsPath;
    outputPath += filename;
    
    if (!SetupEncoder(outputPath)) {
        result.Set("success", false);
        result.Set("error", g_lastError);
        return result;
    }
    
    g_recording = true;
    g_frameCount = 0;
    g_audioFrames = 0;
    
    // Initialize blur check for privacy detection
    if (g_privacyEnabled) {
        g_cachedBlurResult = CheckWindowForBlur(GetForegroundWindow());
    }
    
    g_recordingThread = std::thread(RecordingLoop);
    
    // Start audio capture thread if enabled
    if (g_audioEnabled && g_audioClient) {
        g_audioRunning = true;
        g_audioThread = std::thread(AudioCaptureLoop);
    }
    
    std::cout << "[PrivacyRecorder] Recording started at " << g_fps << " FPS"
              << (g_audioEnabled ? " with audio" : "")
              << (g_privacyEnabled ? " with privacy blur" : "") << std::endl;
    result.Set("success", true);
    return result;
}

Napi::Value StopRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    if (!g_recording) {
        result.Set("success", false);
        result.Set("error", "Not recording");
        return result;
    }
    
    // Stop recording
    g_recording = false;
    if (g_recordingThread.joinable()) g_recordingThread.join();
    
    // Stop audio capture
    g_audioRunning = false;
    if (g_audioThread.joinable()) g_audioThread.join();
    
    if (g_sinkWriter) {
        g_sinkWriter->Finalize();
        g_sinkWriter->Release();
        g_sinkWriter = nullptr;
    }
    
    std::cout << "[PrivacyRecorder] Stopped. Frames: " << g_frameCount 
              << ", Audio frames: " << g_audioFrames << std::endl;
    
    result.Set("success", true);
    result.Set("framesRecorded", (double)g_frameCount);
    result.Set("audioFrames", (double)g_audioFrames.load());
    return result;
}

Napi::Value GetStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    result.Set("initialized", (bool)g_initialized);
    result.Set("recording", (bool)g_recording);
    result.Set("framesRecorded", (double)g_frameCount);
    result.Set("width", g_width);
    result.Set("height", g_height);
    result.Set("fps", g_fps);
    
    // Diagnostics
    result.Set("loopIterations", (double)g_loopIterations.load());
    result.Set("captureAttempts", (double)g_captureAttempts.load());
    result.Set("timeouts", (double)g_timeouts.load());
    result.Set("acquireErrors", (double)g_acquireErrors.load());
    result.Set("encodeSuccess", (double)g_encodeSuccess.load());
    
    if (!g_captureError.empty()) {
        result.Set("captureError", g_captureError);
    }
    
    return result;
}

Napi::Value Shutdown(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Cleanup();
    return Napi::Boolean::New(env, true);
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init", Napi::Function::New(env, Init));
    exports.Set("startRecording", Napi::Function::New(env, StartRecording));
    exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
    exports.Set("getStatus", Napi::Function::New(env, GetStatus));
    exports.Set("shutdown", Napi::Function::New(env, Shutdown));
    return exports;
}

NODE_API_MODULE(privacy_recorder, InitModule)

} // namespace PrivacyRecorder
