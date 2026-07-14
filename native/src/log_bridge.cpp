/**
 * LOG BRIDGE - N-API Bindings for Log Buffer
 * 
 * Exposes pushLog() to JavaScript via N-API
 * ZERO HEAP ALLOCATION on main thread
 */

#include <napi.h>
#include "log_buffer.h"

namespace PrivacyRecorder {

// pushLog(timestamp_ms: number, type: number, payload: string): boolean
Napi::Value LogBridge_PushLog(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected 3 arguments: timestamp_ms, type, payload")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Extract arguments
    int32_t timestamp_ms = info[0].As<Napi::Number>().Int32Value();
    uint8_t type = static_cast<uint8_t>(info[1].As<Napi::Number>().Uint32Value());
    std::string payload = info[2].As<Napi::String>().Utf8Value();
    
    // Convert type
    LogBuffer::LogType logType = static_cast<LogBuffer::LogType>(type);
    
    // Push to ring buffer (lock-free)
    bool success = LogBuffer::PushLog(
        timestamp_ms, 
        logType, 
        payload.c_str(), 
        payload.length()
    );
    
    return Napi::Boolean::New(env, success);
}

// initLogBuffer(): void
Napi::Value LogBridge_InitLogBuffer(const Napi::CallbackInfo& info) {
    LogBuffer::Initialize();
    return info.Env().Undefined();
}

// clearLogBuffer(): void
Napi::Value LogBridge_ClearLogBuffer(const Napi::CallbackInfo& info) {
    LogBuffer::Clear();
    return info.Env().Undefined();
}

// getLogCount(): number
Napi::Value LogBridge_GetLogCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), LogBuffer::GetCount());
}

// setLogRecordingStart(epochMs: number): void
// Sets the recording start epoch for computing relative log timestamps
Napi::Value LogBridge_SetRecordingStart(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "Expected 1 argument: epochMs (number)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    int64_t epochMs = info[0].As<Napi::Number>().Int64Value();
    LogBuffer::SetRecordingStart(epochMs);
    return env.Undefined();
}

// getAllLogs(): string (JSON array)
// Returns all buffered logs as a JSON string with timestamps relative to recording start
Napi::Value LogBridge_GetAllLogs(const Napi::CallbackInfo& info) {
    std::string json = LogBuffer::GetAllLogsJson();
    return Napi::String::New(info.Env(), json);
}

} // namespace PrivacyRecorder
