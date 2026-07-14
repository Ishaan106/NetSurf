/**
 * LOG BUFFER - Lock-Free Ring Buffer Implementation
 * 
 * ZERO HEAP ALLOCATION on main thread
 * Static 10MB buffer in .bss section
 */

#include "log_buffer.h"

namespace LogBuffer {

// ============ STATIC GLOBAL INSTANCE ============
// Allocated in .bss section - NO HEAP
RingBuffer g_logBuffer;

// ============ RING BUFFER IMPLEMENTATION ============

void RingBuffer::init() {
    m_writeIndex.store(0, std::memory_order_relaxed);
    m_entryCount.store(0, std::memory_order_relaxed);
    m_recordingStartMs = 0;
    
    // Clear buffer (optional, .bss is zero-initialized)
    for (uint32_t i = 0; i < LOG_BUFFER_CAPACITY; i++) {
        m_buffer[i].clear();
    }
}

bool RingBuffer::write(int32_t timestamp_ms, LogType type, const char* payload, size_t len) {
    // Get next write position (atomic increment with wrap)
    uint32_t idx = m_writeIndex.fetch_add(1, std::memory_order_relaxed) % LOG_BUFFER_CAPACITY;
    
    // Write entry (overwrites oldest if buffer full - FIFO)
    m_buffer[idx].set(timestamp_ms, type, payload, len);
    
    // Update count (capped at capacity)
    uint32_t current = m_entryCount.load(std::memory_order_relaxed);
    if (current < LOG_BUFFER_CAPACITY) {
        m_entryCount.fetch_add(1, std::memory_order_relaxed);
    }
    
    // Memory fence to ensure visibility to consumer
    std::atomic_thread_fence(std::memory_order_release);
    
    return true;
}

uint32_t RingBuffer::count() const {
    return m_entryCount.load(std::memory_order_acquire);
}

void RingBuffer::clear() {
    m_writeIndex.store(0, std::memory_order_relaxed);
    m_entryCount.store(0, std::memory_order_relaxed);
}

const LogEntry* RingBuffer::getEntry(uint32_t index) const {
    if (index >= LOG_BUFFER_CAPACITY) return nullptr;
    return &m_buffer[index];
}

void RingBuffer::setRecordingStartMs(int64_t epochMs) {
    m_recordingStartMs = epochMs;
}

int64_t RingBuffer::getRecordingStartMs() const {
    return m_recordingStartMs;
}

uint32_t RingBuffer::readAll(void(*cb)(const LogEntry&, void* userData), void* userData) const {
    std::atomic_thread_fence(std::memory_order_acquire);
    
    uint32_t total = m_entryCount.load(std::memory_order_relaxed);
    if (total == 0) return 0;
    
    // Calculate start position (oldest entry) for iteration
    uint32_t writePos = m_writeIndex.load(std::memory_order_relaxed);
    uint32_t startPos = (total >= LOG_BUFFER_CAPACITY)
        ? writePos % LOG_BUFFER_CAPACITY
        : 0;
    
    uint32_t count = 0;
    uint32_t iterCount = (total > LOG_BUFFER_CAPACITY) ? LOG_BUFFER_CAPACITY : total;
    
    for (uint32_t i = 0; i < iterCount; i++) {
        uint32_t idx = (startPos + i) % LOG_BUFFER_CAPACITY;
        const LogEntry& entry = m_buffer[idx];
        if (entry.payload_len > 0) {  // Skip empty entries
            if (cb) cb(entry, userData);
            count++;
        }
    }
    
    return count;
}

// readRange implementation - uses function pointer for simplicity
uint32_t RingBuffer::readRange(int32_t start_ms, int32_t end_ms, void(*cb)(const LogEntry&)) const {
    std::atomic_thread_fence(std::memory_order_acquire);
    
    uint32_t matched = 0;
    uint32_t total = m_entryCount.load(std::memory_order_relaxed);
    
    if (total == 0) return 0;
    
    // Calculate start position for iteration
    uint32_t writePos = m_writeIndex.load(std::memory_order_relaxed);
    uint32_t startPos = (total >= LOG_BUFFER_CAPACITY) 
        ? writePos % LOG_BUFFER_CAPACITY 
        : 0;
    
    // Iterate through valid entries
    for (uint32_t i = 0; i < total && i < LOG_BUFFER_CAPACITY; i++) {
        uint32_t idx = (startPos + i) % LOG_BUFFER_CAPACITY;
        const LogEntry& entry = m_buffer[idx];
        
        // Filter by timestamp range
        if (entry.timestamp_ms >= start_ms && entry.timestamp_ms <= end_ms) {
            if (cb) cb(entry);
            matched++;
        }
    }
    
    return matched;
}

// ============ PUBLIC API IMPLEMENTATION ============

void Initialize() {
    g_logBuffer.init();
}

bool PushLog(int32_t timestamp_ms, LogType type, const char* payload, size_t len) {
    return g_logBuffer.write(timestamp_ms, type, payload, len);
}

void Clear() {
    g_logBuffer.clear();
}

uint32_t GetCount() {
    return g_logBuffer.count();
}

void SetRecordingStart(int64_t epochMs) {
    g_logBuffer.setRecordingStartMs(epochMs);
}

int64_t GetRecordingStart() {
    return g_logBuffer.getRecordingStartMs();
}

// Helper: escape JSON string
static void jsonEscape(std::string& out, const char* str, size_t len) {
    out.push_back('"');
    for (size_t i = 0; i < len; i++) {
        char c = str[i];
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (c >= 0x20) {
                    out.push_back(c);
                }
                break;
        }
    }
    out.push_back('"');
}

static const char* logTypeToString(uint8_t type) {
    switch (static_cast<LogType>(type)) {
        case LogType::CONSOLE: return "console";
        case LogType::NETWORK: return "network";
        case LogType::ERROR:   return "error";
        case LogType::WARNING: return "warning";
        case LogType::INFO:    return "info";
        default:               return "unknown";
    }
}

std::string GetAllLogsJson() {
    int64_t recordingStartMs = g_logBuffer.getRecordingStartMs();
    
    std::string result;
    result.reserve(4096);
    result.push_back('[');
    
    bool first = true;
    
    auto callback = [](const LogEntry& entry, void* userData) {
        auto* state = static_cast<std::pair<std::string*, std::pair<bool*, int64_t>>*>(userData);
        std::string& out = *state->first;
        bool& isFirst = *state->second.first;
        int64_t startMs = state->second.second;
        
        if (!isFirst) out += ',';
        isFirst = false;
        
        // Compute relative timestamp (log epoch ms - recording start epoch ms)
        int32_t relativeMs = entry.timestamp_ms;
        if (startMs > 0) {
            relativeMs = static_cast<int32_t>(entry.timestamp_ms - static_cast<int32_t>(startMs & 0x7FFFFFFF));
        }
        
        out += "{\"ts\":";
        out += std::to_string(relativeMs);
        out += ",\"type\":\"";
        out += logTypeToString(entry.type);
        out += "\",\"msg\":";
        
        size_t payloadLen = entry.payload_len;
        if (payloadLen > LOG_PAYLOAD_SIZE) payloadLen = LOG_PAYLOAD_SIZE;
        jsonEscape(out, entry.payload, payloadLen);
        
        out += '}';
    };
    
    std::pair<bool*, int64_t> innerState = {&first, recordingStartMs};
    std::pair<std::string*, std::pair<bool*, int64_t>> state = {&result, innerState};
    
    g_logBuffer.readAll(callback, &state);
    
    result.push_back(']');
    return result;
}

} // namespace LogBuffer
