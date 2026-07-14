/**
 * PRIVACY RECORDER - Optimized Recording Loop
 * 
 * CPU OPTIMIZED: Use blocking DXGI timeout instead of polling
 * This reduces DXGI calls from 1000/sec to ~60/sec
 */

#include "recorder_types.h"

// Forward declaration for netsurf export function (global namespace)
namespace Napi { class CallbackInfo; class Value; }
extern Napi::Value NetSurf_SaveRecording(const Napi::CallbackInfo&);

// Forward declarations for network bridge (global namespace)
extern Napi::Value NetworkBridge_Init(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_Push(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_GetAll(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_Clear(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_GetCount(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_GetCapacity(const Napi::CallbackInfo&);
extern Napi::Value NetworkBridge_SetRecordingStart(const Napi::CallbackInfo&);

namespace VideoBuffer {
    Napi::Value RingBuffer_Init(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_InitWithConfig(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_SetFps(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_StartRecording(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_StopRecording(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_Clear(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_IsRecording(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_GetPacketCount(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_GetDurationMs(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_GetMemoryUsage(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_GetStatus(const Napi::CallbackInfo&);
    Napi::Value RingBuffer_Save(const Napi::CallbackInfo&);
}


namespace PrivacyRecorder {

static bool g_initialized = false;

// OPTIMIZED Recording Loop - uses blocking DXGI timeout
void RecordingLoop() {
    // Low priority to not interfere with UI
    SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_BELOW_NORMAL);
    
    g_loopIterations = 0;
    
    // Frame timing
    const int targetFps = g_fps;
    const int frameTimeMs = 1000 / targetFps;  // ~16ms for 60fps
    
    while (g_recording) {
        // Update blur check (just reads atomics - very fast)
        UpdateBlurCheck();
        
        // Capture and encode
        g_loopIterations++;
        CaptureAndEncode();
        
        // Sleep for frame interval - DXGI already provides timing
        // No need for complex timing logic - just sleep frame interval
        std::this_thread::sleep_for(std::chrono::milliseconds(frameTimeMs));
    }
}

void Cleanup() {
    g_recording = false;
    
    // Stop blur hook first
    StopBlurHook();
    
    if (g_recordingThread.joinable()) g_recordingThread.join();
    
    // Destroy sample pool
    DestroySamplePool();
    
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
        result.Set("success", false);
        result.Set("error", "Already recording");
        return result;
    }
    
    // Parse options
    g_fps = 60;
    g_audioEnabled = false;
    g_privacyEnabled = false;
    
    if (info.Length() > 0 && info[0].IsObject()) {
        Napi::Object opts = info[0].As<Napi::Object>();
        if (opts.Has("fps")) {
            g_fps = opts.Get("fps").As<Napi::Number>().Int32Value();
        }
        if (opts.Has("audio")) {
            g_audioEnabled = opts.Get("audio").As<Napi::Boolean>().Value();
        }
        if (opts.Has("privacyEnabled")) {
            g_privacyEnabled = opts.Get("privacyEnabled").As<Napi::Boolean>().Value();
        }
    }
    
    // Setup privacy blur if enabled
    if (g_privacyEnabled) {
        if (!CreateBlurResources()) {
            result.Set("success", false);
            result.Set("error", g_lastError);
            return result;
        }
    }
    
    // Setup audio if enabled
    if (g_audioEnabled) {
        if (!SetupAudio()) {
            g_audioEnabled = false;
        }
    }
    
    // Generate output path
    wchar_t docsPath[MAX_PATH];
    SHGetFolderPathW(nullptr, CSIDL_PERSONAL, nullptr, 0, docsPath);
    auto now = std::chrono::system_clock::now();
    auto time = std::chrono::system_clock::to_time_t(now);
    wchar_t filename[256];
    wcsftime(filename, 256, L"\\Recordings\\PrivacyRecording_%Y%m%d_%H%M%S.mp4", localtime(&time));
    std::wstring outputPath = docsPath;
    outputPath += filename;
    
    // Store path globally for later retrieval
    // Convert wstring to string for storage
    std::string pathStr(outputPath.begin(), outputPath.end());
    g_outputPath = pathStr;
    
    if (!SetupEncoder(outputPath)) {
        result.Set("success", false);
        result.Set("error", g_lastError);
        return result;
    }
    
    g_recording = true;
    g_frameCount = 0;
    g_audioFrames = 0;
    g_lastSampleTime = 0;
    
    // Set recording start time
    g_recordingStartTime = std::chrono::steady_clock::now();
    
    if (g_privacyEnabled) {
        g_cachedBlurResult = CheckWindowForBlur(GetForegroundWindow());
    }
    
    g_recordingThread = std::thread(RecordingLoop);
    
    if (g_audioEnabled && g_audioClient) {
        g_audioRunning = true;
        g_audioThread = std::thread(AudioCaptureLoop);
    }
    
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
    
    // Stop audio first
    if (g_audioRunning) {
        g_audioRunning = false;
        if (g_audioThread.joinable()) g_audioThread.join();
    }
    
    // Stop recording
    g_recording = false;
    if (g_recordingThread.joinable()) g_recordingThread.join();
    
    // Finalize file
    if (g_sinkWriter) {
        g_sinkWriter->Finalize();
        g_sinkWriter->Release();
        g_sinkWriter = nullptr;
    }
    
    result.Set("success", true);
    result.Set("framesRecorded", Napi::Number::New(env, static_cast<double>(g_frameCount.load())));
    return result;
}

Napi::Value GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Object result = Napi::Object::New(env);
    
    result.Set("recording", g_recording.load());
    result.Set("frameCount", Napi::Number::New(env, static_cast<double>(g_frameCount.load())));
    result.Set("loopIterations", Napi::Number::New(env, static_cast<double>(g_loopIterations.load())));
    result.Set("captureAttempts", Napi::Number::New(env, static_cast<double>(g_captureAttempts.load())));
    result.Set("timeouts", Napi::Number::New(env, static_cast<double>(g_timeouts.load())));
    result.Set("encodeSuccess", Napi::Number::New(env, static_cast<double>(g_encodeSuccess.load())));
    result.Set("acquireErrors", Napi::Number::New(env, static_cast<double>(g_acquireErrors.load())));
    result.Set("audioFrames", Napi::Number::New(env, static_cast<double>(g_audioFrames.load())));
    
    return result;
}

Napi::Value CleanupNapi(const Napi::CallbackInfo& info) {
    Cleanup();
    return info.Env().Undefined();
}

Napi::Value GetRecordingPath(const Napi::CallbackInfo& info) {
    return Napi::String::New(info.Env(), g_outputPath);
}

Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    // Recording API
    exports.Set("init", Napi::Function::New(env, Init));
    exports.Set("startRecording", Napi::Function::New(env, StartRecording));
    exports.Set("stopRecording", Napi::Function::New(env, StopRecording));
    exports.Set("getStats", Napi::Function::New(env, GetStats));
    exports.Set("cleanup", Napi::Function::New(env, CleanupNapi));
    exports.Set("getRecordingPath", Napi::Function::New(env, GetRecordingPath));
    
    // Log Buffer API (from log_bridge.cpp)
    extern Napi::Value LogBridge_PushLog(const Napi::CallbackInfo&);
    extern Napi::Value LogBridge_InitLogBuffer(const Napi::CallbackInfo&);
    extern Napi::Value LogBridge_ClearLogBuffer(const Napi::CallbackInfo&);
    extern Napi::Value LogBridge_GetLogCount(const Napi::CallbackInfo&);
    extern Napi::Value LogBridge_SetRecordingStart(const Napi::CallbackInfo&);
    extern Napi::Value LogBridge_GetAllLogs(const Napi::CallbackInfo&);
    
    exports.Set("pushLog", Napi::Function::New(env, LogBridge_PushLog));
    exports.Set("initLogBuffer", Napi::Function::New(env, LogBridge_InitLogBuffer));
    exports.Set("clearLogBuffer", Napi::Function::New(env, LogBridge_ClearLogBuffer));
    exports.Set("getLogCount", Napi::Function::New(env, LogBridge_GetLogCount));
    exports.Set("setLogRecordingStart", Napi::Function::New(env, LogBridge_SetRecordingStart));
    exports.Set("getAllLogs", Napi::Function::New(env, LogBridge_GetAllLogs));
    
    // Export API (from netsurf_export.cpp - global namespace)
    exports.Set("saveRecording", Napi::Function::New(env, ::NetSurf_SaveRecording));
    
    // Video Ring Buffer API (from video_buffer_bridge.cpp)
    exports.Set("ringBufferInit", Napi::Function::New(env, ::VideoBuffer::RingBuffer_Init));
    exports.Set("ringBufferInitWithConfig", Napi::Function::New(env, ::VideoBuffer::RingBuffer_InitWithConfig));
    exports.Set("ringBufferSetFps", Napi::Function::New(env, ::VideoBuffer::RingBuffer_SetFps));
    exports.Set("ringBufferStart", Napi::Function::New(env, ::VideoBuffer::RingBuffer_StartRecording));
    exports.Set("ringBufferStop", Napi::Function::New(env, ::VideoBuffer::RingBuffer_StopRecording));
    exports.Set("ringBufferClear", Napi::Function::New(env, ::VideoBuffer::RingBuffer_Clear));
    exports.Set("ringBufferIsRecording", Napi::Function::New(env, ::VideoBuffer::RingBuffer_IsRecording));
    exports.Set("ringBufferGetPacketCount", Napi::Function::New(env, ::VideoBuffer::RingBuffer_GetPacketCount));
    exports.Set("ringBufferGetDurationMs", Napi::Function::New(env, ::VideoBuffer::RingBuffer_GetDurationMs));
    exports.Set("ringBufferGetMemoryUsage", Napi::Function::New(env, ::VideoBuffer::RingBuffer_GetMemoryUsage));
    exports.Set("ringBufferGetStatus", Napi::Function::New(env, ::VideoBuffer::RingBuffer_GetStatus));
    exports.Set("ringBufferSave", Napi::Function::New(env, ::VideoBuffer::RingBuffer_Save));
    
    // Network Buffer API (from network_bridge.cpp — global namespace)
    exports.Set("networkBufferInit", Napi::Function::New(env, ::NetworkBridge_Init));
    exports.Set("networkBufferPush", Napi::Function::New(env, ::NetworkBridge_Push));
    exports.Set("networkBufferGetAll", Napi::Function::New(env, ::NetworkBridge_GetAll));
    exports.Set("networkBufferClear", Napi::Function::New(env, ::NetworkBridge_Clear));
    exports.Set("networkBufferGetCount", Napi::Function::New(env, ::NetworkBridge_GetCount));
    exports.Set("networkBufferGetCapacity", Napi::Function::New(env, ::NetworkBridge_GetCapacity));
    exports.Set("networkBufferSetRecordingStart", Napi::Function::New(env, ::NetworkBridge_SetRecordingStart));
    
    return exports;
}

NODE_API_MODULE(privacy_recorder, InitModule)

} // namespace PrivacyRecorder
