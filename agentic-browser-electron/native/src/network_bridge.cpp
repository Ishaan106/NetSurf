/**
 * NETWORK BRIDGE - N-API bindings for NetworkBuffer
 * Exposes C++ network ring buffer to JavaScript via N-API.
 */

#include <napi.h>
#include "network_buffer.h"

// networkBufferInit(durationSeconds: number): boolean
Napi::Value NetworkBridge_Init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    int durationSeconds = 120; // default 2 minutes
    if (info.Length() >= 1 && info[0].IsNumber()) {
        durationSeconds = info[0].As<Napi::Number>().Int32Value();
    }
    
    NetworkBuffer::InitializeWithDuration(durationSeconds);
    return Napi::Boolean::New(env, true);
}

// networkBufferPush(timestamp_ms: number, jsonPayload: string): boolean
Napi::Value NetworkBridge_Push(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected 2 arguments: timestamp_ms, jsonPayload")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    int32_t timestamp_ms = info[0].As<Napi::Number>().Int32Value();
    std::string payload = info[1].As<Napi::String>().Utf8Value();
    
    bool success = NetworkBuffer::Push(timestamp_ms, payload.c_str(), payload.length());
    return Napi::Boolean::New(env, success);
}

// networkBufferGetAll(): string (JSON array)
Napi::Value NetworkBridge_GetAll(const Napi::CallbackInfo& info) {
    std::string json = NetworkBuffer::GetAllJson();
    return Napi::String::New(info.Env(), json);
}

// networkBufferClear(): void
Napi::Value NetworkBridge_Clear(const Napi::CallbackInfo& info) {
    NetworkBuffer::Clear();
    return info.Env().Undefined();
}

// networkBufferGetCount(): number
Napi::Value NetworkBridge_GetCount(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), NetworkBuffer::GetCount());
}

// networkBufferGetCapacity(): number
Napi::Value NetworkBridge_GetCapacity(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), NetworkBuffer::GetCapacity());
}

// networkBufferSetRecordingStart(epochMs: number): void
Napi::Value NetworkBridge_SetRecordingStart(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected 1 argument: epochMs")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    int64_t epochMs = info[0].As<Napi::Number>().Int64Value();
    NetworkBuffer::SetRecordingStart(epochMs);
    return env.Undefined();
}
