/**
 * RING BUFFER ENCODER - True H.264 NAL Capture Pipeline
 * 
 * FIXED ZERO-COPY Pipeline:
 *   DXGI Capture (BGRA) → PrivacyBlur (shared) → D3D11 Video Processor (NV12) 
 *   → QSV/NVENC Encoder → H.264 NALs → RingBuffer (dynamic alloc)
 *   
 * On save: Mux NALs to MP4 (no re-encode)
 * 
 * FIXES APPLIED:
 * 1. GPU matching: Capture GPU == Encoder GPU (enforced via adapter selection)
 * 2. Texture pool: 4 NV12 textures, round-robin to avoid reuse conflicts
 * 3. Per-frame samples: Fresh IMFSample + IMFMediaBuffer per frame
 * 4. Async MFT: Drain ALL output before ProcessInput, block on METransformNeedInput
 * 5. Shared blur: Uses PrivacyRecorder's blur system, applied once before encode
 */

#include "recorder_types.h"
#include "video_ring_buffer.h"
#include <mfapi.h>
#include <mfidl.h>
#include <mftransform.h>
#include <strmif.h>
#include <codecapi.h>
#include <d3d11.h>
#include <d3d11_1.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>
#include <thread>
#include <atomic>
#include <chrono>
#include <vector>
#include <iostream>
#include <iomanip>

namespace RingBufferEncoder {

// ============ CONSTANTS ============
static constexpr int NV12_POOL_SIZE = 4;  // Texture pool - 4 is sufficient for async MFT with proper drain
static constexpr UINT32 BITRATE = 2500000;  // 2.5 Mbps for ring buffer
static constexpr DWORD ASYNC_WAIT_TIMEOUT_MS = 5;  // Very short - don't wait long, encoder buffers multiple frames

// ============ STATE ============
static ID3D11Device* g_device = nullptr;
static ID3D11DeviceContext* g_context = nullptr;
static IDXGIAdapter* g_selectedAdapter = nullptr;  // Track which adapter we're using
static IDXGIOutputDuplication* g_duplication = nullptr;

// Textures
static ID3D11Texture2D* g_captureTexture = nullptr;     // BGRA from DXGI
static ID3D11Texture2D* g_blurredTexture = nullptr;     // BGRA after blur
static ID3D11Texture2D* g_nv12Pool[NV12_POOL_SIZE] = {nullptr};  // NV12 texture pool
static int g_poolIndex = 0;

// Blur shader resources (LAZY-CREATED - only allocated when blur is first needed)
static ID3D11ComputeShader* g_blurShader = nullptr;
static ID3D11UnorderedAccessView* g_blurUAV = nullptr;
static ID3D11ShaderResourceView* g_captureSRV = nullptr;
static bool g_blurResourcesCreated = false;  // Track lazy blur resource creation

// D3D11 Video Processor (GPU color conversion: BGRA → NV12)
static ID3D11VideoDevice* g_videoDevice = nullptr;
static ID3D11VideoContext* g_videoContext = nullptr;
static ID3D11VideoProcessor* g_videoProcessor = nullptr;
static ID3D11VideoProcessorEnumerator* g_vpEnum = nullptr;
static ID3D11VideoProcessorInputView* g_vpInputView = nullptr;        // Reads from blurredTexture (blur path)
static ID3D11VideoProcessorInputView* g_vpInputViewDirect = nullptr;  // Reads from captureTexture (no-blur path)
static ID3D11VideoProcessorOutputView* g_vpOutputViews[NV12_POOL_SIZE] = {nullptr};

// MFT Encoder
static IMFDXGIDeviceManager* g_dxgiManager = nullptr;
static UINT g_resetToken = 0;
static IMFTransform* g_encoder = nullptr;
static IMFMediaEventGenerator* g_eventGen = nullptr;
static DWORD g_inputStreamId = 0;
static DWORD g_outputStreamId = 0;
static bool g_isAsyncMFT = false;

// Thread state
static std::thread g_captureThread;
static std::atomic<bool> g_capturing{false};
static UINT32 g_width = 0;
static UINT32 g_height = 0;
static std::atomic<uint64_t> g_frameCount{0};
static bool g_mfStarted = false;
static bool g_initialized = false;

// Timing
static std::chrono::steady_clock::time_point g_recordingStartTime;
static int64_t g_recordingStartEpochMs = 0;  // Wall-clock epoch time for log correlation

// High-resolution waitable timer for frame pacing (replaces busy-wait)
static HANDLE g_frameTimer = nullptr;

// Try to create a high-res timer; returns nullptr on failure (old Windows)
static HANDLE CreateHighResTimer() {
    // CREATE_WAITABLE_TIMER_HIGH_RESOLUTION = 0x00000002 (Windows 10 1803+)
    HANDLE h = CreateWaitableTimerExW(nullptr, nullptr, 0x00000002, TIMER_ALL_ACCESS);
    if (h) {
        std::cout << "[RingBufferEncoder] Using high-resolution waitable timer" << std::endl;
    } else {
        // Fallback: standard waitable timer
        h = CreateWaitableTimerW(nullptr, TRUE, nullptr);
        if (h) {
            std::cout << "[RingBufferEncoder] Using standard waitable timer (fallback)" << std::endl;
        }
    }
    return h;
}

// Sleep using waitable timer for sub-ms precision without CPU spin
static void PrecisionSleep(HANDLE timer, std::chrono::microseconds duration) {
    if (!timer || duration.count() <= 0) return;
    
    // SetWaitableTimer uses 100-nanosecond intervals, negative = relative
    LARGE_INTEGER dueTime;
    dueTime.QuadPart = -(static_cast<int64_t>(duration.count()) * 10);  // us -> 100ns
    
    if (SetWaitableTimer(timer, &dueTime, 0, nullptr, nullptr, FALSE)) {
        WaitForSingleObject(timer, static_cast<DWORD>(duration.count() / 1000 + 2));  // +2ms safety margin
    } else {
        // Fallback to sleep_for
        std::this_thread::sleep_for(duration);
    }
}

// Configurable FPS
static int g_fps = 60;

// SPS/PPS storage for MP4 muxing
static std::vector<uint8_t> g_sps;
static std::vector<uint8_t> g_pps;
static bool g_headersCaptured = false;

// ============ FORWARD DECLARATIONS ============
static void ProcessEncoderOutput(int64_t timestamp);
static bool DrainAllEncoderOutput(int64_t timestamp, bool waitForOutput = false);
static bool WaitForInputReady(DWORD timeoutMs);

// ============ BLUR SHADER CODE ============
static const char* g_blurShaderCode = R"(
Texture2D<float4> inputTex : register(t0);
RWTexture2D<float4> outputTex : register(u0);

static const float weights[5] = { 0.06, 0.24, 0.40, 0.24, 0.06 };

[numthreads(16, 16, 1)]
void CSMain(uint3 id : SV_DispatchThreadID) {
    uint width, height;
    outputTex.GetDimensions(width, height);
    
    if (id.x >= width || id.y >= height) return;
    
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

// ============ CLEANUP ============
static void CleanupAll() {
    if (g_eventGen) { g_eventGen->Release(); g_eventGen = nullptr; }
    if (g_encoder) { g_encoder->Release(); g_encoder = nullptr; }
    
    for (int i = 0; i < NV12_POOL_SIZE; i++) {
        if (g_vpOutputViews[i]) { g_vpOutputViews[i]->Release(); g_vpOutputViews[i] = nullptr; }
        if (g_nv12Pool[i]) { g_nv12Pool[i]->Release(); g_nv12Pool[i] = nullptr; }
    }
    
    if (g_vpInputViewDirect) { g_vpInputViewDirect->Release(); g_vpInputViewDirect = nullptr; }
    if (g_vpInputView) { g_vpInputView->Release(); g_vpInputView = nullptr; }
    if (g_videoProcessor) { g_videoProcessor->Release(); g_videoProcessor = nullptr; }
    if (g_vpEnum) { g_vpEnum->Release(); g_vpEnum = nullptr; }
    if (g_videoContext) { g_videoContext->Release(); g_videoContext = nullptr; }
    if (g_videoDevice) { g_videoDevice->Release(); g_videoDevice = nullptr; }
    if (g_dxgiManager) { g_dxgiManager->Release(); g_dxgiManager = nullptr; }
    
    // Cleanup blur resources (may not have been created if blur was never triggered)
    if (g_blurShader) { g_blurShader->Release(); g_blurShader = nullptr; }
    if (g_blurUAV) { g_blurUAV->Release(); g_blurUAV = nullptr; }
    if (g_captureSRV) { g_captureSRV->Release(); g_captureSRV = nullptr; }
    if (g_blurredTexture) { g_blurredTexture->Release(); g_blurredTexture = nullptr; }
    g_blurResourcesCreated = false;
    
    if (g_captureTexture) { g_captureTexture->Release(); g_captureTexture = nullptr; }
    if (g_duplication) { g_duplication->Release(); g_duplication = nullptr; }
    if (g_context) { g_context->Release(); g_context = nullptr; }
    if (g_device) { g_device->Release(); g_device = nullptr; }
    if (g_selectedAdapter) { g_selectedAdapter->Release(); g_selectedAdapter = nullptr; }
    if (g_mfStarted) { MFShutdown(); g_mfStarted = false; }
    
    // NOTE: DO NOT clear g_sps, g_pps, g_headersCaptured here!
    // They are needed for MP4 muxing AFTER stop is called.
    // They get cleared in ClearHeaders() which is called when starting a new recording.
    
    g_poolIndex = 0;
    g_initialized = false;
}

// Clear SPS/PPS headers (called when starting new recording)
static void ClearHeaders() {
    g_sps.clear();
    g_pps.clear();
    g_headersCaptured = false;
}

// ============ GPU ADAPTER SELECTION ============
// Selects an adapter that has BOTH display output AND hardware encoder
static IDXGIAdapter* SelectEncoderAdapter() {
    IDXGIFactory1* factory = nullptr;
    HRESULT hr = CreateDXGIFactory1(__uuidof(IDXGIFactory1), (void**)&factory);
    if (FAILED(hr)) return nullptr;
    
    IDXGIAdapter* bestAdapter = nullptr;
    IDXGIAdapter* adapter = nullptr;
    bool foundIntel = false;
    bool foundNvidia = false;
    
    std::cout << "[RingBufferEncoder] Enumerating GPU adapters..." << std::endl;
    
    for (UINT i = 0; factory->EnumAdapters(i, &adapter) != DXGI_ERROR_NOT_FOUND; i++) {
        DXGI_ADAPTER_DESC desc;
        adapter->GetDesc(&desc);
        
        std::wcout << L"[RingBufferEncoder] Adapter " << i << L": " << desc.Description << std::endl;
        
        // Check if adapter has display outputs
        IDXGIOutput* output = nullptr;
        bool hasOutput = (adapter->EnumOutputs(0, &output) == S_OK);
        if (output) output->Release();
        
        if (!hasOutput) {
            std::wcout << L"[RingBufferEncoder]   - No display output, skipping" << std::endl;
            adapter->Release();
            continue;
        }
        
        // Prefer Intel (QSV) > NVIDIA (NVENC) > Other
        if (wcsstr(desc.Description, L"Intel") != nullptr) {
            if (bestAdapter && !foundIntel) bestAdapter->Release();
            bestAdapter = adapter;
            foundIntel = true;
            std::wcout << L"[RingBufferEncoder]   - Selected (Intel QSV preferred)" << std::endl;
        } else if (wcsstr(desc.Description, L"NVIDIA") != nullptr && !foundIntel) {
            if (bestAdapter) bestAdapter->Release();
            bestAdapter = adapter;
            foundNvidia = true;
            std::wcout << L"[RingBufferEncoder]   - Selected (NVIDIA NVENC)" << std::endl;
        } else if (!bestAdapter) {
            bestAdapter = adapter;
            std::wcout << L"[RingBufferEncoder]   - Selected (fallback)" << std::endl;
        } else {
            adapter->Release();
        }
    }
    
    factory->Release();
    return bestAdapter;
}

// ============ CREATE D3D DEVICE ON SPECIFIC ADAPTER ============
static bool CreateDeviceOnAdapter(IDXGIAdapter* adapter) {
    D3D_FEATURE_LEVEL featureLevels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0
    };
    D3D_FEATURE_LEVEL featureLevel;
    
    HRESULT hr = D3D11CreateDevice(
        adapter,
        D3D_DRIVER_TYPE_UNKNOWN,  // Must use UNKNOWN when specifying adapter
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
        featureLevels, 2,
        D3D11_SDK_VERSION,
        &g_device,
        &featureLevel,
        &g_context
    );
    
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create D3D11 device: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    // Enable multithread protection
    ID3D10Multithread* mt = nullptr;
    if (SUCCEEDED(g_device->QueryInterface(__uuidof(ID3D10Multithread), (void**)&mt))) {
        mt->SetMultithreadProtected(TRUE);
        mt->Release();
    }
    
    return true;
}

// ============ FIND HARDWARE ENCODER ON SAME GPU ============
static IMFTransform* FindHardwareEncoder() {
    IMFActivate** activates = nullptr;
    UINT32 count = 0;
    
    MFT_REGISTER_TYPE_INFO inputType = { MFMediaType_Video, MFVideoFormat_NV12 };
    MFT_REGISTER_TYPE_INFO outputType = { MFMediaType_Video, MFVideoFormat_H264 };
    
    HRESULT hr = MFTEnumEx(
        MFT_CATEGORY_VIDEO_ENCODER,
        MFT_ENUM_FLAG_HARDWARE | MFT_ENUM_FLAG_SORTANDFILTER,
        &inputType, &outputType,
        &activates, &count
    );
    
    if (FAILED(hr) || count == 0) {
        std::cerr << "[RingBufferEncoder] No hardware H.264 encoders found" << std::endl;
        return nullptr;
    }
    
    IMFTransform* encoder = nullptr;
    
    // Get adapter description for matching
    DXGI_ADAPTER_DESC adapterDesc;
    g_selectedAdapter->GetDesc(&adapterDesc);
    
    std::wcout << L"[RingBufferEncoder] Looking for encoder matching GPU: " << adapterDesc.Description << std::endl;
    
    for (UINT32 i = 0; i < count; i++) {
        LPWSTR name = nullptr;
        if (SUCCEEDED(activates[i]->GetAllocatedString(MFT_FRIENDLY_NAME_Attribute, &name, nullptr))) {
            std::wcout << L"[RingBufferEncoder] Found encoder: " << name << std::endl;
            
            // Match GPU vendor
            bool isMatch = false;
            if (wcsstr(adapterDesc.Description, L"Intel") && wcsstr(name, L"Intel")) {
                isMatch = true;
            } else if (wcsstr(adapterDesc.Description, L"NVIDIA") && wcsstr(name, L"NVIDIA")) {
                isMatch = true;
            } else if (wcsstr(adapterDesc.Description, L"AMD") && wcsstr(name, L"AMD")) {
                isMatch = true;
            }
            
            if (isMatch) {
                if (SUCCEEDED(activates[i]->ActivateObject(__uuidof(IMFTransform), (void**)&encoder))) {
                    std::wcout << L"[RingBufferEncoder] Using matched encoder: " << name << std::endl;
                    CoTaskMemFree(name);
                    break;
                }
            }
            CoTaskMemFree(name);
        }
    }
    
    // Fallback to first available if no match
    if (!encoder && count > 0) {
        activates[0]->ActivateObject(__uuidof(IMFTransform), (void**)&encoder);
        std::cout << "[RingBufferEncoder] Warning: Using first available encoder (GPU mismatch possible)" << std::endl;
    }
    
    for (UINT32 i = 0; i < count; i++) {
        activates[i]->Release();
    }
    CoTaskMemFree(activates);
    
    return encoder;
}

// ============ CREATE NV12 TEXTURE POOL ============
static bool CreateTexturePool() {
    D3D11_TEXTURE2D_DESC nv12Desc = {};
    nv12Desc.Width = g_width;
    nv12Desc.Height = g_height;
    nv12Desc.MipLevels = 1;
    nv12Desc.ArraySize = 1;
    nv12Desc.Format = DXGI_FORMAT_NV12;
    nv12Desc.SampleDesc.Count = 1;
    nv12Desc.Usage = D3D11_USAGE_DEFAULT;
    nv12Desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_VIDEO_ENCODER;
    nv12Desc.MiscFlags = 0;
    
    for (int i = 0; i < NV12_POOL_SIZE; i++) {
        HRESULT hr = g_device->CreateTexture2D(&nv12Desc, nullptr, &g_nv12Pool[i]);
        if (FAILED(hr)) {
            std::cerr << "[RingBufferEncoder] Failed to create NV12 texture " << i 
                      << ": 0x" << std::hex << hr << std::endl;
            return false;
        }
    }
    
    std::cout << "[RingBufferEncoder] Created NV12 texture pool (" << NV12_POOL_SIZE << " textures)" << std::endl;
    return true;
}

// ============ CREATE VIDEO PROCESSOR ============
static bool CreateVideoProcessor() {
    HRESULT hr = g_device->QueryInterface(__uuidof(ID3D11VideoDevice), (void**)&g_videoDevice);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to get ID3D11VideoDevice" << std::endl;
        return false;
    }
    
    hr = g_context->QueryInterface(__uuidof(ID3D11VideoContext), (void**)&g_videoContext);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to get ID3D11VideoContext" << std::endl;
        return false;
    }
    
    D3D11_VIDEO_PROCESSOR_CONTENT_DESC contentDesc = {};
    contentDesc.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    contentDesc.InputWidth = g_width;
    contentDesc.InputHeight = g_height;
    contentDesc.OutputWidth = g_width;
    contentDesc.OutputHeight = g_height;
    contentDesc.Usage = D3D11_VIDEO_USAGE_PLAYBACK_NORMAL;
    
    hr = g_videoDevice->CreateVideoProcessorEnumerator(&contentDesc, &g_vpEnum);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create VP enumerator: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    hr = g_videoDevice->CreateVideoProcessor(g_vpEnum, 0, &g_videoProcessor);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create video processor: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC inputViewDesc = {};
    inputViewDesc.FourCC = 0;
    inputViewDesc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    inputViewDesc.Texture2D.MipSlice = 0;
    inputViewDesc.Texture2D.ArraySlice = 0;
    
    // DIRECT input view - reads from captureTexture (no-blur fast path)
    hr = g_videoDevice->CreateVideoProcessorInputView(g_captureTexture, g_vpEnum, &inputViewDesc, &g_vpInputViewDirect);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create VP direct input view: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    // NOTE: g_vpInputView (blur path) is created lazily in EnsureBlurResources()
    // when blur is first needed. This saves ~8MB VRAM when blur is never triggered.
    
    // Output views for each NV12 texture in pool
    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC outputViewDesc = {};
    outputViewDesc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    outputViewDesc.Texture2D.MipSlice = 0;
    
    for (int i = 0; i < NV12_POOL_SIZE; i++) {
        hr = g_videoDevice->CreateVideoProcessorOutputView(g_nv12Pool[i], g_vpEnum, &outputViewDesc, &g_vpOutputViews[i]);
        if (FAILED(hr)) {
            std::cerr << "[RingBufferEncoder] Failed to create VP output view " << i 
                      << ": 0x" << std::hex << hr << std::endl;
            return false;
        }
    }
    
    std::cout << "[RingBufferEncoder] Video processor created with dual input path (BGRA → NV12)" << std::endl;
    return true;
}

// ============ LAZY BLUR RESOURCE CREATION ============
// Only called when PrivacyRecorder::ShouldApplyBlur() first returns true.
// Saves ~8MB VRAM + shader compile time when blur is never triggered.
static bool EnsureBlurResources() {
    if (g_blurResourcesCreated) return true;
    
    std::cout << "[RingBufferEncoder] Blur detected - creating blur resources (lazy init)..." << std::endl;
    
    // Create blurred texture (blur output, VP input for blur path)
    D3D11_TEXTURE2D_DESC desc = {};
    desc.Width = g_width;
    desc.Height = g_height;
    desc.MipLevels = 1;
    desc.ArraySize = 1;
    desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    desc.SampleDesc.Count = 1;
    desc.Usage = D3D11_USAGE_DEFAULT;
    desc.BindFlags = D3D11_BIND_UNORDERED_ACCESS | D3D11_BIND_SHADER_RESOURCE | D3D11_BIND_RENDER_TARGET;
    desc.MiscFlags = 0;
    
    HRESULT hr = g_device->CreateTexture2D(&desc, nullptr, &g_blurredTexture);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create blurred texture: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    // SRV for capture texture (blur shader input)
    D3D11_SHADER_RESOURCE_VIEW_DESC srvDesc = {};
    srvDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    srvDesc.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
    srvDesc.Texture2D.MipLevels = 1;
    
    hr = g_device->CreateShaderResourceView(g_captureTexture, &srvDesc, &g_captureSRV);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create capture SRV: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    // UAV for blurred texture (blur shader output)
    D3D11_UNORDERED_ACCESS_VIEW_DESC uavDesc = {};
    uavDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    uavDesc.ViewDimension = D3D11_UAV_DIMENSION_TEXTURE2D;
    
    hr = g_device->CreateUnorderedAccessView(g_blurredTexture, &uavDesc, &g_blurUAV);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create blur UAV: 0x" << std::hex << hr << std::endl;
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
            std::cerr << "[RingBufferEncoder] Blur shader compile error: " 
                      << (char*)errorBlob->GetBufferPointer() << std::endl;
            errorBlob->Release();
        }
        return false;
    }
    
    hr = g_device->CreateComputeShader(shaderBlob->GetBufferPointer(), 
                                        shaderBlob->GetBufferSize(), nullptr, &g_blurShader);
    shaderBlob->Release();
    if (errorBlob) errorBlob->Release();
    
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create blur shader: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    // Create VP input view for blurredTexture (blur path)
    D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC inputViewDesc = {};
    inputViewDesc.FourCC = 0;
    inputViewDesc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
    inputViewDesc.Texture2D.MipSlice = 0;
    inputViewDesc.Texture2D.ArraySlice = 0;
    
    hr = g_videoDevice->CreateVideoProcessorInputView(g_blurredTexture, g_vpEnum, &inputViewDesc, &g_vpInputView);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create VP blur input view: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    g_blurResourcesCreated = true;
    std::cout << "[RingBufferEncoder] Blur resources created (lazy, saved ~8MB VRAM until now)" << std::endl;
    return true;
}

// ============ CONFIGURE ENCODER ============
static bool ConfigureEncoder() {
    if (!g_encoder) return false;
    
    HRESULT hr;
    
    // Unlock async MFT if needed
    IMFAttributes* attrs = nullptr;
    hr = g_encoder->GetAttributes(&attrs);
    if (SUCCEEDED(hr) && attrs) {
        UINT32 isAsync = 0;
        if (SUCCEEDED(attrs->GetUINT32(MF_TRANSFORM_ASYNC, &isAsync)) && isAsync) {
            attrs->SetUINT32(MF_TRANSFORM_ASYNC_UNLOCK, TRUE);
            g_isAsyncMFT = true;
            
            hr = g_encoder->QueryInterface(__uuidof(IMFMediaEventGenerator), (void**)&g_eventGen);
            if (SUCCEEDED(hr)) {
                std::cout << "[RingBufferEncoder] Async MFT unlocked with event generator" << std::endl;
            } else {
                std::cout << "[RingBufferEncoder] Async MFT unlocked (no event generator)" << std::endl;
                g_eventGen = nullptr;
            }
        }
        attrs->Release();
    }
    
    // Get stream IDs
    DWORD inputCount = 0, outputCount = 0;
    g_encoder->GetStreamCount(&inputCount, &outputCount);
    
    DWORD* inputIds = new DWORD[inputCount];
    DWORD* outputIds = new DWORD[outputCount];
    if (SUCCEEDED(g_encoder->GetStreamIDs(inputCount, inputIds, outputCount, outputIds))) {
        g_inputStreamId = inputIds[0];
        g_outputStreamId = outputIds[0];
    } else {
        g_inputStreamId = 0;
        g_outputStreamId = 0;
    }
    delete[] inputIds;
    delete[] outputIds;
    
    // Set D3D manager for zero-copy
    hr = g_encoder->ProcessMessage(MFT_MESSAGE_SET_D3D_MANAGER, (ULONG_PTR)g_dxgiManager);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Warning: Failed to set D3D manager: 0x" 
                  << std::hex << hr << std::dec << std::endl;
    } else {
        std::cout << "[RingBufferEncoder] D3D manager set on encoder" << std::endl;
    }
    
    // Output type (H.264)
    IMFMediaType* outputType = nullptr;
    MFCreateMediaType(&outputType);
    outputType->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video);
    outputType->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264);
    outputType->SetUINT32(MF_MT_AVG_BITRATE, BITRATE);
    outputType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
    MFSetAttributeSize(outputType, MF_MT_FRAME_SIZE, g_width, g_height);
    MFSetAttributeRatio(outputType, MF_MT_FRAME_RATE, g_fps, 1);
    MFSetAttributeRatio(outputType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
    outputType->SetUINT32(MF_MT_MPEG2_PROFILE, eAVEncH264VProfile_Main);
    
    hr = g_encoder->SetOutputType(g_outputStreamId, outputType, 0);
    outputType->Release();
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] SetOutputType failed: 0x" << std::hex << hr << std::dec << std::endl;
        return false;
    }
    
    // Input type - enumerate and use NV12
    bool inputTypeSet = false;
    for (DWORD typeIndex = 0; typeIndex < 20; typeIndex++) {
        IMFMediaType* availableType = nullptr;
        hr = g_encoder->GetInputAvailableType(g_inputStreamId, typeIndex, &availableType);
        if (hr == MF_E_NO_MORE_TYPES) break;
        if (FAILED(hr)) break;
        
        GUID subtype = {0};
        availableType->GetGUID(MF_MT_SUBTYPE, &subtype);
        
        if (subtype == MFVideoFormat_NV12 && !inputTypeSet) {
            MFSetAttributeSize(availableType, MF_MT_FRAME_SIZE, g_width, g_height);
            MFSetAttributeRatio(availableType, MF_MT_FRAME_RATE, g_fps, 1);
            MFSetAttributeRatio(availableType, MF_MT_PIXEL_ASPECT_RATIO, 1, 1);
            availableType->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive);
            
            hr = g_encoder->SetInputType(g_inputStreamId, availableType, 0);
            if (SUCCEEDED(hr)) {
                std::cout << "[RingBufferEncoder] Input type set: NV12 " 
                          << g_width << "x" << g_height << std::endl;
                inputTypeSet = true;
            }
        }
        availableType->Release();
        if (inputTypeSet) break;
    }
    
    if (!inputTypeSet) {
        std::cerr << "[RingBufferEncoder] No compatible input type found" << std::endl;
        return false;
    }
    
    // Configure encoder settings via CodecAPI for precise control
    ICodecAPI* codecApi = nullptr;
    if (SUCCEEDED(g_encoder->QueryInterface(__uuidof(ICodecAPI), (void**)&codecApi))) {
        VARIANT var;
        VariantInit(&var);
        
        // Enable low latency mode
        var.vt = VT_BOOL;
        var.boolVal = VARIANT_TRUE;
        codecApi->SetValue(&CODECAPI_AVLowLatencyMode, &var);
        
        // Set CBR (Constant Bit Rate) mode for predictable output
        var.vt = VT_UI4;
        var.ulVal = eAVEncCommonRateControlMode_CBR;
        HRESULT hrRate = codecApi->SetValue(&CODECAPI_AVEncCommonRateControlMode, &var);
        if (SUCCEEDED(hrRate)) {
            std::cout << "[RingBufferEncoder] Rate control: CBR enabled" << std::endl;
        }
        
        // Explicitly set mean bitrate
        var.vt = VT_UI4;
        var.ulVal = BITRATE;
        HRESULT hrBitrate = codecApi->SetValue(&CODECAPI_AVEncCommonMeanBitRate, &var);
        if (SUCCEEDED(hrBitrate)) {
            std::cout << "[RingBufferEncoder] Mean bitrate set: " << (BITRATE/1000) << " kbps" << std::endl;
        }
        
        // Keyframe every 2 seconds (120 frames at 60fps)
        var.vt = VT_UI4;
        var.ulVal = g_fps * 2;
        codecApi->SetValue(&CODECAPI_AVEncMPVGOPSize, &var);
        
        codecApi->Release();
    } else {
        std::cerr << "[RingBufferEncoder] Warning: Could not get CodecAPI, using default encoder settings" << std::endl;
    }
    
    // Start encoder
    hr = g_encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_BEGIN_STREAMING, 0);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Begin streaming failed: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    hr = g_encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_START_OF_STREAM, 0);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Start of stream failed: 0x" << std::hex << hr << std::endl;
        return false;
    }
    
    std::cout << "[RingBufferEncoder] Encoder configured: " << g_width << "x" << g_height 
              << " @ " << g_fps << "fps, " << (BITRATE/1000) << " kbps" << std::endl;
    
    return true;
}

// ============ INITIALIZE ============
static bool Initialize() {
    if (g_initialized) return true;
    
    HRESULT hr = MFStartup(MF_VERSION);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] MFStartup failed" << std::endl;
        return false;
    }
    g_mfStarted = true;
    
    // Step 1: Select GPU adapter with encoder support
    g_selectedAdapter = SelectEncoderAdapter();
    if (!g_selectedAdapter) {
        std::cerr << "[RingBufferEncoder] No suitable GPU adapter found" << std::endl;
        CleanupAll();
        return false;
    }
    
    // Step 2: Create D3D device on selected adapter
    if (!CreateDeviceOnAdapter(g_selectedAdapter)) {
        CleanupAll();
        return false;
    }
    
    // Step 3: Setup DXGI duplication on same adapter
    IDXGIOutput* output = nullptr;
    hr = g_selectedAdapter->EnumOutputs(0, &output);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] No display output on selected adapter" << std::endl;
        CleanupAll();
        return false;
    }
    
    IDXGIOutput1* output1 = nullptr;
    hr = output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&output1);
    output->Release();
    if (FAILED(hr)) {
        CleanupAll();
        return false;
    }
    
    hr = output1->DuplicateOutput(g_device, &g_duplication);
    output1->Release();
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] DuplicateOutput failed: 0x" << std::hex << hr << std::endl;
        CleanupAll();
        return false;
    }
    
    // Get dimensions
    DXGI_OUTDUPL_DESC desc;
    g_duplication->GetDesc(&desc);
    g_width = desc.ModeDesc.Width;
    g_height = desc.ModeDesc.Height;
    std::cout << "[RingBufferEncoder] Display: " << g_width << "x" << g_height << std::endl;
    
    // Step 4: Create BGRA capture texture
    D3D11_TEXTURE2D_DESC texDesc = {};
    texDesc.Width = g_width;
    texDesc.Height = g_height;
    texDesc.MipLevels = 1;
    texDesc.ArraySize = 1;
    texDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    texDesc.SampleDesc.Count = 1;
    texDesc.Usage = D3D11_USAGE_DEFAULT;
    texDesc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    texDesc.MiscFlags = 0;
    
    hr = g_device->CreateTexture2D(&texDesc, nullptr, &g_captureTexture);
    if (FAILED(hr)) {
        std::cerr << "[RingBufferEncoder] Failed to create capture texture" << std::endl;
        CleanupAll();
        return false;
    }
    
    // Step 5: SKIP blur resources (lazy-created when first needed)
    // Saves ~8MB VRAM + shader compile time when blur is never triggered
    
    // Step 6: Create NV12 texture pool
    if (!CreateTexturePool()) {
        CleanupAll();
        return false;
    }
    
    // Step 7: Create video processor with dual input path (BGRA → NV12)
    if (!CreateVideoProcessor()) {
        CleanupAll();
        return false;
    }
    
    // Step 8: Create DXGI device manager
    hr = MFCreateDXGIDeviceManager(&g_resetToken, &g_dxgiManager);
    if (FAILED(hr)) {
        CleanupAll();
        return false;
    }
    hr = g_dxgiManager->ResetDevice(g_device, g_resetToken);
    if (FAILED(hr)) {
        CleanupAll();
        return false;
    }
    
    // Step 9: Find and configure encoder on same GPU
    g_encoder = FindHardwareEncoder();
    if (!g_encoder) {
        CleanupAll();
        return false;
    }
    
    if (!ConfigureEncoder()) {
        CleanupAll();
        return false;
    }
    
    g_initialized = true;
    std::cout << "[RingBufferEncoder] Initialized - Zero-copy pipeline ready (blur=lazy, pool=" 
              << NV12_POOL_SIZE << ")" << std::endl;
    return true;
}

// ============ APPLY BLUR (GPU COMPUTE SHADER) ============
static void ApplyBlur() {
    g_context->CSSetShader(g_blurShader, nullptr, 0);
    g_context->CSSetShaderResources(0, 1, &g_captureSRV);
    g_context->CSSetUnorderedAccessViews(0, 1, &g_blurUAV, nullptr);
    
    UINT groupsX = (g_width + 15) / 16;
    UINT groupsY = (g_height + 15) / 16;
    g_context->Dispatch(groupsX, groupsY, 1);
    
    // Unbind
    ID3D11UnorderedAccessView* nullUAV = nullptr;
    ID3D11ShaderResourceView* nullSRV = nullptr;
    g_context->CSSetUnorderedAccessViews(0, 1, &nullUAV, nullptr);
    g_context->CSSetShaderResources(0, 1, &nullSRV);
}

// ============ CONVERT BGRA TO NV12 (GPU) ============
// useBlurred: true = read from blurredTexture (blur path), false = read from captureTexture (direct path)
static void ConvertBGRAtoNV12(int poolIdx, bool useBlurred) {
    D3D11_VIDEO_PROCESSOR_STREAM stream = {};
    stream.Enable = TRUE;
    // Dual input path: skip blurredTexture copy when blur is not active
    stream.pInputSurface = useBlurred ? g_vpInputView : g_vpInputViewDirect;
    
    g_videoContext->VideoProcessorBlt(g_videoProcessor, g_vpOutputViews[poolIdx], 0, 1, &stream);
}

// ============ CREATE FRESH SAMPLE FOR FRAME ============
static IMFSample* CreateFrameSample(int poolIdx, int64_t timestamp, int64_t duration) {
    IMFSample* sample = nullptr;
    HRESULT hr = MFCreateSample(&sample);
    if (FAILED(hr)) return nullptr;
    
    // Create fresh DXGI surface buffer for this frame's NV12 texture
    IMFMediaBuffer* buffer = nullptr;
    hr = MFCreateDXGISurfaceBuffer(__uuidof(ID3D11Texture2D), g_nv12Pool[poolIdx], 0, FALSE, &buffer);
    if (FAILED(hr)) {
        sample->Release();
        return nullptr;
    }
    
    // Set buffer length (NV12 = width * height * 1.5)
    DWORD nv12Size = g_width * g_height * 3 / 2;
    buffer->SetCurrentLength(nv12Size);
    
    hr = sample->AddBuffer(buffer);
    buffer->Release();  // Sample now owns the buffer
    
    if (FAILED(hr)) {
        sample->Release();
        return nullptr;
    }
    
    sample->SetSampleTime(timestamp);
    sample->SetSampleDuration(duration);
    
    return sample;
}

// ============ EXTRACT SPS/PPS FROM NAL ============
static void ExtractSPSPPS(const uint8_t* data, size_t size) {
    if (g_headersCaptured || !data || size < 5) return;
    
    // Scan for NAL units
    size_t i = 0;
    while (i < size - 4) {
        if (data[i] == 0 && data[i+1] == 0) {
            size_t startCodeLen = 0;
            if (data[i+2] == 1) {
                startCodeLen = 3;
            } else if (data[i+2] == 0 && i + 3 < size && data[i+3] == 1) {
                startCodeLen = 4;
            }
            
            if (startCodeLen > 0) {
                size_t nalStart = i + startCodeLen;
                if (nalStart >= size) break;
                
                uint8_t nalType = data[nalStart] & 0x1F;
                
                // Find end of this NAL
                size_t nalEnd = size;
                for (size_t j = nalStart + 1; j < size - 3; j++) {
                    if (data[j] == 0 && data[j+1] == 0 && (data[j+2] == 1 || (data[j+2] == 0 && data[j+3] == 1))) {
                        nalEnd = j;
                        break;
                    }
                }
                
                // SPS = 7, PPS = 8
                if (nalType == 7 && g_sps.empty()) {
                    g_sps.assign(data + nalStart, data + nalEnd);
                    std::cout << "[RingBufferEncoder] Captured SPS (" << g_sps.size() << " bytes)" << std::endl;
                } else if (nalType == 8 && g_pps.empty()) {
                    g_pps.assign(data + nalStart, data + nalEnd);
                    std::cout << "[RingBufferEncoder] Captured PPS (" << g_pps.size() << " bytes)" << std::endl;
                }
                
                if (!g_sps.empty() && !g_pps.empty()) {
                    g_headersCaptured = true;
                    return;
                }
                
                i = nalEnd;
                continue;
            }
        }
        i++;
    }
}

// Track if first frame has been submitted
static std::atomic<bool> g_firstFrameSubmitted{false};

// ============ WAIT FOR INPUT READY (ASYNC MFT) ============
static bool WaitForInputReady(DWORD timeoutMs) {
    if (!g_isAsyncMFT) return true;  // Sync MFT always ready
    if (!g_eventGen) {
        // No event generator - try ProcessInput directly
        return true;
    }
    
    // For first few frames after BEGIN_STREAMING, try immediately
    // Many async MFTs accept input right away before firing METransformNeedInput
    if (!g_firstFrameSubmitted.load()) {
        return true;
    }
    
    // Quick non-blocking check for events
    DWORD waited = 0;
    const DWORD pollInterval = 1;  // Fast polling - 1ms
    
    while (waited < timeoutMs) {
        IMFMediaEvent* event = nullptr;
        HRESULT hr = g_eventGen->GetEvent(MF_EVENT_FLAG_NO_WAIT, &event);
        
        if (hr == MF_E_NO_EVENTS_AVAILABLE) {
            // No events - encoder might be processing
            // Try ProcessInput anyway - hardware encoders usually buffer multiple frames
            if (waited >= 2) {
                return true;  // After brief wait, just try input
            }
            Sleep(pollInterval);
            waited += pollInterval;
            continue;
        }
        
        if (SUCCEEDED(hr) && event) {
            MediaEventType type;
            event->GetType(&type);
            event->Release();
            
            if (type == METransformNeedInput) {
                return true;
            }
            if (type == METransformHaveOutput) {
                // Process output while waiting
                auto now = std::chrono::steady_clock::now();
                auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(now - g_recordingStartTime);
                ProcessEncoderOutput(elapsed.count() / 100);
                continue;  // Keep checking for METransformNeedInput
            }
            // Other event types, continue waiting
            continue;
        }
        
        Sleep(pollInterval);
        waited += pollInterval;
    }
    
    // Timeout - try anyway, ProcessInput will tell us if it's not ready
    return true;
}

// ============ DRAIN ALL ENCODER OUTPUT ============
static bool DrainAllEncoderOutput(int64_t timestamp, bool waitForOutput) {
    if (g_isAsyncMFT && g_eventGen) {
        // For async MFT: process events non-blocking to keep up with capture rate
        IMFMediaEvent* event = nullptr;
        bool gotOutput = false;
        bool gotNeedInput = false;
        int waitAttempts = 0;
        // Use shorter waits to maintain frame rate
        const int maxWaitAttempts = waitForOutput ? 30 : 3;  // 30ms max wait when blocking, 3ms otherwise
        
        while (waitAttempts < maxWaitAttempts && !gotNeedInput) {
            HRESULT hr = g_eventGen->GetEvent(MF_EVENT_FLAG_NO_WAIT, &event);
            
            if (hr == MF_E_NO_EVENTS_AVAILABLE) {
                if (!waitForOutput && gotOutput) {
                    break;  // Got some output, done for non-blocking mode
                }
                if (!waitForOutput) {
                    break;  // Non-blocking mode: don't wait at all
                }
                // Wait a bit for encoder to produce events
                Sleep(1);
                waitAttempts++;
                continue;
            }
            
            if (FAILED(hr) || !event) {
                if (hr != MF_E_NO_EVENTS_AVAILABLE) {
                    static int errLog = 0;
                    if (errLog++ < 5) {
                        std::cerr << "[RingBufferEncoder] GetEvent failed: 0x" 
                                  << std::hex << hr << std::dec << std::endl;
                    }
                }
                break;
            }
            
            MediaEventType type;
            event->GetType(&type);
            event->Release();
            event = nullptr;
            
            if (type == METransformHaveOutput) {
                ProcessEncoderOutput(timestamp);
                gotOutput = true;
                // Continue checking for more output events or need-input
            } else if (type == METransformNeedInput) {
                gotNeedInput = true;  // Ready for next input
                break;
            } else if (type == METransformDrainComplete) {
                // Drain finished
                break;
            }
            // Reset wait counter when we get any event
            waitAttempts = 0;
        }
        
        return gotNeedInput || gotOutput;
    } else {
        // Sync: call ProcessOutput until NEED_MORE_INPUT
        ProcessEncoderOutput(timestamp);
    }
    
    return true;
}

// ============ PROCESS ENCODER OUTPUT ============
// For ASYNC MFT: Only call this after receiving METransformHaveOutput event!
// For SYNC MFT: Can call repeatedly until MF_E_TRANSFORM_NEED_MORE_INPUT
static void ProcessEncoderOutput(int64_t timestamp) {
    MFT_OUTPUT_DATA_BUFFER outputBuffer = {};
    outputBuffer.dwStreamID = g_outputStreamId;
    outputBuffer.pSample = nullptr;
    outputBuffer.dwStatus = 0;
    outputBuffer.pEvents = nullptr;
    
    // Check if MFT provides its own samples (hardware encoders typically do)
    MFT_OUTPUT_STREAM_INFO streamInfo = {};
    HRESULT hr = g_encoder->GetOutputStreamInfo(g_outputStreamId, &streamInfo);
    bool mftProvidesSamples = SUCCEEDED(hr) && (streamInfo.dwFlags & MFT_OUTPUT_STREAM_PROVIDES_SAMPLES);
    
    // Only allocate sample if MFT doesn't provide its own
    IMFSample* ourSample = nullptr;
    if (!mftProvidesSamples && streamInfo.cbSize > 0) {
        MFCreateSample(&ourSample);
        IMFMediaBuffer* buffer = nullptr;
        MFCreateMemoryBuffer(streamInfo.cbSize, &buffer);
        ourSample->AddBuffer(buffer);
        buffer->Release();
        outputBuffer.pSample = ourSample;
    }
    
    DWORD status = 0;
    int outputCount = 0;
    
    // For async MFT: we only call ProcessOutput ONCE since we got a HaveOutput event
    // For sync MFT: we loop until NEED_MORE_INPUT
    int maxIterations = g_isAsyncMFT ? 1 : 100;
    
    for (int iter = 0; iter < maxIterations; iter++) {
        hr = g_encoder->ProcessOutput(0, 1, &outputBuffer, &status);
        
        if (hr == MF_E_TRANSFORM_NEED_MORE_INPUT) {
            break;
        }
        
        if (hr == MF_E_TRANSFORM_STREAM_CHANGE) {
            // Re-negotiate output type if needed
            IMFMediaType* newType = nullptr;
            if (SUCCEEDED(g_encoder->GetOutputAvailableType(g_outputStreamId, 0, &newType))) {
                g_encoder->SetOutputType(g_outputStreamId, newType, 0);
                newType->Release();
            }
            continue;
        }
        
        if (FAILED(hr)) {
            // For async MFT, E_UNEXPECTED just means no output ready - not an error
            if (g_isAsyncMFT && (hr == E_UNEXPECTED || hr == 0x8000ffff)) {
                break;  // Normal for async - just no output available
            }
            static int errLogCount = 0;
            if (errLogCount++ < 5) {
                std::cerr << "[RingBufferEncoder] ProcessOutput failed: 0x" 
                          << std::hex << hr << std::dec << std::endl;
            }
            break;
        }
        
        // Extract H.264 data from the sample (either ours or MFT-provided)
        IMFSample* resultSample = outputBuffer.pSample;
        if (resultSample) {
            IMFMediaBuffer* mediaBuffer = nullptr;
            hr = resultSample->ConvertToContiguousBuffer(&mediaBuffer);
            if (SUCCEEDED(hr) && mediaBuffer) {
                BYTE* data = nullptr;
                DWORD maxLength = 0, currentLength = 0;
                
                hr = mediaBuffer->Lock(&data, &maxLength, &currentLength);
                if (SUCCEEDED(hr) && data && currentLength > 0) {
                    // Check for keyframe
                    UINT32 isKeyframe = 0;
                    resultSample->GetUINT32(MFSampleExtension_CleanPoint, &isKeyframe);
                    
                    // Extract SPS/PPS on first keyframe
                    if (isKeyframe && !g_headersCaptured) {
                        ExtractSPSPPS(data, currentLength);
                    }
                    
                    // Push to ring buffer (dynamic allocation inside)
                    VideoBuffer::PushFrame(data, currentLength, timestamp, isKeyframe != 0);
                    
                    g_frameCount++;
                    outputCount++;
                    
                    mediaBuffer->Unlock();
                }
                mediaBuffer->Release();
            }
            
            // Release MFT-provided sample (not ours)
            if (mftProvidesSamples && resultSample) {
                resultSample->Release();
                outputBuffer.pSample = nullptr;
            }
        }
        
        // Release any events
        if (outputBuffer.pEvents) {
            outputBuffer.pEvents->Release();
            outputBuffer.pEvents = nullptr;
        }
    }
    
    // Cleanup our sample if we allocated one
    if (ourSample) {
        ourSample->Release();
    }
    
    if (outputCount > 0) {
        static int logCount = 0;
        if (logCount++ < 10) {
            std::cout << "[RingBufferEncoder] Got " << outputCount << " encoded frames" << std::endl;
        }
    }
}

// ============ CAPTURE LOOP ============
static void CaptureLoop() {
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_ABOVE_NORMAL);
    
    const int64_t frameDuration100ns = 10000000LL / g_fps;
    const int64_t targetFrameTimeUs = 1000000LL / g_fps;  // ~16667us for 60fps
    
    // Create high-resolution timer for frame pacing
    g_frameTimer = CreateHighResTimer();
    
    // Start privacy blur hook (shared system)
    PrivacyRecorder::StartBlurHook();
    
    std::cout << "[RingBufferEncoder] Capture loop started @ " << g_fps << " fps (target: " 
              << targetFrameTimeUs << " us per frame)" << std::endl;
    
    int consecutiveErrors = 0;
    int framesProcessed = 0;
    int framesEncoded = 0;
    int dxgiAcquireAttempts = 0;
    bool hasValidFrame = false;  // Track if we have at least one valid frame in captureTexture
    
    auto nextFrameTime = std::chrono::steady_clock::now();
    
    while (g_capturing.load()) {
        auto frameStart = std::chrono::steady_clock::now();
        
        // Update blur state check (shared system)
        PrivacyRecorder::UpdateBlurCheck();
        
        // Step 1: Acquire frame from DXGI (non-blocking)
        IDXGIResource* resource = nullptr;
        DXGI_OUTDUPL_FRAME_INFO frameInfo = {};
        bool gotNewFrame = false;
        
        dxgiAcquireAttempts++;
        HRESULT hr = g_duplication->AcquireNextFrame(0, &frameInfo, &resource);  // Non-blocking
        
        // Log first few acquire attempts for debugging
        if (dxgiAcquireAttempts <= 5) {
            std::cout << "[RingBufferEncoder] AcquireNextFrame attempt " << dxgiAcquireAttempts 
                      << " result: 0x" << std::hex << hr << std::dec;
            if (hr == S_OK) {
                std::cout << " - LastPresentTime=" << frameInfo.LastPresentTime.QuadPart
                          << ", AccumulatedFrames=" << frameInfo.AccumulatedFrames;
            }
            std::cout << std::endl;
        }
        
        if (hr == DXGI_ERROR_WAIT_TIMEOUT) {
            // No new frame - this is normal when screen hasn't changed
            // We'll still encode the existing frame to maintain constant frame rate
        } else if (hr == DXGI_ERROR_ACCESS_LOST) {
            std::cerr << "[RingBufferEncoder] DXGI access lost, attempting recovery..." << std::endl;
            if (g_duplication) {
                g_duplication->Release();
                g_duplication = nullptr;
            }
            
            // Recreate duplication
            IDXGIOutput* output = nullptr;
            if (SUCCEEDED(g_selectedAdapter->EnumOutputs(0, &output))) {
                IDXGIOutput1* output1 = nullptr;
                if (SUCCEEDED(output->QueryInterface(__uuidof(IDXGIOutput1), (void**)&output1))) {
                    hr = output1->DuplicateOutput(g_device, &g_duplication);
                    output1->Release();
                    if (SUCCEEDED(hr)) {
                        std::cout << "[RingBufferEncoder] DXGI duplication recovered" << std::endl;
                    }
                }
                output->Release();
            }
            // Still try to encode existing frame if we have one
        } else if (FAILED(hr)) {
            consecutiveErrors++;
            static int errorLogCount = 0;
            if (errorLogCount++ < 10) {
                std::cerr << "[RingBufferEncoder] AcquireNextFrame failed: 0x" 
                          << std::hex << hr << std::dec << std::endl;
            }
            if (consecutiveErrors > 100) {
                std::cerr << "[RingBufferEncoder] Too many capture errors, stopping" << std::endl;
                break;
            }
            // Still try to encode existing frame if we have one
        } else if (hr == S_OK) {
            consecutiveErrors = 0;
            
            // Check if we actually got a frame with content
            if (frameInfo.LastPresentTime.QuadPart != 0 || frameInfo.AccumulatedFrames != 0) {
                ID3D11Texture2D* desktopTex = nullptr;
                hr = resource->QueryInterface(__uuidof(ID3D11Texture2D), (void**)&desktopTex);
                
                if (SUCCEEDED(hr) && desktopTex) {
                    // Copy desktop to capture texture
                    g_context->CopyResource(g_captureTexture, desktopTex);
                    desktopTex->Release();
                    hasValidFrame = true;
                    gotNewFrame = true;
                }
            }
            
            if (resource) resource->Release();
            g_duplication->ReleaseFrame();
        }
        
        // ALWAYS encode a frame if we have valid content (maintains constant FPS)
        if (hasValidFrame) {
            // Calculate timestamp based on frame number (ensures constant 60fps timestamps)
            int64_t timestamp = (int64_t)framesProcessed * frameDuration100ns;
            
            // Step 2: Check blur and apply ONLY if needed (dual VP input path)
            bool needsBlur = PrivacyRecorder::ShouldApplyBlur();
            if (needsBlur) {
                // Lazy-create blur resources on first use (saves ~8MB until needed)
                if (EnsureBlurResources()) {
                    ApplyBlur();  // captureTexture → blurredTexture via compute shader
                } else {
                    needsBlur = false;  // Blur resource creation failed, fall back to direct path
                }
            }
            // NO CopyResource when blur is off — VP reads captureTexture directly
            
            // Step 3: Convert BGRA → NV12 (selects VP input based on blur state)
            int currentPool = g_poolIndex;
            ConvertBGRAtoNV12(currentPool, needsBlur);
            
            // Step 4: Quick non-blocking drain of any ready output
            DrainAllEncoderOutput(timestamp, false);
            
            // Step 5: Create fresh sample with current pool texture
            IMFSample* inputSample = CreateFrameSample(currentPool, timestamp, frameDuration100ns);
            if (inputSample) {
                // Step 6: Submit to encoder with retry on MF_E_NOTACCEPTING
                bool frameSubmitted = false;
                for (int retryCount = 0; retryCount < 3 && !frameSubmitted; retryCount++) {
                    hr = g_encoder->ProcessInput(g_inputStreamId, inputSample, 0);
                    
                    if (hr == MF_E_NOTACCEPTING) {
                        DrainAllEncoderOutput(timestamp, true);
                        continue;
                    }
                    
                    if (SUCCEEDED(hr)) {
                        frameSubmitted = true;
                    } else {
                        static int logCount = 0;
                        if (logCount++ < 10) {
                            std::cerr << "[RingBufferEncoder] ProcessInput failed: 0x" 
                                      << std::hex << hr << std::dec << std::endl;
                        }
                        break;
                    }
                }
                
                inputSample->Release();
                
                if (frameSubmitted) {
                    framesProcessed++;
                    g_firstFrameSubmitted.store(true);
                    
                    if (framesProcessed == 1) {
                        std::cout << "[RingBufferEncoder] First frame sent to encoder successfully!" << std::endl;
                    }
                    
                    DrainAllEncoderOutput(timestamp, false);
                    g_poolIndex = (g_poolIndex + 1) % NV12_POOL_SIZE;
                }
            }
            
            // Periodic status log
            if (framesProcessed > 0 && framesProcessed % 300 == 0) {
                uint64_t encoded = g_frameCount.load();
                double actualFps = (double)framesProcessed / 
                    (std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::steady_clock::now() - g_recordingStartTime).count() / 1000.0);
                std::cout << "[RingBufferEncoder] Processed " << framesProcessed 
                          << " frames, encoded: " << encoded 
                          << ", actual FPS: " << std::fixed << std::setprecision(2) << actualFps << std::endl;
            }
        }
        
        // Frame pacing — high-resolution timer (no CPU spin-wait)
        nextFrameTime += std::chrono::microseconds(targetFrameTimeUs);
        auto now = std::chrono::steady_clock::now();
        
        if (nextFrameTime > now) {
            auto sleepTime = std::chrono::duration_cast<std::chrono::microseconds>(nextFrameTime - now);
            if (g_frameTimer && sleepTime.count() > 100) {
                // High-resolution timer path — no busy-wait
                PrecisionSleep(g_frameTimer, sleepTime);
            } else if (sleepTime.count() > 0) {
                std::this_thread::sleep_for(sleepTime);
            }
        } else {
            // We're behind - reset to avoid accumulating delay
            if (std::chrono::duration_cast<std::chrono::milliseconds>(now - nextFrameTime).count() > 100) {
                nextFrameTime = now;
            }
        }
    }
    
    std::cout << "[RingBufferEncoder] Stopping capture loop. Frames processed: " << framesProcessed << std::endl;
    
    // Drain encoder on stop
    std::cout << "[RingBufferEncoder] Draining encoder..." << std::endl;
    g_encoder->ProcessMessage(MFT_MESSAGE_NOTIFY_END_OF_STREAM, 0);
    g_encoder->ProcessMessage(MFT_MESSAGE_COMMAND_DRAIN, 0);
    
    // Final output drain
    auto now = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::nanoseconds>(now - g_recordingStartTime);
    
    for (int i = 0; i < 10; i++) {
        DrainAllEncoderOutput(elapsed.count() / 100);
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    
    PrivacyRecorder::StopBlurHook();
    
    // Clean up frame timer
    if (g_frameTimer) {
        CloseHandle(g_frameTimer);
        g_frameTimer = nullptr;
    }
    
    std::cout << "[RingBufferEncoder] Capture loop ended. Total frames: " << g_frameCount.load() 
              << ", Buffer: " << (VideoBuffer::GetMemoryUsage() / (1024*1024)) << " MB" << std::endl;
}

// ============ PUBLIC API ============
bool Start() {
    if (g_capturing.load()) return true;
    if (!Initialize()) return false;
    
    // Clear headers from previous recording
    ClearHeaders();
    
    // Initialize ring buffer
    VideoBuffer::g_videoBuffer.init();
    VideoBuffer::g_videoBuffer.startRecording();
    
    g_frameCount = 0;
    g_poolIndex = 0;
    g_firstFrameSubmitted.store(false);  // Reset for new recording
    g_recordingStartTime = std::chrono::steady_clock::now();
    
    // Store wall-clock epoch time for log correlation
    auto epochNow = std::chrono::system_clock::now();
    g_recordingStartEpochMs = std::chrono::duration_cast<std::chrono::milliseconds>(
        epochNow.time_since_epoch()
    ).count();
    
    g_capturing.store(true);
    
    g_captureThread = std::thread(CaptureLoop);
    
    std::cout << "[RingBufferEncoder] Started (epoch: " << g_recordingStartEpochMs << " ms)" << std::endl;
    return true;
}

void Stop() {
    if (!g_capturing.load()) return;
    
    std::cout << "[RingBufferEncoder] Stopping..." << std::endl;
    g_capturing.store(false);
    
    if (g_captureThread.joinable()) {
        g_captureThread.join();
    }
    
    VideoBuffer::g_videoBuffer.stopRecording();
    CleanupAll();
    
    std::cout << "[RingBufferEncoder] Stopped" << std::endl;
}

bool IsRecording() {
    return g_capturing.load();
}

uint64_t GetFrameCount() {
    return g_frameCount.load();
}

void SetFps(int fps) {
    if (fps >= 15 && fps <= 120) {
        g_fps = fps;
        std::cout << "[RingBufferEncoder] FPS set to " << fps << std::endl;
    }
}

int GetFps() {
    return g_fps;
}

void Cleanup() {
    Stop();
    ClearHeaders();  // Clear SPS/PPS when fully cleaning up
    VideoBuffer::g_videoBuffer.deallocate();
}

// Get SPS/PPS for MP4 muxing
const std::vector<uint8_t>& GetSPS() {
    return g_sps;
}

const std::vector<uint8_t>& GetPPS() {
    return g_pps;
}

bool HasHeaders() {
    return g_headersCaptured;
}

uint32_t GetWidth() {
    return g_width;
}

uint32_t GetHeight() {
    return g_height;
}

int64_t GetRecordingStartEpochMs() {
    return g_recordingStartEpochMs;
}

} // namespace RingBufferEncoder
