/**
 * LOG BUFFER - Lock-Free Ring Buffer for CDP Logs
 * 
 * DESIGN CONSTRAINTS:
 * - Zero heap allocation on main thread
 * - Fixed-size entries (2048 bytes)
 * - Lock-free SPSC (single producer, single consumer)
 * - 5000 entry capacity (10 MB total)
 * 
 * DOES NOT MODIFY: DXGI, D3D device, encoder, GPU pipeline
 */

#pragma once

#include <cstdint>
#include <atomic>
#include <cstring>
#include <string>

namespace LogBuffer {

// ============ CONFIGURATION ============
constexpr uint32_t LOG_BUFFER_CAPACITY = 5000;
constexpr uint32_t LOG_PAYLOAD_SIZE = 2040;
constexpr uint32_t LOG_ENTRY_SIZE = 2048;  // Cache-line friendly

// ============ LOG TYPES ============
enum class LogType : uint8_t {
    CONSOLE = 0,
    NETWORK = 1,
    ERROR   = 2,
    WARNING = 3,
    INFO    = 4
};

// ============ LOG ENTRY (FIXED SIZE) ============
// Total: 2048 bytes - no heap allocation
#pragma pack(push, 1)
struct LogEntry {
    int32_t  timestamp_ms;           // 4 bytes - offset from recording start
    uint8_t  type;                   // 1 byte  - LogType enum
    uint16_t payload_len;            // 2 bytes - actual payload length
    uint8_t  _padding;               // 1 byte  - alignment padding
    char     payload[LOG_PAYLOAD_SIZE]; // 2040 bytes - fixed buffer
    
    // Initialize entry with truncation if needed
    void set(int32_t ts, LogType t, const char* data, size_t len) {
        timestamp_ms = ts;
        type = static_cast<uint8_t>(t);
        
        // Truncate if too long, leave room for "..."
        if (len > LOG_PAYLOAD_SIZE - 4) {
            payload_len = LOG_PAYLOAD_SIZE;
            memcpy(payload, data, LOG_PAYLOAD_SIZE - 4);
            payload[LOG_PAYLOAD_SIZE - 4] = '.';
            payload[LOG_PAYLOAD_SIZE - 3] = '.';
            payload[LOG_PAYLOAD_SIZE - 2] = '.';
            payload[LOG_PAYLOAD_SIZE - 1] = '\0';
        } else {
            payload_len = static_cast<uint16_t>(len);
            memcpy(payload, data, len);
            if (len < LOG_PAYLOAD_SIZE) {
                payload[len] = '\0';
            }
        }
    }
    
    void clear() {
        timestamp_ms = 0;
        type = 0;
        payload_len = 0;
        payload[0] = '\0';
    }
};
#pragma pack(pop)

// Compile-time verification
static_assert(sizeof(LogEntry) == LOG_ENTRY_SIZE, "LogEntry must be exactly 2048 bytes");

// ============ RING BUFFER ============
// Lock-free SPSC ring buffer with static allocation
class RingBuffer {
public:
    // Initialize buffer (call once at startup)
    void init();
    
    // Write entry (producer - main thread via N-API)
    // Returns: true if written, false if buffer corruption detected
    bool write(int32_t timestamp_ms, LogType type, const char* payload, size_t len);
    
    // Read entries in range (consumer - export worker thread)
    // Callback receives each entry in range
    uint32_t readRange(int32_t start_ms, int32_t end_ms, void(*cb)(const LogEntry&)) const;
    
    // Get current entry count (approximate)
    uint32_t count() const;
    
    // Clear all entries
    void clear();
    
    // Get entry at index (for debugging)
    const LogEntry* getEntry(uint32_t index) const;
    
    // Set recording start epoch (for computing relative timestamps)
    void setRecordingStartMs(int64_t epochMs);
    
    // Get recording start epoch
    int64_t getRecordingStartMs() const;
    
    // Read ALL entries in insertion order (for export)
    // Callback receives each entry. Returns count of entries read.
    uint32_t readAll(void(*cb)(const LogEntry&, void* userData), void* userData) const;
    
private:
    // Static buffer - NO HEAP ALLOCATION
    // Allocated in .bss section at process start
    LogEntry m_buffer[LOG_BUFFER_CAPACITY];
    
    // Atomic indices for lock-free operation
    std::atomic<uint32_t> m_writeIndex{0};
    std::atomic<uint32_t> m_entryCount{0};
    
    // Recording start time for relative timestamps
    int64_t m_recordingStartMs{0};
};

// ============ GLOBAL INSTANCE ============
// Single static instance - no dynamic allocation
extern RingBuffer g_logBuffer;

// ============ PUBLIC API ============
// Initialize log buffer (call before recording)
void Initialize();

// Push log entry from N-API (main thread)
bool PushLog(int32_t timestamp_ms, LogType type, const char* payload, size_t len);

// Get logs in time range (worker thread)
template<typename Callback>
uint32_t GetLogsInRange(int32_t start_ms, int32_t end_ms, Callback&& cb);

// Clear all logs
void Clear();

// Get approximate count
uint32_t GetCount();

// Set recording start epoch (for log-video timestamp correlation)
void SetRecordingStart(int64_t epochMs);

// Get recording start epoch  
int64_t GetRecordingStart();

// Get all logs as JSON string [{ts, type, msg}, ...]
// Timestamps are relative to recording start (ms)
std::string GetAllLogsJson();

} // namespace LogBuffer
