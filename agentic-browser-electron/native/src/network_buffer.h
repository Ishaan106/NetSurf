/**
 * NETWORK BUFFER - Lock-Free Ring Buffer for CDP Network Entries
 * 
 * DESIGN CONSTRAINTS:
 * - Zero heap allocation on hot path
 * - Fixed-size entries (4096 bytes) for URLs + headers
 * - Lock-free SPSC (single producer, single consumer)
 * - Runtime-configurable capacity based on recording duration
 * - Matches LogBuffer pattern exactly
 * 
 * DOES NOT MODIFY: DXGI, D3D device, encoder, GPU pipeline
 */

#pragma once

#include <cstdint>
#include <atomic>
#include <cstring>
#include <string>
#include <vector>

namespace NetworkBuffer {

// ============ CONFIGURATION ============
constexpr uint32_t NET_PAYLOAD_SIZE = 4088;
constexpr uint32_t NET_ENTRY_SIZE  = 4096;  // Cache-line friendly

// Default: ~500 req/min * 2 min = 1000, with headroom
constexpr uint32_t DEFAULT_CAPACITY = 2000;
// Safety cap to prevent excessive allocation
constexpr uint32_t MAX_CAPACITY = 50000;
// Estimated requests per minute for capacity calculation
constexpr uint32_t REQUESTS_PER_MINUTE = 500;

// ============ NETWORK ENTRY (FIXED SIZE) ============
// Total: 4096 bytes - no heap allocation on hot path
#pragma pack(push, 1)
struct NetworkEntry {
    int32_t  timestamp_ms;               // 4 bytes - relative to recording start
    uint16_t payload_len;                // 2 bytes - actual JSON payload length
    uint8_t  _padding[2];               // 2 bytes - alignment
    char     payload[NET_PAYLOAD_SIZE];  // 4088 bytes - JSON string

    void set(int32_t ts, const char* data, size_t len) {
        timestamp_ms = ts;

        if (len > NET_PAYLOAD_SIZE - 4) {
            payload_len = NET_PAYLOAD_SIZE;
            memcpy(payload, data, NET_PAYLOAD_SIZE - 4);
            payload[NET_PAYLOAD_SIZE - 4] = '.';
            payload[NET_PAYLOAD_SIZE - 3] = '.';
            payload[NET_PAYLOAD_SIZE - 2] = '.';
            payload[NET_PAYLOAD_SIZE - 1] = '\0';
        } else {
            payload_len = static_cast<uint16_t>(len);
            memcpy(payload, data, len);
            if (len < NET_PAYLOAD_SIZE) {
                payload[len] = '\0';
            }
        }
    }

    void clear() {
        timestamp_ms = 0;
        payload_len = 0;
        payload[0] = '\0';
    }
};
#pragma pack(pop)

static_assert(sizeof(NetworkEntry) == NET_ENTRY_SIZE, "NetworkEntry must be exactly 4096 bytes");

// ============ RING BUFFER ============
// Lock-free SPSC ring buffer with dynamic allocation
class RingBuffer {
public:
    // Initialize with default capacity
    void init();

    // Initialize with duration-based capacity
    // capacity = max(DEFAULT_CAPACITY, durationSeconds / 60 * REQUESTS_PER_MINUTE)
    void init(int durationSeconds);

    // Write entry (producer - main thread via N-API)
    bool write(int32_t timestamp_ms, const char* payload, size_t len);

    // Get current entry count (approximate)
    uint32_t count() const;

    // Clear all entries
    void clear();

    // Get capacity
    uint32_t capacity() const;

    // Set recording start epoch
    void setRecordingStartMs(int64_t epochMs);

    // Get recording start epoch
    int64_t getRecordingStartMs() const;

    // Read ALL entries in chronological order (oldest → newest)
    // Callback receives each entry. Returns count read.
    uint32_t readAll(void(*cb)(const NetworkEntry&, void* userData), void* userData) const;

private:
    std::vector<NetworkEntry> m_buffer;
    uint32_t m_capacity{0};

    std::atomic<uint32_t> m_writeIndex{0};
    std::atomic<uint32_t> m_entryCount{0};

    int64_t m_recordingStartMs{0};
};

// ============ GLOBAL INSTANCE ============
extern RingBuffer g_networkBuffer;

// ============ PUBLIC API ============
void Initialize();
void InitializeWithDuration(int durationSeconds);
bool Push(int32_t timestamp_ms, const char* payload, size_t len);
void Clear();
uint32_t GetCount();
uint32_t GetCapacity();
void SetRecordingStart(int64_t epochMs);
int64_t GetRecordingStart();
std::string GetAllJson();

} // namespace NetworkBuffer
