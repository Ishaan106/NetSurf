/**
 * PRIVACY RECORDER - Global Variable Definitions
 * 
 * All extern variables declared in recorder_types.h are defined here.
 */

#include "recorder_types.h"

namespace PrivacyRecorder {

// ============ VIDEO GLOBALS ============
ID3D11Device* g_device = nullptr;
ID3D11DeviceContext* g_context = nullptr;
IDXGIOutputDuplication* g_duplication = nullptr;
IDXGIOutput1* g_output = nullptr;
ID3D11Texture2D* g_captureTexture = nullptr;
ID3D11Texture2D* g_blurredTexture = nullptr;
IMFDXGIDeviceManager* g_dxgiManager = nullptr;
IMFSinkWriter* g_sinkWriter = nullptr;
std::mutex g_sinkWriterMutex;
DWORD g_videoStreamIndex = 0;
DWORD g_audioStreamIndex = 0;
UINT g_resetToken = 0;

// Blur shader resources
ID3D11ComputeShader* g_blurShader = nullptr;
ID3D11UnorderedAccessView* g_blurUAV = nullptr;
ID3D11ShaderResourceView* g_captureSRV = nullptr;

// GPU Ring Buffer for smooth frame pacing
ID3D11Texture2D* g_ringBuffer[RING_BUFFER_SIZE] = {nullptr, nullptr, nullptr};
std::atomic<int> g_writeIndex{0};
std::atomic<int> g_readIndex{0};
std::atomic<int> g_frameReady{0};
std::mutex g_ringMutex;

// ============ AUDIO GLOBALS ============
IMMDevice* g_audioDevice = nullptr;
IAudioClient* g_audioClient = nullptr;
IAudioCaptureClient* g_captureClient = nullptr;
WAVEFORMATEX* g_audioFormat = nullptr;
std::thread g_audioThread;
std::atomic<bool> g_audioRunning{false};
std::atomic<bool> g_audioEnabled{false};

// ============ RECORDING STATE ============
std::atomic<bool> g_recording{false};
std::atomic<bool> g_privacyEnabled{false};
std::thread g_recordingThread;
std::string g_outputPath;
std::string g_lastError;
std::string g_captureError;

// ============ CAPTURE SETTINGS ============
int g_width = 0;
int g_height = 0;
int g_fps = 60;
std::atomic<uint64_t> g_frameCount{0};
std::chrono::steady_clock::time_point g_recordingStartTime;
LONGLONG g_lastSampleTime = 0;

// Diagnostic counters
std::atomic<uint64_t> g_loopIterations{0};
std::atomic<uint64_t> g_captureAttempts{0};
std::atomic<uint64_t> g_timeouts{0};
std::atomic<uint64_t> g_acquireErrors{0};
std::atomic<uint64_t> g_encodeSuccess{0};
std::atomic<uint64_t> g_audioFrames{0};

// ============ BLUR DETECTION ============
std::atomic<bool> g_cachedBlurResult{false};
std::chrono::steady_clock::time_point g_lastBlurCheck;
const std::chrono::milliseconds BLUR_CHECK_INTERVAL{100};

const wchar_t* g_blurPatterns[] = {
    L"whatsapp",
    L"telegram",
    L"signal",
    L"messenger",
    L"- gmail",
    L"inbox -",
    nullptr
};

} // namespace PrivacyRecorder
