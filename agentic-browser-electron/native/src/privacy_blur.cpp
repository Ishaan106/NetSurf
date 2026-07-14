/**
 * PRIVACY BLUR - Event-Driven Zero-Leak Architecture
 * 
 * SECURITY CRITICAL: No sensitive frames must ever leak
 * 
 * Features:
 * 1. SetWinEventHook(EVENT_SYSTEM_FOREGROUND) - instant notification
 * 2. Atomic blur state - thread-safe read by encoder
 * 3. Immediate blur ON - no delay, no leaked frames
 * 4. Debounced blur OFF - 100ms delay to avoid flicker
 * 5. GPU-only blur - zero CPU copy
 */

#include "recorder_types.h"
#include <d3dcompiler.h>

namespace PrivacyRecorder {

// ============ ATOMIC BLUR STATE (Thread-Safe) ============
// These are read by encoder thread, written by hook thread
static std::atomic<bool> g_blurActiveAtomic{false};         // Current blur state (instant read)
static std::atomic<bool> g_targetBlur{false};               // What blur should be
static std::atomic<int64_t> g_unblurTimeMs{0};              // Timestamp when to unblur (0 = no pending unblur)
static std::chrono::steady_clock::time_point g_lastBlurOn;  // When blur was last turned on

// Debounce settings
static const int64_t UNBLUR_DELAY_MS = 150;  // 100ms delay before removing blur

// Hook handle
static HWINEVENTHOOK g_foregroundHook = nullptr;
static std::thread g_hookThread;
static std::atomic<bool> g_hookRunning{false};

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

// ============ PRIVACY APP DETECTION ============

// Additional notification patterns
static const wchar_t* g_notificationPatterns[] = {
    L"notification",
    L"@",
    L"new message",
    nullptr
};

bool CheckWindowForBlur(HWND hwnd) {
    if (!hwnd) return false;
    
    wchar_t title[512];
    GetWindowTextW(hwnd, title, 512);
    
    std::wstring titleLower(title);
    for (auto& c : titleLower) c = towlower(c);
    
    // Check main blur patterns
    for (int i = 0; g_blurPatterns[i] != nullptr; i++) {
        if (titleLower.find(g_blurPatterns[i]) != std::wstring::npos) {
            return true;
        }
    }
    
    return false;
}

// ============ WIN EVENT HOOK CALLBACK ============

// Called IMMEDIATELY when any window becomes foreground
// Runs on hook thread - must be fast and thread-safe
static void CALLBACK ForegroundCallback(
    HWINEVENTHOOK hWinEventHook,
    DWORD event,
    HWND hwnd,
    LONG idObject,
    LONG idChild,
    DWORD dwEventThread,
    DWORD dwmsEventTime
) {
    if (event != EVENT_SYSTEM_FOREGROUND) return;
    if (!g_privacyEnabled) return;
    
    // Check if this window needs blur
    bool needsBlur = CheckWindowForBlur(hwnd);
    
    if (needsBlur) {
        // INSTANT BLUR ON - no delay, no leaked frames
        // Use memory_order_release to ensure encoder sees this
        g_targetBlur.store(true, std::memory_order_release);
        g_blurActiveAtomic.store(true, std::memory_order_release);
        g_unblurTimeMs.store(0, std::memory_order_release);  // Cancel any pending unblur
        g_lastBlurOn = std::chrono::steady_clock::now();
    } else {
        // DELAYED BLUR OFF - debounce to avoid flicker
        g_targetBlur.store(false, std::memory_order_release);
        
        // Set unblur time to now + delay
        auto now = std::chrono::steady_clock::now();
        auto unblurTime = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()
        ).count() + UNBLUR_DELAY_MS;
        
        g_unblurTimeMs.store(unblurTime, std::memory_order_release);
    }
}

// Hook thread message loop - OPTIMIZED for low CPU
static void HookThreadProc() {
    // Register hook on this thread
    g_foregroundHook = SetWinEventHook(
        EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND,
        nullptr, ForegroundCallback,
        0, 0,  // All processes, all threads
        WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS
    );
    
    if (!g_foregroundHook) {
        std::cerr << "[PrivacyRecorder] SetWinEventHook failed!" << std::endl;
        return;
    }
    
    std::cout << "[PrivacyRecorder] Foreground hook installed (zero-leak mode)" << std::endl;
    
    // Efficient message loop using MsgWaitForMultipleObjects
    // This blocks most of the time, only waking on messages
    while (g_hookRunning.load()) {
        DWORD result = MsgWaitForMultipleObjects(0, nullptr, FALSE, 500, QS_ALLEVENTS);
        
        if (result == WAIT_OBJECT_0) {
            // Process all pending messages
            MSG msg;
            while (PeekMessage(&msg, nullptr, 0, 0, PM_REMOVE)) {
                if (msg.message == WM_QUIT) {
                    g_hookRunning.store(false);
                    break;
                }
                TranslateMessage(&msg);
                DispatchMessage(&msg);
            }
        }
        // WAIT_TIMEOUT (500ms) is fine - just loop again
    }
    
    // Cleanup
    if (g_foregroundHook) {
        UnhookWinEvent(g_foregroundHook);
        g_foregroundHook = nullptr;
    }
}

// ============ PUBLIC FUNCTIONS ============

void StartBlurHook() {
    if (g_hookRunning.load()) return;
    
    g_hookRunning.store(true);
    g_hookThread = std::thread(HookThreadProc);
}

void StopBlurHook() {
    if (!g_hookRunning.load()) return;
    
    g_hookRunning.store(false);
    
    // Post quit message to unblock GetMessage
    if (g_hookThread.joinable()) {
        PostThreadMessage(GetThreadId(g_hookThread.native_handle()), WM_QUIT, 0, 0);
        g_hookThread.join();
    }
}

// Called from main recording loop - handles delayed unblur
void UpdateBlurCheck() {
    if (!g_privacyEnabled) {
        g_cachedBlurResult = false;
        g_blurActiveAtomic.store(false, std::memory_order_relaxed);
        return;
    }
    
    // Check if we have a pending unblur
    int64_t unblurTime = g_unblurTimeMs.load(std::memory_order_acquire);
    if (unblurTime > 0) {
        auto now = std::chrono::steady_clock::now();
        auto currentMs = std::chrono::duration_cast<std::chrono::milliseconds>(
            now.time_since_epoch()
        ).count();
        
        if (currentMs >= unblurTime) {
            // Debounce timer expired - turn off blur
            g_blurActiveAtomic.store(false, std::memory_order_release);
            g_unblurTimeMs.store(0, std::memory_order_release);
        }
    }
    
    // Update cached result for ShouldApplyBlur
    g_cachedBlurResult = g_blurActiveAtomic.load(std::memory_order_acquire);
}

bool ShouldApplyBlur() {
    if (!g_privacyEnabled) return false;
    
    // CRITICAL: Read atomic state with acquire semantics
    // This ensures we see the latest blur decision from hook thread
    return g_blurActiveAtomic.load(std::memory_order_acquire);
}

// ============ BLUR RESOURCES ============

bool CreateBlurResources() {
    // Start the event hook
    StartBlurHook();
    
    // Create blurred texture
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
    
    // Create SRV for input
    D3D11_SHADER_RESOURCE_VIEW_DESC srvDesc = {};
    srvDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    srvDesc.ViewDimension = D3D11_SRV_DIMENSION_TEXTURE2D;
    srvDesc.Texture2D.MipLevels = 1;
    
    hr = g_device->CreateShaderResourceView(g_captureTexture, &srvDesc, &g_captureSRV);
    if (FAILED(hr)) {
        g_lastError = "CreateCaptureSRV failed: " + std::to_string(hr);
        return false;
    }
    
    // Create UAV for output
    D3D11_UNORDERED_ACCESS_VIEW_DESC uavDesc = {};
    uavDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    uavDesc.ViewDimension = D3D11_UAV_DIMENSION_TEXTURE2D;
    
    hr = g_device->CreateUnorderedAccessView(g_blurredTexture, &uavDesc, &g_blurUAV);
    if (FAILED(hr)) {
        g_lastError = "CreateBlurUAV failed: " + std::to_string(hr);
        return false;
    }
    
    // Compile shader
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
    
    std::cout << "[PrivacyRecorder] ZERO-LEAK blur enabled (event-driven, 100ms debounce)" << std::endl;
    return true;
}

void ApplyBlur() {
    g_context->CSSetShader(g_blurShader, nullptr, 0);
    g_context->CSSetShaderResources(0, 1, &g_captureSRV);
    g_context->CSSetUnorderedAccessViews(0, 1, &g_blurUAV, nullptr);
    
    UINT groupsX = (g_width + 15) / 16;
    UINT groupsY = (g_height + 15) / 16;
    g_context->Dispatch(groupsX, groupsY, 1);
    
    ID3D11UnorderedAccessView* nullUAV = nullptr;
    ID3D11ShaderResourceView* nullSRV = nullptr;
    g_context->CSSetUnorderedAccessViews(0, 1, &nullUAV, nullptr);
    g_context->CSSetShaderResources(0, 1, &nullSRV);
}

} // namespace PrivacyRecorder
