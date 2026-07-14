/**
 * NETWORK BUFFER - Implementation
 * Lock-free SPSC ring buffer for CDP network entries.
 * Matches LogBuffer pattern with larger entries (4KB) for URLs + headers.
 */

#include "network_buffer.h"
#include <algorithm>
#include <cstdio>

namespace NetworkBuffer {

// Global instance
RingBuffer g_networkBuffer;

// ============ RING BUFFER IMPLEMENTATION ============

void RingBuffer::init() {
    init(120); // Default: 2 minutes
}

void RingBuffer::init(int durationSeconds) {
    if (durationSeconds <= 0) durationSeconds = 120;

    // Calculate capacity: REQUESTS_PER_MINUTE * (duration in minutes), with minimum
    uint32_t durationMinutes = static_cast<uint32_t>((durationSeconds + 59) / 60);
    uint32_t cap = std::max(DEFAULT_CAPACITY, durationMinutes * REQUESTS_PER_MINUTE);
    cap = std::min(cap, MAX_CAPACITY);

    m_capacity = cap;
    m_buffer.resize(cap);

    // Clear all entries
    for (uint32_t i = 0; i < cap; i++) {
        m_buffer[i].clear();
    }

    m_writeIndex.store(0, std::memory_order_relaxed);
    m_entryCount.store(0, std::memory_order_relaxed);
    m_recordingStartMs = 0;

    printf("[NetworkBuffer] Initialized with capacity %u entries (%.1f MB) for %d seconds\n",
           cap, (cap * NET_ENTRY_SIZE) / (1024.0 * 1024.0), durationSeconds);
}

bool RingBuffer::write(int32_t timestamp_ms, const char* payload, size_t len) {
    if (m_capacity == 0) return false;

    uint32_t idx = m_writeIndex.load(std::memory_order_relaxed);
    m_buffer[idx].set(timestamp_ms, payload, len);

    m_writeIndex.store((idx + 1) % m_capacity, std::memory_order_release);

    uint32_t count = m_entryCount.load(std::memory_order_relaxed);
    if (count < m_capacity) {
        m_entryCount.store(count + 1, std::memory_order_relaxed);
    }

    return true;
}

uint32_t RingBuffer::count() const {
    return m_entryCount.load(std::memory_order_acquire);
}

void RingBuffer::clear() {
    m_writeIndex.store(0, std::memory_order_relaxed);
    m_entryCount.store(0, std::memory_order_relaxed);
    for (uint32_t i = 0; i < m_capacity; i++) {
        m_buffer[i].clear();
    }
}

uint32_t RingBuffer::capacity() const {
    return m_capacity;
}

void RingBuffer::setRecordingStartMs(int64_t epochMs) {
    m_recordingStartMs = epochMs;
}

int64_t RingBuffer::getRecordingStartMs() const {
    return m_recordingStartMs;
}

uint32_t RingBuffer::readAll(void(*cb)(const NetworkEntry&, void* userData), void* userData) const {
    uint32_t cnt = m_entryCount.load(std::memory_order_acquire);
    if (cnt == 0 || m_capacity == 0) return 0;

    // Read from oldest to newest
    uint32_t writeIdx = m_writeIndex.load(std::memory_order_acquire);
    uint32_t startIdx = (cnt < m_capacity) ? 0 : writeIdx;

    uint32_t read = 0;
    for (uint32_t i = 0; i < cnt; i++) {
        uint32_t idx = (startIdx + i) % m_capacity;
        if (m_buffer[idx].payload_len > 0) {
            cb(m_buffer[idx], userData);
            read++;
        }
    }
    return read;
}

// ============ HELPER: JSON escape ============
static void jsonEscapeAppend(std::string& out, const char* data, size_t len) {
    out.push_back('"');
    for (size_t i = 0; i < len; i++) {
        char c = data[i];
        if (c == '\0') break;
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20) {
                    char buf[8];
                    snprintf(buf, sizeof(buf), "\\u%04x", c);
                    out += buf;
                } else {
                    out.push_back(c);
                }
        }
    }
    out.push_back('"');
}

// ============ PUBLIC API ============

void Initialize() {
    g_networkBuffer.init();
}

void InitializeWithDuration(int durationSeconds) {
    g_networkBuffer.init(durationSeconds);
}

bool Push(int32_t timestamp_ms, const char* payload, size_t len) {
    return g_networkBuffer.write(timestamp_ms, payload, len);
}

void Clear() {
    g_networkBuffer.clear();
}

uint32_t GetCount() {
    return g_networkBuffer.count();
}

uint32_t GetCapacity() {
    return g_networkBuffer.capacity();
}

void SetRecordingStart(int64_t epochMs) {
    g_networkBuffer.setRecordingStartMs(epochMs);
}

int64_t GetRecordingStart() {
    return g_networkBuffer.getRecordingStartMs();
}

std::string GetAllJson() {
    int64_t recordingStartMs = g_networkBuffer.getRecordingStartMs();

    std::string result;
    result.reserve(8192);
    result.push_back('[');

    bool first = true;

    auto callback = [](const NetworkEntry& entry, void* userData) {
        auto* state = static_cast<std::pair<std::string*, std::pair<bool*, int64_t>>*>(userData);
        std::string& out = *state->first;
        bool& isFirst = *state->second.first;
        int64_t startMs = state->second.second;

        if (!isFirst) out += ',';
        isFirst = false;

        // Compute relative timestamp
        int32_t relativeMs = entry.timestamp_ms;
        if (startMs > 0) {
            relativeMs = static_cast<int32_t>(entry.timestamp_ms - static_cast<int32_t>(startMs & 0x7FFFFFFF));
        }

        // The payload is already a JSON object string, so embed it directly
        // Format: {"ts": relativeMs, "data": <payload>}
        out += "{\"ts\":";
        out += std::to_string(relativeMs);
        out += ",\"data\":";

        size_t payloadLen = entry.payload_len;
        if (payloadLen > NET_PAYLOAD_SIZE) payloadLen = NET_PAYLOAD_SIZE;

        // Payload is already JSON, append directly
        out.append(entry.payload, payloadLen);

        out += '}';
    };

    std::pair<bool*, int64_t> innerState = {&first, recordingStartMs};
    std::pair<std::string*, std::pair<bool*, int64_t>> state = {&result, innerState};

    g_networkBuffer.readAll(callback, &state);

    result.push_back(']');
    return result;
}

} // namespace NetworkBuffer
