/**
 * PRIVACY RECORDER - Shared Types and Declarations
 * 
 * TRUE ZERO-COPY GPU Pipeline:
 *   DXGI → GPU Texture → Blur Shader (optional) → MediaFoundation Encoder → MP4
 */

#pragma once

// Windows
#include <windows.h>
#include <shlobj.h>

// DirectX
#include <d3d11.h>
#include <dxgi1_2.h>
#include <d3dcompiler.h>

// Media Foundation
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <mferror.h>

// WASAPI Audio
#include <mmdeviceapi.h>
#include <audioclient.h>

// Node.js
#include <napi.h>

// C++ Standard
#include <string>
#include <thread>
#include <atomic>
#include <mutex>
#include <chrono>
#include <iostream>

namespace PrivacyRecorder {

// ============ VIDEO GLOBALS ============
extern ID3D11Device* g_device;
extern ID3D11DeviceContext* g_context;
extern IDXGIOutputDuplication* g_duplication;
extern IDXGIOutput1* g_output;
extern ID3D11Texture2D* g_captureTexture;
extern ID3D11Texture2D* g_blurredTexture;
extern IMFDXGIDeviceManager* g_dxgiManager;
extern IMFSinkWriter* g_sinkWriter;
extern std::mutex g_sinkWriterMutex;
extern DWORD g_videoStreamIndex;
extern DWORD g_audioStreamIndex;
extern UINT g_resetToken;

// Blur shader resources
extern ID3D11ComputeShader* g_blurShader;
extern ID3D11UnorderedAccessView* g_blurUAV;
extern ID3D11ShaderResourceView* g_captureSRV;

// GPU Ring Buffer for smooth frame pacing
// Decouples capture timing from encode timing
constexpr int RING_BUFFER_SIZE = 3;  // 3 frames = ~50ms buffer at 60fps
extern ID3D11Texture2D* g_ringBuffer[RING_BUFFER_SIZE];
extern std::atomic<int> g_writeIndex;  // Next slot for capture
extern std::atomic<int> g_readIndex;   // Next slot for encode
extern std::atomic<int> g_frameReady;  // Count of frames ready to encode
extern std::mutex g_ringMutex;         // Protects ring buffer access

// ============ AUDIO GLOBALS ============
extern IMMDevice* g_audioDevice;
extern IAudioClient* g_audioClient;
extern IAudioCaptureClient* g_captureClient;
extern WAVEFORMATEX* g_audioFormat;
extern std::thread g_audioThread;
extern std::atomic<bool> g_audioRunning;
extern std::atomic<bool> g_audioEnabled;

// ============ RECORDING STATE ============
extern std::atomic<bool> g_recording;
extern std::atomic<bool> g_privacyEnabled;
extern std::thread g_recordingThread;
extern std::string g_outputPath;
extern std::string g_lastError;
extern std::string g_captureError;

// ============ CAPTURE SETTINGS ============
extern int g_width;
extern int g_height;
extern int g_fps;
extern std::atomic<uint64_t> g_frameCount;
extern std::chrono::steady_clock::time_point g_recordingStartTime;
extern LONGLONG g_lastSampleTime;

// Diagnostic counters
extern std::atomic<uint64_t> g_loopIterations;
extern std::atomic<uint64_t> g_captureAttempts;
extern std::atomic<uint64_t> g_timeouts;
extern std::atomic<uint64_t> g_acquireErrors;
extern std::atomic<uint64_t> g_encodeSuccess;
extern std::atomic<uint64_t> g_audioFrames;

// ============ BLUR DETECTION ============
extern std::atomic<bool> g_cachedBlurResult;
extern std::chrono::steady_clock::time_point g_lastBlurCheck;
extern const std::chrono::milliseconds BLUR_CHECK_INTERVAL;
extern const wchar_t* g_blurPatterns[];

// ============ FUNCTION DECLARATIONS ============

// DXGI Capture (dxgi_capture.cpp)
bool CreateD3DDevice();
bool SetupDXGI(int monitorIndex);
bool CreateCaptureTexture();
bool TestCapture();

// Privacy Blur (privacy_blur.cpp)
bool CheckWindowForBlur(HWND hwnd);
void UpdateBlurCheck();
bool ShouldApplyBlur();
bool CreateBlurResources();
void ApplyBlur();
void StartBlurHook();   // Start event-driven foreground hook
void StopBlurHook();    // Stop hook and cleanup

// Audio Capture (audio_capture.cpp)
bool SetupAudio();
void AudioCaptureLoop();

// Encoder (encoder.cpp)
bool SetupEncoder(const std::wstring& outputPath);
bool CaptureAndEncode();
bool InitSamplePool();      // CPU optimization - pre-allocate samples
void DestroySamplePool();   // Cleanup sample pool

// Recording Loop (privacy_recorder.cpp)
void RecordingLoop();
void Cleanup();

// N-API Exports (privacy_recorder.cpp)
Napi::Value Init(const Napi::CallbackInfo& info);
Napi::Value StartRecording(const Napi::CallbackInfo& info);
Napi::Value StopRecording(const Napi::CallbackInfo& info);
Napi::Value GetStatus(const Napi::CallbackInfo& info);
Napi::Value Shutdown(const Napi::CallbackInfo& info);
Napi::Object InitModule(Napi::Env env, Napi::Object exports);

} // namespace PrivacyRecorder
