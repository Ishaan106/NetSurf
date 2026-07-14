/**
 * DXGI CAPTURE - D3D11 Device and Desktop Duplication
 * 
 * GPU-ONLY PIPELINE: Uses Intel/NVIDIA GPU for all operations
 * Zero CPU copy - all GPU to GPU
 */

#include "recorder_types.h"

namespace PrivacyRecorder {

bool CreateD3DDevice() {
    // Create DXGI Factory to enumerate adapters
    IDXGIFactory1* factory = nullptr;
    HRESULT hr = CreateDXGIFactory1(__uuidof(IDXGIFactory1), (void**)&factory);
    if (FAILED(hr)) {
        g_lastError = "CreateDXGIFactory1 failed";
        return false;
    }
    
    // Find preferred GPU adapter (Intel for QSV, or first available)
    IDXGIAdapter* selectedAdapter = nullptr;
    IDXGIAdapter* adapter = nullptr;
    
    for (UINT i = 0; factory->EnumAdapters(i, &adapter) != DXGI_ERROR_NOT_FOUND; i++) {
        DXGI_ADAPTER_DESC desc;
        adapter->GetDesc(&desc);
        
        // Prefer Intel for QSV hardware encoding
        if (wcsstr(desc.Description, L"Intel") != nullptr) {
            selectedAdapter = adapter;
            std::wcout << L"[PrivacyRecorder] Using Intel GPU: " << desc.Description << std::endl;
            break;
        }
        
        // Keep first adapter as fallback
        if (!selectedAdapter) {
            selectedAdapter = adapter;
        } else {
            adapter->Release();
        }
    }
    
    // Create D3D11 device on selected adapter
    D3D_FEATURE_LEVEL featureLevels[] = {
        D3D_FEATURE_LEVEL_11_1,
        D3D_FEATURE_LEVEL_11_0
    };
    D3D_FEATURE_LEVEL featureLevel;
    
    hr = D3D11CreateDevice(
        selectedAdapter,
        selectedAdapter ? D3D_DRIVER_TYPE_UNKNOWN : D3D_DRIVER_TYPE_HARDWARE,
        nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT | D3D11_CREATE_DEVICE_VIDEO_SUPPORT,
        featureLevels, 2,
        D3D11_SDK_VERSION,
        &g_device,
        &featureLevel,
        &g_context
    );
    
    if (selectedAdapter) selectedAdapter->Release();
    factory->Release();
    
    if (FAILED(hr)) {
        g_lastError = "Failed to create D3D11 device: " + std::to_string(hr);
        return false;
    }
    
    // Enable multithread protection for Media Foundation
    ID3D10Multithread* mt = nullptr;
    if (SUCCEEDED(g_device->QueryInterface(__uuidof(ID3D10Multithread), (void**)&mt))) {
        mt->SetMultithreadProtected(TRUE);
        mt->Release();
    }
    
    std::cout << "[PrivacyRecorder] D3D11 device created (GPU-only mode)" << std::endl;
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
    desc.BindFlags = D3D11_BIND_RENDER_TARGET | D3D11_BIND_SHADER_RESOURCE;
    desc.MiscFlags = D3D11_RESOURCE_MISC_SHARED;
    
    HRESULT hr = g_device->CreateTexture2D(&desc, nullptr, &g_captureTexture);
    if (FAILED(hr)) {
        g_lastError = "CreateTexture2D failed: " + std::to_string(hr);
        return false;
    }
    
    // Create GPU Ring Buffer
    for (int i = 0; i < RING_BUFFER_SIZE; i++) {
        hr = g_device->CreateTexture2D(&desc, nullptr, &g_ringBuffer[i]);
        if (FAILED(hr)) {
            g_lastError = "CreateRingBufferTexture failed";
            return false;
        }
    }
    
    g_writeIndex = 0;
    g_readIndex = 0;
    g_frameReady = 0;
    
    std::cout << "[PrivacyRecorder] GPU textures created" << std::endl;
    return true;
}

bool TestCapture() {
    IDXGIResource* resource = nullptr;
    DXGI_OUTDUPL_FRAME_INFO frameInfo;
    
    for (int attempt = 0; attempt < 3; attempt++) {
        HRESULT hr = g_duplication->AcquireNextFrame(500, &frameInfo, &resource);
        
        if (hr == DXGI_ERROR_WAIT_TIMEOUT) continue;
        
        if (FAILED(hr)) {
            g_lastError = "TestCapture failed: " + std::to_string(hr);
            return false;
        }
        
        resource->Release();
        g_duplication->ReleaseFrame();
        std::cout << "[PrivacyRecorder] Test capture successful!" << std::endl;
        return true;
    }
    
    g_lastError = "TestCapture timeout";
    return false;
}

} // namespace PrivacyRecorder
