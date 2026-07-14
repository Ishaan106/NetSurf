/**
 * NETSURF EXPORT - Binary Export Implementation
 * 
 * Exports recording to .netsurf format with:
 * - Header validation
 * - GZIP compressed logs
 * - Raw H.264 video packets
 * 
 * Runs on worker thread - temporary heap allocations allowed
 */

#include "netsurf_format.h"
#include "log_buffer.h"
#include "recorder_types.h"
#include <fstream>
#include <sstream>
#include <vector>
#include <cstring>

// Simple CRC32 implementation (no external dependency)
namespace {
    uint32_t crc32_table[256];
    bool crc32_initialized = false;
    
    void init_crc32() {
        if (crc32_initialized) return;
        for (uint32_t i = 0; i < 256; i++) {
            uint32_t c = i;
            for (int j = 0; j < 8; j++) {
                c = (c & 1) ? (0xEDB88320 ^ (c >> 1)) : (c >> 1);
            }
            crc32_table[i] = c;
        }
        crc32_initialized = true;
    }
    
    uint32_t calc_crc32(const void* data, size_t len) {
        init_crc32();
        uint32_t crc = 0xFFFFFFFF;
        const uint8_t* buf = static_cast<const uint8_t*>(data);
        for (size_t i = 0; i < len; i++) {
            crc = crc32_table[(crc ^ buf[i]) & 0xFF] ^ (crc >> 8);
        }
        return crc ^ 0xFFFFFFFF;
    }
}

namespace NetSurf {

// ============ HEADER IMPLEMENTATION ============

void Header::init() {
    memcpy(magic, MAGIC, 8);
    version = FORMAT_VERSION;
    flags = 0;
    offset_metadata = sizeof(Header);
    offset_logs = 0;
    offset_video = 0;
    size_metadata = 0;
    size_logs = 0;
    size_video = 0;
    checksum = 0;
    memset(_reserved, 0, sizeof(_reserved));
}

uint32_t Header::calculateChecksum() const {
    return calc_crc32(this, 56);  // Checksum of first 56 bytes
}

bool Header::validate() const {
    if (memcmp(magic, MAGIC, 8) != 0) return false;
    if (version != FORMAT_VERSION) return false;
    if (checksum != calculateChecksum()) return false;
    return true;
}

// ============ EXPORT IMPLEMENTATION ============

void Initialize() {
    init_crc32();
}

ExportResult Export(const ExportOptions& options) {
    ExportResult result = {false, 0, 0, 0, ""};
    
    // Validate options
    if (options.start_ms >= options.end_ms) {
        result.error = "Invalid time range";
        return result;
    }
    
    // Open output file
    std::ofstream file(options.output_path, std::ios::binary);
    if (!file.is_open()) {
        result.error = "Failed to open output file";
        return result;
    }
    
    // Initialize header
    Header header;
    header.init();
    
    // Reserve space for header
    file.write(reinterpret_cast<const char*>(&header), sizeof(Header));
    
    // ===== METADATA BLOCK =====
    std::ostringstream meta;
    meta << "{";
    meta << "\"start_time\":" << options.start_ms << ",";
    meta << "\"duration_ms\":" << (options.end_ms - options.start_ms) << ",";
    meta << "\"resolution\":\"" << PrivacyRecorder::g_width << "x" << PrivacyRecorder::g_height << "\",";
    meta << "\"fps\":" << PrivacyRecorder::g_fps;
    meta << "}";
    
    std::string metaStr = meta.str();
    header.offset_metadata = sizeof(Header);
    header.size_metadata = static_cast<uint32_t>(metaStr.size());
    file.write(metaStr.c_str(), metaStr.size());
    
    // ===== LOG BLOCK =====
    if (options.include_logs) {
        header.offset_logs = static_cast<uint64_t>(file.tellp());
        
        // Build JSON array of logs using direct iteration
        std::ostringstream logJson;
        logJson << "[";
        bool first = true;
        
        uint32_t totalLogs = LogBuffer::GetCount();
        for (uint32_t i = 0; i < totalLogs && i < LogBuffer::LOG_BUFFER_CAPACITY; i++) {
            const LogBuffer::LogEntry* entry = LogBuffer::g_logBuffer.getEntry(i);
            if (!entry || entry->payload_len == 0) continue;
            
            // Export all logs (timestamps are epoch ms, not relative)
            if (!first) logJson << ",";
            first = false;
            logJson << "{\"ts\":" << entry->timestamp_ms;
            logJson << ",\"type\":" << static_cast<int>(entry->type);
            logJson << ",\"msg\":\"";
            // Escape JSON string
            for (size_t j = 0; j < entry->payload_len && entry->payload[j]; j++) {
                char c = entry->payload[j];
                if (c == '"') logJson << "\\\"";
                else if (c == '\\') logJson << "\\\\";
                else if (c == '\n') logJson << "\\n";
                else if (c == '\r') logJson << "\\r";
                else if (c == '\t') logJson << "\\t";
                else if (c >= 32) logJson << c;
            }
            logJson << "\"}";
            result.log_count++;
        }
        
        logJson << "]";
        std::string logStr = logJson.str();
        
        // Write uncompressed for now
        header.size_logs = static_cast<uint32_t>(logStr.size());
        file.write(logStr.c_str(), logStr.size());
    }
    
    // ===== VIDEO BLOCK =====
    if (options.include_video && !options.video_path.empty()) {
        header.offset_video = static_cast<uint64_t>(file.tellp());
        
        // Open source video file
        std::ifstream videoFile(options.video_path, std::ios::binary | std::ios::ate);
        if (videoFile.is_open()) {
            // Get file size
            std::streamsize videoSize = videoFile.tellg();
            videoFile.seekg(0, std::ios::beg);
            
            // Chunked write to avoid loading entire video in memory
            const size_t CHUNK_SIZE = 64 * 1024; // 64KB chunks
            std::vector<char> buffer(CHUNK_SIZE);
            uint64_t bytesWritten = 0;
            
            while (videoFile.good() && bytesWritten < static_cast<uint64_t>(videoSize)) {
                size_t toRead = std::min(CHUNK_SIZE, static_cast<size_t>(videoSize - bytesWritten));
                videoFile.read(buffer.data(), toRead);
                std::streamsize bytesRead = videoFile.gcount();
                if (bytesRead > 0) {
                    file.write(buffer.data(), bytesRead);
                    bytesWritten += bytesRead;
                }
            }
            
            header.size_video = static_cast<uint32_t>(bytesWritten);
            result.video_packets = 1; // Treat entire MP4 as one "packet"
            videoFile.close();
        } else {
            result.error = "Failed to open video file";
        }
    }
    
    // ===== FINALIZE HEADER =====
    result.file_size = static_cast<uint64_t>(file.tellp());
    header.checksum = header.calculateChecksum();
    
    // Seek back and write final header
    file.seekp(0);
    file.write(reinterpret_cast<const char*>(&header), sizeof(Header));
    
    file.close();
    result.success = true;
    
    return result;
}

bool ValidateFile(const std::wstring& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return false;
    
    Header header;
    file.read(reinterpret_cast<char*>(&header), sizeof(Header));
    
    return header.validate();
}

} // namespace NetSurf

// ============ N-API WRAPPER ============
#include <napi.h>

// saveRecording(start_ms: number, end_ms: number, output_path: string, video_path?: string): Promise<ExportResult>
Napi::Value NetSurf_SaveRecording(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 3) {
        Napi::TypeError::New(env, "Expected at least 3 arguments: start_ms, end_ms, output_path")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
    
    // Extract arguments
    int32_t start_ms = info[0].As<Napi::Number>().Int32Value();
    int32_t end_ms = info[1].As<Napi::Number>().Int32Value();
    std::string output_path_utf8 = info[2].As<Napi::String>().Utf8Value();
    
    // Optional video path (4th argument)
    std::string video_path_utf8 = "";
    if (info.Length() >= 4 && info[3].IsString()) {
        video_path_utf8 = info[3].As<Napi::String>().Utf8Value();
    }
    
    // Convert to wide string for Windows
    std::wstring output_path(output_path_utf8.begin(), output_path_utf8.end());
    std::wstring video_path(video_path_utf8.begin(), video_path_utf8.end());
    
    // Create export options
    NetSurf::ExportOptions options;
    options.start_ms = start_ms;
    options.end_ms = end_ms;
    options.output_path = output_path;
    options.video_path = video_path;
    options.include_logs = true;
    options.include_video = !video_path.empty(); // Include video if path provided
    options.compress_logs = false; // Compression not yet implemented
    
    // Run export
    NetSurf::ExportResult result = NetSurf::Export(options);
    
    // Build result object
    Napi::Object resultObj = Napi::Object::New(env);
    resultObj.Set("success", Napi::Boolean::New(env, result.success));
    resultObj.Set("fileSize", Napi::Number::New(env, static_cast<double>(result.file_size)));
    resultObj.Set("logCount", Napi::Number::New(env, result.log_count));
    resultObj.Set("videoPackets", Napi::Number::New(env, result.video_packets));
    if (!result.error.empty()) {
        resultObj.Set("error", Napi::String::New(env, result.error));
    }
    
    return resultObj;
}
